import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { 
  fetchRoutines,
  createRoutine as createRoutineService,
  updateRoutine as updateRoutineService,
  deleteRoutine as deleteRoutineService,
  addRoutineSlot as addRoutineSlotService,
  updateRoutineSlot as updateRoutineSlotService,
  deleteRoutineSlot as deleteRoutineSlotService,
  activateRoutine as activateRoutineService,
  deactivateRoutine as deactivateRoutineService,
  bulkImportRoutineSlots as bulkImportRoutineSlotsService,
  exportRoutineWithSlots as exportRoutineWithSlotsService,
  getAllSemesters as getAllSemestersService,
  getRoutinesBySemester as getRoutinesBySemesterService
} from '../services/routine.service';
import type { Routine, RoutineSlot } from '../types/routine';
import { useOfflineStatus } from './useOfflineStatus';
import { saveToIndexedDB, getAllFromIndexedDB, STORES, getByIdFromIndexedDB, clearIndexedDBStore } from '../utils/offlineStorage';

// Define timestamp for cached data
const CACHE_TIMESTAMP_KEY = 'routines_last_fetched';

export function useRoutines() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const isOffline = useOfflineStatus();

  /**
   * Loads routines from the server or IndexedDB when offline
   */
  const loadRoutines = useCallback(async () => {
    setLoading(true);
    try {
      if (isOffline) {
        console.log('Loading routines from IndexedDB (offline)');
        const storedRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
        console.log(`Found ${storedRoutines?.length || 0} routines in IndexedDB`);
        
        // Process offline routines to ensure proper structure
        const processedRoutines = storedRoutines?.map(routine => ({
          ...routine,
          slots: routine.slots?.filter((slot: RoutineSlot) => !slot._isOfflineDeleted) || []
        })) || [];
        
        setRoutines(processedRoutines);
      } else {
        console.log('Loading routines from server');
        const data = await fetchRoutines();
        
        // Process the routines to ensure all necessary properties exist
        const processedRoutines = data.map((routine: Routine) => ({
          ...routine,
          slots: routine.slots || []
        }));
        
        setRoutines(processedRoutines);
        
        // Save to IndexedDB for offline use even for admin users
        await saveToIndexedDB(STORES.ROUTINES, processedRoutines);
        console.log(`Saved ${processedRoutines.length} routines to IndexedDB`);
      }
    } catch (error) {
      console.error('Error loading routines:', error);
      setError('Failed to load routines. Please try again later.');
      
      // If we failed to load from server, try loading from IndexedDB as fallback
      if (!isOffline) {
        try {
          console.log('Trying to load routines from IndexedDB as fallback');
          const storedRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
          if (storedRoutines?.length) {
            console.log(`Found ${storedRoutines.length} routines in IndexedDB`);
            setRoutines(storedRoutines);
          }
        } catch (fallbackError) {
          console.error('Fallback error loading routines from IndexedDB:', fallbackError);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [isOffline]);

  useEffect(() => {
    loadRoutines();

    // Only subscribe to changes when online
    if (!isOffline) {
      const subscription = supabase
        .channel('routines')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'routines'
          },
          () => {
            loadRoutines(); // Force refresh on database changes
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [isOffline, loadRoutines]);

  // Enhanced offline sync with improved progress tracking and error handling
  const syncOfflineChanges = async () => {
    if (isOffline || syncInProgress) return; // Only sync when online and not already syncing
    
    try {
      setSyncInProgress(true);
      console.log('Starting routine sync process...');
      
      const offlineRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
      let syncedRoutines = [...offlineRoutines];
      let hasChanges = false;
      let syncErrors = 0;
      
      // Process each routine for offline changes
      for (const routine of offlineRoutines) {
        // Skip routines without offline changes
        if (!routine._isOffline && 
            !routine._isOfflineUpdated && 
            !routine._isOfflineDeleted && 
            !routine._needsActivationSync && 
            !routine._needsDeactivationSync && 
            !routine.slots?.some((slot: RoutineSlot) => slot._isOffline || slot._isOfflineUpdated || slot._isOfflineDeleted)) {
          continue;
        }
        
        console.log(`Syncing routine: ${routine.id} (${routine.name})`);
        
        // Handle routine deletions
        if (routine._isOfflineDeleted) {
          try {
            await deleteRoutineService(routine.id);
            syncedRoutines = syncedRoutines.filter(r => r.id !== routine.id);
            hasChanges = true;
            console.log(`Deleted routine: ${routine.id}`);
          } catch (err) {
            console.error(`Failed to sync delete for routine ${routine.id}:`, err);
            syncErrors++;
          }
          continue;
        }
        
        // Handle new routines created offline
        if (routine._isOffline) {
          try {
            // Remove offline flags and generate clean data
            const { _isOffline, id, ...routineData } = routine;
            const newRoutine = await createRoutineService(routineData);
            
            // Replace the temp routine with the server one
            syncedRoutines = syncedRoutines.filter(r => r.id !== routine.id);
            syncedRoutines.push(newRoutine);
            hasChanges = true;
            console.log(`Created new routine: ${newRoutine.id} (replaced temp: ${routine.id})`);
          } catch (err) {
            console.error(`Failed to sync new routine ${routine.id}:`, err);
            syncErrors++;
          }
          continue;
        }
        
        // Handle routine updates
        if (routine._isOfflineUpdated) {
          try {
            // Create a clean version without offline flags
            const { _isOfflineUpdated, _isOffline, _needsActivationSync, _needsDeactivationSync, slots, ...routineData } = routine;
            await updateRoutineService(routine.id, routineData);
            
            // Update the synced version
            const index = syncedRoutines.findIndex(r => r.id === routine.id);
            if (index >= 0) {
              syncedRoutines[index] = { 
                ...syncedRoutines[index], 
                ...routineData,
                _isOfflineUpdated: undefined 
              };
              hasChanges = true;
            }
            console.log(`Updated routine: ${routine.id}`);
          } catch (err) {
            console.error(`Failed to sync routine update ${routine.id}:`, err);
            syncErrors++;
          }
        }
        
        // Handle activation/deactivation
        if (routine._needsActivationSync) {
          try {
            await activateRoutineService(routine.id);
            
            // Update all routines to reflect the new active state
            syncedRoutines = syncedRoutines.map(r => ({
              ...r,
              isActive: r.id === routine.id,
              _needsActivationSync: undefined,
              _needsDeactivationSync: undefined
            }));
            
            hasChanges = true;
            console.log(`Activated routine: ${routine.id}`);
          } catch (err) {
            console.error(`Failed to sync routine activation ${routine.id}:`, err);
            syncErrors++;
          }
        } else if (routine._needsDeactivationSync) {
          try {
            await deactivateRoutineService(routine.id);
            
            // Update the routine to reflect deactivation
            const index = syncedRoutines.findIndex(r => r.id === routine.id);
            if (index >= 0) {
              syncedRoutines[index] = {
                ...syncedRoutines[index],
                isActive: false,
                _needsDeactivationSync: undefined
              };
              hasChanges = true;
            }
            
            console.log(`Deactivated routine: ${routine.id}`);
          } catch (err) {
            console.error(`Failed to sync routine deactivation ${routine.id}:`, err);
            syncErrors++;
          }
        }
        
        // Handle slot changes if routine has slots
        if (routine.slots && routine.slots.length > 0) {
          let slotChanges = false;
          
          // Handle slot creation and updates
          for (const slot of routine.slots) {
            // Handle newly created slots
            if (slot._isOffline) {
              try {
                // Remove offline flags
                const { _isOffline, id, ...slotData } = slot;
                
                // Create the slot on the server
                const newSlot = await addRoutineSlotService(routine.id, slotData);
                
                // Update the slot list
                const routineIndex = syncedRoutines.findIndex(r => r.id === routine.id);
                if (routineIndex >= 0) {
                  // Remove the temp slot and add the new one
                  syncedRoutines[routineIndex].slots = syncedRoutines[routineIndex].slots.filter(s => s.id !== slot.id);
                  syncedRoutines[routineIndex].slots.push(newSlot);
                  slotChanges = true;
                }
                
                console.log(`Created slot for routine ${routine.id}: ${newSlot.id}`);
              } catch (err) {
                console.error(`Failed to sync new slot for routine ${routine.id}:`, err);
                syncErrors++;
              }
              continue;
            }
            
            // Handle updated slots
            if (slot._isOfflineUpdated) {
              try {
                // Remove offline flags
                const { _isOfflineUpdated, _isOffline, ...slotData } = slot;
                
                // Update the slot on the server
                await updateRoutineSlotService(routine.id, slot.id, slotData);
                
                // Update the slot in the local data
                const routineIndex = syncedRoutines.findIndex(r => r.id === routine.id);
                if (routineIndex >= 0) {
                  const slotIndex = syncedRoutines[routineIndex].slots.findIndex(s => s.id === slot.id);
                  if (slotIndex >= 0) {
                    syncedRoutines[routineIndex].slots[slotIndex] = {
                      ...syncedRoutines[routineIndex].slots[slotIndex],
                      ...slotData,
                      _isOfflineUpdated: undefined
                    };
                    slotChanges = true;
                  }
                }
                
                console.log(`Updated slot for routine ${routine.id}: ${slot.id}`);
              } catch (err) {
                console.error(`Failed to sync slot update for routine ${routine.id}, slot ${slot.id}:`, err);
                syncErrors++;
              }
              continue;
            }
            
            // Handle deleted slots
            if (slot._isOfflineDeleted) {
              try {
                await deleteRoutineSlotService(routine.id, slot.id);
                
                // Remove the slot from the local data
                const routineIndex = syncedRoutines.findIndex(r => r.id === routine.id);
                if (routineIndex >= 0) {
                  syncedRoutines[routineIndex].slots = syncedRoutines[routineIndex].slots.filter(s => s.id !== slot.id);
                  slotChanges = true;
                }
                
                console.log(`Deleted slot for routine ${routine.id}: ${slot.id}`);
              } catch (err) {
                console.error(`Failed to sync slot deletion for routine ${routine.id}, slot ${slot.id}:`, err);
                syncErrors++;
              }
            }
          }
          
          if (slotChanges) {
            hasChanges = true;
          }
        }
      }
      
      // If there were any changes, update IndexedDB
      if (hasChanges) {
        console.log('Updating IndexedDB with synced routines...');
        await clearIndexedDBStore(STORES.ROUTINES);
        await saveToIndexedDB(STORES.ROUTINES, syncedRoutines);
        
        // Update state
        setRoutines(syncedRoutines);
        
        console.log('Routine sync completed successfully');
      } else {
        console.log('No routine changes to sync');
      }
      
      if (syncErrors > 0) {
        console.warn(`Routine sync completed with ${syncErrors} errors`);
      }
      
      // Return true if fully successful, false if there were errors
      return syncErrors === 0;
    } catch (err) {
      console.error('Error syncing offline routine changes:', err);
      setError('Failed to sync offline changes');
      return false;
    } finally {
      setSyncInProgress(false);
    }
  };

  const createRoutine = async (routine: Omit<Routine, 'id' | 'createdAt'>) => {
    try {
      setError(null);
      
      if (isOffline) {
        // In offline mode, create a temporary ID and store locally
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const offlineRoutine: Routine = {
          ...routine,
          id: tempId,
          createdAt: new Date().toISOString(),
          slots: [],
          _isOffline: true // Mark as created offline for sync later
        };
        
        await saveToIndexedDB(STORES.ROUTINES, offlineRoutine);
        setRoutines(prev => [offlineRoutine, ...prev]);
        return offlineRoutine;
      } else {
        // Online mode - create on server
        const newRoutine = await createRoutineService(routine);
        setRoutines(prev => [newRoutine, ...prev]);
        
        // Update in IndexedDB
        await saveToIndexedDB(STORES.ROUTINES, newRoutine);
        
        return newRoutine;
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const updateRoutine = async (id: string, updates: Partial<Routine>) => {
    try {
      setError(null);
      
      if (isOffline) {
        // In offline mode, update local copy
        const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
        const routineToUpdate = existingRoutines.find((r: Routine) => r.id === id);
        
        if (routineToUpdate) {
          const updatedRoutine = { ...routineToUpdate, ...updates, _isOfflineUpdated: true };
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutine);
          
          setRoutines(prev =>
            prev.map(routine =>
              routine.id === id ? { ...routine, ...updates } : routine
            )
          );
          
          return updatedRoutine;
        }
        
        throw new Error('Routine not found in offline storage');
      } else {
        // Online mode - update on server
        await updateRoutineService(id, updates);
        
        setRoutines(prev =>
          prev.map(routine =>
            routine.id === id ? { ...routine, ...updates } : routine
          )
        );
        
        // Update in IndexedDB
        const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
        const routineToUpdate = existingRoutines.find((r: Routine) => r.id === id);
        
        if (routineToUpdate) {
          const updatedRoutine = { ...routineToUpdate, ...updates };
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutine);
          return updatedRoutine;
        }
        
        return null;
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const deleteRoutine = async (id: string) => {
    try {
      setError(null);
      
      if (isOffline) {
        // In offline mode, mark for deletion but don't remove from IndexedDB yet
        // Instead, we'll add a flag to delete it when back online
        const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
        const routineToDelete = existingRoutines.find((r: Routine) => r.id === id);
        
        if (routineToDelete) {
          const markedRoutine = { ...routineToDelete, _isOfflineDeleted: true };
          await saveToIndexedDB(STORES.ROUTINES, markedRoutine);
        }
        
        // Remove from state
        setRoutines(prev => prev.filter(routine => routine.id !== id));
        return true;
      } else {
        // Online mode - delete from server
        await deleteRoutineService(id);
        
        // Remove from state
        setRoutines(prev => prev.filter(routine => routine.id !== id));
        
        // Properly clean up IndexedDB to prevent deleted routines from reappearing
        try {
          // Get all routines from IndexedDB
          const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
          
          // Remove the deleted routine from the array
          const filteredRoutines = existingRoutines.filter((r: Routine) => r.id !== id);
          
          // Clear the store and save the filtered routines
          await clearIndexedDBStore(STORES.ROUTINES);
          
          // If there are remaining routines, save them back
          if (filteredRoutines.length > 0) {
            await saveToIndexedDB(STORES.ROUTINES, filteredRoutines);
          }
          
          // Force cache invalidation by updating the timestamp
          localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          
          console.log(`Routine ${id} successfully deleted from IndexedDB`);
          return true;
        } catch (dbErr) {
          console.error('Error updating IndexedDB after deletion:', dbErr);
          return false;
        }
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const addRoutineSlot = async (routineId: string, slotData: Omit<RoutineSlot, 'id' | 'routineId' | 'createdAt'>) => {
    try {
      setError(null);
      
      if (isOffline) {
        // In offline mode, create with a temporary ID
        const tempId = `temp-slot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const newSlot: RoutineSlot = {
          ...slotData,
          id: tempId,
          routineId,
          createdAt: new Date().toISOString(),
          _isOffline: true
        };
        
        // Find the routine in state
        const routine = routines.find(r => r.id === routineId);
        
        if (!routine) {
          throw new Error('Routine not found');
        }
        
        // Add slot to the routine
        const updatedRoutine = {
          ...routine,
          slots: [...(routine.slots || []), newSlot]
        };
        
        // Update in IndexedDB
        await saveToIndexedDB(STORES.ROUTINES, updatedRoutine);
        
        // Update state
        setRoutines(prev => prev.map(r => r.id === routineId ? updatedRoutine : r));
        
        return newSlot;
      } else {
        // Online mode - create on server
        const newSlot = await addRoutineSlotService(routineId, slotData);
        
        // Find the routine in state
        const routine = routines.find(r => r.id === routineId);
        
        if (routine) {
          // Add slot to the routine
          const updatedRoutine = {
            ...routine,
            slots: [...(routine.slots || []), newSlot]
          };
          
          // Update state
          setRoutines(prev => prev.map(r => r.id === routineId ? updatedRoutine : r));
          
          // Update in IndexedDB
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutine);
        }
        
        return newSlot;
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const updateRoutineSlot = async (routineId: string, slotId: string, updates: Partial<RoutineSlot>) => {
    try {
      setError(null);
      
      if (isOffline) {
        // In offline mode, update locally
        // Find the routine in IndexedDB
        const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
        const routine = existingRoutines.find((r: Routine) => r.id === routineId);
        
        if (!routine || !routine.slots) {
          throw new Error('Routine or slots not found');
        }
        
        // Find and update the slot
        const updatedSlots = routine.slots.map(slot => {
          if (slot.id === slotId) {
            return { ...slot, ...updates, _isOfflineUpdated: true };
          }
          return slot;
        });
        
        // Update the routine with new slots
        const updatedRoutine = { ...routine, slots: updatedSlots };
        
        // Save to IndexedDB
        await saveToIndexedDB(STORES.ROUTINES, updatedRoutine);
        
        // Update state
        setRoutines(prev => prev.map(r => {
          if (r.id === routineId) {
            return {
              ...r,
              slots: (r.slots || []).map(slot => {
                if (slot.id === slotId) {
                  return { ...slot, ...updates };
                }
                return slot;
              })
            };
          }
          return r;
        }));
      } else {
        // Online mode - update on server
        await updateRoutineSlotService(routineId, slotId, updates);
        
        // Update state
        setRoutines(prev => prev.map(r => {
          if (r.id === routineId) {
            return {
              ...r,
              slots: (r.slots || []).map(slot => {
                if (slot.id === slotId) {
                  return { ...slot, ...updates };
                }
                return slot;
              })
            };
          }
          return r;
        }));
        
        // Update IndexedDB
        const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
        const routineToUpdate = existingRoutines.find((r: Routine) => r.id === routineId);
        
        if (routineToUpdate && routineToUpdate.slots) {
          const updatedSlots = routineToUpdate.slots.map(slot => {
            if (slot.id === slotId) {
              return { ...slot, ...updates };
            }
            return slot;
          });
          
          const updatedRoutine = { ...routineToUpdate, slots: updatedSlots };
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutine);
        }
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const deleteRoutineSlot = async (routineId: string, slotId: string) => {
    try {
      setError(null);
      
      if (isOffline) {
        // In offline mode, mark for deletion
        const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
        const routine = existingRoutines.find((r: Routine) => r.id === routineId);
        
        if (!routine || !routine.slots) {
          throw new Error('Routine or slots not found');
        }
        
        // Check if this is an offline-created slot (temp ID)
        const isOfflineSlot = slotId.startsWith('temp-slot-');
        
        if (isOfflineSlot) {
          // For offline-created slots, just remove them
          const updatedSlots = routine.slots.filter(slot => slot.id !== slotId);
          const updatedRoutine = { ...routine, slots: updatedSlots };
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutine);
        } else {
          // For server slots, mark for deletion
          const updatedSlots = routine.slots.map(slot => {
            if (slot.id === slotId) {
              return { ...slot, _isOfflineDeleted: true };
            }
            return slot;
          });
          
          const updatedRoutine = { ...routine, slots: updatedSlots };
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutine);
        }
        
        // Update state - remove the slot
        setRoutines(prev => prev.map(r => {
          if (r.id === routineId) {
            return {
              ...r,
              slots: (r.slots || []).filter(slot => slot.id !== slotId)
            };
          }
          return r;
        }));
      } else {
        // Online mode - delete from server
        await deleteRoutineSlotService(routineId, slotId);
        
        // Update state
        setRoutines(prev => prev.map(r => {
          if (r.id === routineId) {
            return {
              ...r,
              slots: (r.slots || []).filter(slot => slot.id !== slotId)
            };
          }
          return r;
        }));
        
        // Update IndexedDB
        const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
        const routineToUpdate = existingRoutines.find((r: Routine) => r.id === routineId);
        
        if (routineToUpdate && routineToUpdate.slots) {
          const updatedSlots = routineToUpdate.slots.filter(slot => slot.id !== slotId);
          const updatedRoutine = { ...routineToUpdate, slots: updatedSlots };
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutine);
        }
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  return {
    routines,
    loading,
    error,
    syncInProgress,
    loadRoutines,
    syncOfflineChanges,
    createRoutine,
    updateRoutine,
    deleteRoutine,
    addRoutineSlot,
    updateRoutineSlot,
    deleteRoutineSlot,
    activateRoutine: async (routineId: string) => {
      try {
        setError(null);
        
        if (isOffline) {
          // When offline, just update state but mark for syncing later
          setRoutines(prev => 
            prev.map(routine => ({
              ...routine,
              isActive: routine.id === routineId,
              _needsActivationSync: routine.id === routineId ? true : undefined
            }))
          );
          
          // Update IndexedDB
          const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
          const updatedRoutines = existingRoutines.map((routine: Routine) => ({
            ...routine,
            isActive: routine.id === routineId,
            _needsActivationSync: routine.id === routineId ? true : undefined
          }));
          
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutines);
        } else {
          // Online mode, use the service
          await activateRoutineService(routineId);
          
          // Update state
          setRoutines(prev => 
            prev.map(routine => ({
              ...routine,
              isActive: routine.id === routineId
            }))
          );
          
          // Update in IndexedDB
          const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
          const updatedRoutines = existingRoutines.map((routine: Routine) => ({
            ...routine,
            isActive: routine.id === routineId
          }));
          
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutines);
        }
      } catch (err: any) {
        setError(err.message);
        throw err;
      }
    },
    deactivateRoutine: async (routineId: string) => {
      try {
        setError(null);
        
        if (isOffline) {
          // When offline, just update state but mark for syncing later
          setRoutines(prev => 
            prev.map(routine => ({
              ...routine,
              isActive: routine.id === routineId ? false : routine.isActive,
              _needsDeactivationSync: routine.id === routineId ? true : undefined
            }))
          );
          
          // Update IndexedDB
          const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
          const updatedRoutines = existingRoutines.map((routine: Routine) => ({
            ...routine,
            isActive: routine.id === routineId ? false : routine.isActive,
            _needsDeactivationSync: routine.id === routineId ? true : undefined
          }));
          
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutines);
        } else {
          // Online mode, use the service
          await deactivateRoutineService(routineId);
          
          // Update state
          setRoutines(prev => 
            prev.map(routine => ({
              ...routine,
              isActive: routine.id === routineId ? false : routine.isActive
            }))
          );
          
          // Update in IndexedDB
          const existingRoutines = await getAllFromIndexedDB(STORES.ROUTINES);
          const updatedRoutines = existingRoutines.map((routine: Routine) => ({
            ...routine,
            isActive: routine.id === routineId ? false : routine.isActive
          }));
          
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutines);
        }
      } catch (err: any) {
        setError(err.message);
        throw err;
      }
    },
    bulkImportRoutineSlots: async (routineId: string, slots: Omit<RoutineSlot, 'id' | 'routineId' | 'createdAt'>[]) => {
      try {
        setError(null);
        
        if (isOffline) {
          // When offline, create with temporary IDs
          const newSlots = slots.map(slotData => ({
            ...slotData,
            id: `temp-slot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            routineId,
            createdAt: new Date().toISOString(),
            _isOffline: true
          }));
          
          // Find the routine in state
          const routine = routines.find(r => r.id === routineId);
          
          if (!routine) {
            throw new Error('Routine not found');
          }
          
          // Add slots to the routine
          const updatedRoutine = {
            ...routine,
            slots: [...(routine.slots || []), ...newSlots]
          };
          
          // Update in IndexedDB
          await saveToIndexedDB(STORES.ROUTINES, updatedRoutine);
          
          // Update state
          setRoutines(prev => prev.map(r => r.id === routineId ? updatedRoutine : r));
          
          return newSlots;
        } else {
          // Online mode, bulk import server-side
          const newSlots = await bulkImportRoutineSlotsService(routineId, slots);
          
          // Find the routine in state
          const routine = routines.find(r => r.id === routineId);
          
          if (routine) {
            // Add slots to the routine
            const updatedRoutine = {
              ...routine,
              slots: [...(routine.slots || []), ...newSlots]
            };
            
            // Update state
            setRoutines(prev => prev.map(r => r.id === routineId ? updatedRoutine : r));
            
            // Update in IndexedDB
            await saveToIndexedDB(STORES.ROUTINES, updatedRoutine);
          }
          
          return newSlots;
        }
      } catch (err: any) {
        setError(err.message);
        throw err;
      }
    },
    exportRoutineWithSlots: async (routineId: string) => {
      try {
        if (isOffline) {
          // When offline, export directly from state
          const routine = routines.find(r => r.id === routineId);
          if (!routine) {
            throw new Error('Routine not found');
          }
          return routine;
        } else {
          // Online mode, export from server
          return await exportRoutineWithSlotsService(routineId);
        }
      } catch (err: any) {
        setError(err.message);
        throw err;
      }
    },
    getAllSemesters: async () => {
      try {
        if (isOffline) {
          // When offline, extract from existing routines
          const semesters = [...new Set(routines.map(r => r.semester))];
          return semesters;
        } else {
          // Online mode, get from server
          return await getAllSemestersService();
        }
      } catch (err: any) {
        setError(err.message);
        throw err;
      }
    },
    getRoutinesBySemester: async (semester: string) => {
      try {
        if (isOffline) {
          // When offline, filter from existing routines
          return routines.filter(r => r.semester === semester);
        } else {
          // Online mode, get from server
          return await getRoutinesBySemesterService(semester);
        }
      } catch (err: any) {
        setError(err.message);
        throw err;
      }
    }
  };
}