/**
 * Service Worker registration and offline support utilities
 */

// Common route patterns that we can predict and precache
const PREDICTABLE_ROUTES = [
  '/tasks',
  '/routines',
  '/courses',
  '/dashboard'
];

// Service worker registration and management utilities

// Register service worker
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker is not supported in this browser');
    return null;
  }

  try {
    // Check if a service worker is already registered
    const registrations = await navigator.serviceWorker.getRegistrations();
    const existingRegistration = registrations.find(
      (reg) => reg.active && reg.scope.includes(window.location.origin)
    );

    if (existingRegistration) {
      console.log('Using existing service worker registration');
      return existingRegistration;
    }

    // Register a new service worker
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
    });

    console.log('Service worker registered with scope:', registration.scope);
    return registration;
  } catch (error) {
    console.error('Service worker registration failed:', error);
    return null;
  }
};

// Keep service worker alive with periodic pings
export const keepServiceWorkerAlive = (registration: ServiceWorkerRegistration): void => {
  // Set ping interval to 5 minutes by default
  const PING_INTERVAL = 5 * 60 * 1000;
  
  // Function to ping the service worker
  const pingServiceWorker = () => {
    if (registration && registration.active) {
      // Send a simple message to the service worker
      registration.active.postMessage({ type: 'PING' });
      console.debug('Service worker ping sent');
    }
  };

  // Initial ping
  pingServiceWorker();

  // Set up interval for regular pings
  const intervalId = setInterval(pingServiceWorker, PING_INTERVAL);

  // Clear interval when window is unloaded
  window.addEventListener('beforeunload', () => {
    clearInterval(intervalId);
  });
};

// Update the service worker when a new version is available
export const updateServiceWorker = (registration: ServiceWorkerRegistration): void => {
  if (registration && registration.waiting) {
    // Send message to the waiting service worker to activate it
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
};

// Check for updates
export const checkForUpdates = (registration: ServiceWorkerRegistration): void => {
  if (registration) {
    registration.update().catch((error) => {
      console.error('Service worker update check failed:', error);
    });
  }
};

// Handle connectivity changes
export const handleConnectivityChange = (registration: ServiceWorkerRegistration): void => {
  // When online, check for updates
  window.addEventListener('online', () => {
    console.log('Device is online. Checking for service worker updates...');
    checkForUpdates(registration);
  });

  // When offline, notify the service worker
  window.addEventListener('offline', () => {
    if (registration && registration.active) {
      registration.active.postMessage({ type: 'OFFLINE_MODE' });
    }
  });
};

// Listen for service worker update events
export const listenForUpdates = (callback: (registration: ServiceWorkerRegistration) => void): void => {
  if (!('serviceWorker' in navigator)) return;

  // Listen for the custom event from the service worker
  window.addEventListener('sw-update-available', ((event: CustomEvent) => {
    if (event.detail && event.detail.registration) {
      callback(event.detail.registration);
    }
  }) as EventListener);
};

// Force reload after service worker update
export const reloadAfterUpdate = (): void => {
  window.location.reload();
};

// Clear service worker caches
export const clearServiceWorkerCaches = async (): Promise<boolean> => {
  if (!('caches' in window)) {
    console.warn('Cache API is not supported in this browser');
    return false;
  }

  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('Service worker caches cleared');
    return true;
  } catch (error) {
    console.error('Failed to clear service worker caches:', error);
    return false;
  }
};

// Check if the app is running in a service worker context
export const isServiceWorker = () => {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 
         navigator.serviceWorker.controller !== null;
};

// Precache predictable routes that the user is likely to visit
export const precachePredictableRoutes = (registration: ServiceWorkerRegistration) => {
  if (!registration.active) return;
  
  // Send message to service worker to precache predictable routes
  registration.active.postMessage({
    type: 'precacheAssets',
    assets: PREDICTABLE_ROUTES.map(route => route)
  });
};

// Prefetch and cache resources for a specific route
export const prefetchRoute = async (route: string) => {
  try {
    if (!navigator.serviceWorker.controller) return;
    
    // Get all current service worker registrations
    const registrations = await navigator.serviceWorker.getRegistrations();
    
    // Find the active registration
    const registration = registrations.find(reg => reg.active);
    if (!registration?.active) return;
    
    // Send request to prefetch the route
    registration.active.postMessage({
      type: 'precacheAssets',
      assets: [route]
    });
    
    console.log(`Prefetched route: ${route}`);
  } catch (error) {
    console.error('Error prefetching route:', error);
  }
}; 