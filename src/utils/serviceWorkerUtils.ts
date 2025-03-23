/**
 * Service Worker Utilities
 * Tools for managing service worker updates, refresh notifications,
 * and versioning in a PWA context.
 */

// Keep track of the update application state
let updateInProgress = false;

/**
 * Check if the service worker needs to be updated
 * @returns {Promise<boolean>} Whether a new version is available
 */
export async function checkForUpdates(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    // Get all service worker registrations
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) {
      return false;
    }

    // Check the main registration
    const registration = registrations[0];
    
    // Force an update check
    await registration.update();
    
    // Wait a moment for the update to be detected
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Return true if waiting service worker exists (new version ready)
    return !!registration.waiting;
  } catch (error) {
    console.error('Error checking for service worker updates:', error);
    return false;
  }
}

/**
 * Trigger an immediate update of the service worker
 * @returns {Promise<boolean>} Whether the update was triggered successfully
 */
export async function applyUpdate(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || updateInProgress) {
    return false;
  }

  updateInProgress = true;
  console.log('Applying service worker update...');

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) {
      updateInProgress = false;
      return false;
    }

    const registration = registrations[0];
    
    // If there's a waiting service worker, send message to skip waiting
    if (registration.waiting) {
      console.log('Found waiting service worker, sending SKIP_WAITING message');
      
      // Create a promise that will resolve when the service worker is activated
      const activationPromise = new Promise<boolean>((resolve) => {
        // Set a timeout in case the controllerchange event doesn't fire
        const timeout = setTimeout(() => {
          navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeHandler);
          console.warn('Service worker controllerchange event timed out');
          updateInProgress = false;
          resolve(false);
        }, 10000);
        
        // Handler for the controllerchange event
        function controllerChangeHandler() {
          clearTimeout(timeout);
          navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeHandler);
          console.log('Service worker controllerchange event fired');
          updateInProgress = false;
          resolve(true);
        }
        
        // Listen for the controllerchange event
        navigator.serviceWorker.addEventListener('controllerchange', controllerChangeHandler);
      });
      
      // Send the message to the service worker
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      
      // Return the result of the activation promise
      return await activationPromise;
    }
    
    console.log('No waiting service worker found');
    updateInProgress = false;
    return false;
  } catch (error) {
    console.error('Error applying service worker update:', error);
    updateInProgress = false;
    return false;
  }
}

/**
 * Clear the "update notification shown" flag to ensure user can see update notifications again
 */
export function resetUpdateNotificationState(): void {
  // Clear all update notification flags
  sessionStorage.removeItem('updateNotificationShown');
  sessionStorage.removeItem('dismissedUpdateNotification');
  localStorage.removeItem('lastUpdateNotificationTime');
  
  // Also clear the window property if it exists
  if (window && 'updateNotificationShown' in window) {
    (window as any).updateNotificationShown = undefined;
  }
  
  // Reset update in progress flag
  updateInProgress = false;
}

/**
 * Initialize service worker update handling
 * This should be called on app start
 */
export function initServiceWorkerUpdates(): void {
  // Clean up old notification state on page load
  // This ensures users will be notified again if they reload the page without updating 
  resetUpdateNotificationState();
  
  // Set up app update listener for service worker messages
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    // Listen for messages from the service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SW_ACTIVATED') {
        console.log('Received SW_ACTIVATED message from service worker:', event.data);
        
        // Show toast notification that update was applied
        window.dispatchEvent(new CustomEvent('show-toast', { 
          detail: { 
            message: `App updated to new version: ${event.data.version}`,
            type: 'success',
            duration: 3000
          } 
        }));
      }
    });
    
    // Set up controller change listener
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Controller changed, which means new service worker took over
      // Check if this was intentional via manual reload or triggered by skipWaiting
      if (!(document as any).isReloading) {
        // Page reload needed to ensure updated assets are used
        console.log('New service worker activated - reloading page');
        (document as any).isReloading = true;
        
        // Show brief toast before reloading
        window.dispatchEvent(new CustomEvent('show-toast', { 
          detail: { 
            message: 'Applying new version...',
            type: 'info',
            duration: 1000
          } 
        }));
        
        // Reload after a short delay to ensure the toast is shown
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    });
  }
}

/**
 * Trigger manual check for updates on demand
 * Can be used in settings or maintenance views
 */
export async function triggerManualUpdateCheck(): Promise<boolean> {
  // Clear notification state first to ensure notification would be shown
  resetUpdateNotificationState();
  
  // Check for updates
  const updateAvailable = await checkForUpdates();
  
  // If an update is available, trigger the notification
  if (updateAvailable) {
    window.dispatchEvent(new CustomEvent('sw-update-available'));
  }
  
  return updateAvailable;
} 