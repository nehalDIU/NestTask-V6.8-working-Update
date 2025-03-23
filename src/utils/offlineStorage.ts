/**
 * Utility functions for handling offline data storage using IndexedDB
 */

// IndexedDB database name and version
export const DB_NAME = 'nesttask_offline_db';
export const DB_VERSION = 3;

// Store names for different types of data
export const STORES = {
  TASKS: 'tasks',
  ROUTINES: 'routines',
  USER_DATA: 'userData',
  COURSES: 'courses',
  MATERIALS: 'materials',
  TEACHERS: 'teachers'
};

// Critical stores that need offline support
export const CRITICAL_STORES = [STORES.TASKS, STORES.ROUTINES, STORES.COURSES];

// Request persistent storage to prevent automatic cleanup
export const requestPersistentStorage = async () => {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log(`Persistent storage granted: ${isPersisted}`);
      return isPersisted;
    } catch (error) {
      console.error('Error requesting persistent storage:', error);
      return false;
    }
  }
  return false;
};

// Check available storage space
export const checkStorageSpace = async () => {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const {quota, usage} = await navigator.storage.estimate();
      const availableSpace = quota && usage ? quota - usage : 0;
      console.log(`Storage space - Total: ${quota}, Used: ${usage}, Available: ${availableSpace}`);
      return {quota, usage, availableSpace};
    } catch (error) {
      console.error('Error checking storage space:', error);
      return null;
    }
  }
  return null;
};

/**
 * Initialize the IndexedDB database
 */
export const openDatabase = () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event: Event) => {
      console.error('Error opening IndexedDB', event);
      reject('Error opening IndexedDB');
    };

    request.onsuccess = (event: Event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        // Initial schema setup
        if (!db.objectStoreNames.contains(STORES.TASKS)) {
          db.createObjectStore(STORES.TASKS, { keyPath: 'id' });
          console.log('Created tasks store');
        }
        if (!db.objectStoreNames.contains(STORES.ROUTINES)) {
          db.createObjectStore(STORES.ROUTINES, { keyPath: 'id' });
          console.log('Created routines store');
        }
        if (!db.objectStoreNames.contains(STORES.USER_DATA)) {
          db.createObjectStore(STORES.USER_DATA, { keyPath: 'id' });
          console.log('Created userData store');
        }
      }
      
      if (oldVersion < 2) {
        // Version 2 schema updates
        if (!db.objectStoreNames.contains(STORES.COURSES)) {
          db.createObjectStore(STORES.COURSES, { keyPath: 'id' });
          console.log('Created courses store');
        }
        if (!db.objectStoreNames.contains(STORES.MATERIALS)) {
          db.createObjectStore(STORES.MATERIALS, { keyPath: 'id' });
          console.log('Created materials store');
        }
      }
      
      if (oldVersion < 3) {
        // Version 3 schema updates
        if (!db.objectStoreNames.contains(STORES.TEACHERS)) {
          db.createObjectStore(STORES.TEACHERS, { keyPath: 'id' });
          console.log('Created teachers store');
        }
      }
    };
  });
};

/**
 * Check if a store is critical (needs offline support)
 * @param storeName The name of the store to check
 */
export const isCriticalStore = (storeName: string): boolean => {
  return CRITICAL_STORES.includes(storeName);
};

/**
 * Save data to IndexedDB
 * @param storeName The name of the store to save data to
 * @param data The data to save
 */
export async function saveToIndexedDB(storeName: string, data: any): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Add offline flag for critical stores
      if (isCriticalStore(storeName)) {
        // Mark data for offline sync
        const isArray = Array.isArray(data);
        const dataToSave = isArray ? data.map((item: any) => ({
          ...item,
          _lastUpdated: new Date().toISOString(),
          _needsSync: true
        })) : {
          ...data,
          _lastUpdated: new Date().toISOString(),
          _needsSync: true
        };
        
        // Log transaction start with priority notice
        console.debug(`Starting priority transaction to save data to ${storeName}`, {
          dataType: typeof data,
          isArray,
          itemCount: isArray ? dataToSave.length : 1,
          priority: 'critical'
        });
        
        // Save the data with offline flags
        if (isArray) {
          dataToSave.forEach(item => {
            store.put(item);
          });
        } else {
          store.put(dataToSave);
        }
      } else {
        // Log transaction start
        console.debug(`Starting transaction to save data to ${storeName}`, {
          dataType: typeof data,
          isArray: Array.isArray(data),
          itemCount: Array.isArray(data) ? data.length : 1
        });
        
        // Regular save for non-critical data
        if (Array.isArray(data)) {
          data.forEach(item => {
            store.put(item);
          });
        } else {
          store.put(data);
        }
      }
      
      transaction.oncomplete = () => {
        console.debug(`Successfully saved data to ${storeName}`);
        resolve();
      };
      
      transaction.onerror = (event) => {
        const error = (event.target as IDBTransaction).error;
        console.error(`Error saving to ${storeName}:`, {
          error,
          errorName: error?.name,
          errorMessage: error?.message,
          dataType: typeof data,
          isArray: Array.isArray(data),
          itemCount: Array.isArray(data) ? data.length : 1
        });
        reject(error);
      };
    });
  } catch (error) {
    console.error('IndexedDB save error:', {
      error,
      storeName,
      dataType: typeof data,
      isArray: Array.isArray(data),
      itemCount: Array.isArray(data) ? data.length : 1
    });
    throw error;
  }
}

/**
 * Get all data from a store in IndexedDB
 * @param storeName The name of the store to get data from
 */
export async function getAllFromIndexedDB(storeName: string): Promise<any[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const result = request.result;
        // Log with priority info if critical store
        console.debug(`Successfully retrieved data from ${storeName}`, {
          itemCount: result.length,
          priority: isCriticalStore(storeName) ? 'critical' : 'normal'
        });
        resolve(result);
      };
      
      request.onerror = (event) => {
        const error = (event.target as IDBRequest).error;
        console.error(`Error getting data from ${storeName}:`, {
          error,
          errorName: error?.name,
          errorMessage: error?.message
        });
        reject(error);
      };
    });
  } catch (error) {
    console.error('IndexedDB get error:', {
      error,
      storeName
    });
    return [];
  }
}

/**
 * Get a specific item by ID from IndexedDB
 * @param storeName The name of the store to get data from
 * @param id The ID of the item to get
 */
export async function getByIdFromIndexedDB(storeName: string, id: string): Promise<any> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);
      
      request.onsuccess = () => {
        console.debug(`Successfully retrieved item from ${storeName}`, {
          id,
          found: !!request.result
        });
        resolve(request.result);
      };
      
      request.onerror = (event) => {
        const error = (event.target as IDBRequest).error;
        console.error(`Error getting item from ${storeName}:`, {
          error,
          errorName: error?.name,
          errorMessage: error?.message,
          id
        });
        reject(error);
      };
    });
  } catch (error) {
    console.error('IndexedDB get by ID error:', {
      error,
      storeName,
      id
    });
    return null;
  }
}

/**
 * Delete data from IndexedDB
 * @param storeName The name of the store to delete data from
 * @param id The ID of the item to delete
 */
export async function deleteFromIndexedDB(storeName: string, id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);
      
      request.onsuccess = () => {
        console.debug(`Successfully deleted item from ${storeName}`, { id });
        resolve();
      };
      
      request.onerror = (event) => {
        const error = (event.target as IDBRequest).error;
        console.error(`Error deleting from ${storeName}:`, {
          error,
          errorName: error?.name,
          errorMessage: error?.message,
          id
        });
        reject(error);
      };
    });
  } catch (error) {
    console.error('IndexedDB delete error:', {
      error,
      storeName,
      id
    });
    throw error;
  }
}

/**
 * Clear all data from a store in IndexedDB
 * @param storeName The name of the store to clear
 */
export async function clearIndexedDBStore(storeName: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      
      request.onsuccess = () => {
        console.debug(`Successfully cleared ${storeName} store`);
        resolve();
      };
      
      request.onerror = (event) => {
        const error = (event.target as IDBRequest).error;
        console.error(`Error clearing ${storeName}:`, {
          error,
          errorName: error?.name,
          errorMessage: error?.message
        });
        reject(error);
      };
    });
  } catch (error) {
    console.error('IndexedDB clear error:', {
      error,
      storeName
    });
    throw error;
  }
} 