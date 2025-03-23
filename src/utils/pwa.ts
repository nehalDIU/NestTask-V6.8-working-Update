// Check if the app can be installed
export function checkInstallability() {
  if ('BeforeInstallPromptEvent' in window) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      // Store the event for later use
      (window as any).deferredPrompt = e;
    });
  }
}

// Request to install the PWA
export async function installPWA() {
  const deferredPrompt = (window as any).deferredPrompt;
  if (!deferredPrompt) return false;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  
  // Clear the stored prompt
  (window as any).deferredPrompt = null;
  
  return outcome === 'accepted';
}

// Register for push notifications
export async function registerPushNotifications() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported in this browser');
      return null;
    }
    
    const registration = await navigator.serviceWorker.ready;
    
    // Check for existing subscription first
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      console.log('Using existing push subscription');
      return existingSubscription;
    }
    
    // Request new subscription
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
    if (!vapidKey) {
      console.error('VAPID public key is missing');
      return null;
    }
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });
    
    console.log('Push notification subscription successful');
    return subscription;
  } catch (error) {
    console.error('Failed to register push notifications:', error);
    return null;
  }
}

// Track service worker registration state
let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

// Register service worker for offline support with optimized handling
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker is not supported in this browser');
    return null;
  }
  
  // Use cached registration if available
  if (serviceWorkerRegistration) return serviceWorkerRegistration;
  
  try {
    // Check if service worker is already registered
    const registrations = await navigator.serviceWorker.getRegistrations();
    const existingRegistration = registrations.find(reg => 
      reg.active && reg.scope.includes(window.location.origin)
    );
    
    if (existingRegistration) {
      serviceWorkerRegistration = existingRegistration;
      console.log('Using existing service worker registration');
      
      // Set up update handler
      setupUpdateHandler(existingRegistration);
      
      // Force an update check immediately
      existingRegistration.update().catch(err => 
        console.warn('Initial update check failed:', err)
      );
      
      return existingRegistration;
    }
    
    // Register new service worker with optimized timing and error handling
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
      updateViaCache: 'none', // Always go to network for updates
    });
    
    serviceWorkerRegistration = registration;
    console.log('Service Worker registered successfully with scope:', registration.scope);
    
    // Set up service worker update handling
    setupUpdateHandler(registration);
    
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    
    // Try one more time after a delay
    return new Promise(resolve => {
      setTimeout(async () => {
        try {
          // Use simple registration parameters for retry
          const retryRegistration = await navigator.serviceWorker.register('/service-worker.js');
          serviceWorkerRegistration = retryRegistration;
          console.log('Service Worker registered on second attempt');
          setupUpdateHandler(retryRegistration);
          resolve(retryRegistration);
        } catch (retryError) {
          console.error('Service worker retry failed:', retryError);
          resolve(null);
        }
      }, 3000); // Longer timeout for retry
    });
  }
}

// Helper function to handle service worker updates
function setupUpdateHandler(registration: ServiceWorkerRegistration) {
  // Set up service worker update handling
  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // Only show notification if there's actually a new version
        if (newWorker.scriptURL !== registration.active?.scriptURL) {
          console.log('New version available! Refresh to update.');
          
          // Check if we've recently shown a notification
          const lastNotified = localStorage.getItem('lastUpdateNotificationTime');
          const currentTime = Date.now();
          
          // Only notify if we haven't notified recently (within the last hour)
          if (!lastNotified || (currentTime - parseInt(lastNotified)) > 60 * 60 * 1000) {
            // Update the last notification time
            localStorage.setItem('lastUpdateNotificationTime', currentTime.toString());
            
            // Dispatch event for the app to show a refresh notification
            window.dispatchEvent(new CustomEvent('sw-update-available', {
              detail: { registration }
            }));
          }
        }
      }
    });
  });
  
  // Check updates with intelligent scheduling
  if (registration.active) {
    // Schedule first update check based on connection quality
    let updateCheckDelay = 30 * 60 * 1000; // Default 30 minutes
    
    if (navigator.onLine) {
      try {
        // Check for Network Information API support
        if ('connection' in navigator && 
            navigator.connection && 
            'effectiveType' in (navigator.connection as any)) {
          if ((navigator.connection as any).effectiveType === '4g') {
            updateCheckDelay = 5 * 60 * 1000; // 5 minutes for fast connections
          } else {
            updateCheckDelay = 15 * 60 * 1000; // 15 minutes for slower connections
          }
        }
      } catch (error) {
        console.warn('Error checking connection type:', error);
      }
    }
    
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        setTimeout(() => schedulePeriodicUpdates(registration), updateCheckDelay);
      }, { timeout: 10000 });
    } else {
      setTimeout(() => schedulePeriodicUpdates(registration), updateCheckDelay);
    }
  }
}

// Helper function to schedule periodic updates
function schedulePeriodicUpdates(registration: ServiceWorkerRegistration) {
  // Don't update if user is offline
  if (!navigator.onLine) {
    console.log('Skipping service worker update check - user is offline');
    setTimeout(() => schedulePeriodicUpdates(registration), 30 * 60 * 1000);
    return;
  }
  
  // Update when network is idle and user is likely not active
  console.log('Checking for service worker updates...');
  registration.update()
    .then(() => console.log('Service worker update check completed'))
    .catch(err => console.error('Error updating service worker:', err));
  
  // Use adaptive timing based on user interaction patterns
  // More frequent updates if user is actively using the app
  const lastUserInteraction = (window as any).lastUserInteraction || Date.now();
  const timeSinceInteraction = Date.now() - lastUserInteraction;
  
  // 30 minutes if user recently interacted, 2 hours otherwise
  const nextUpdateDelay = timeSinceInteraction < 15 * 60 * 1000 ? 
    30 * 60 * 1000 : 2 * 60 * 60 * 1000;
  
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      setTimeout(() => schedulePeriodicUpdates(registration), nextUpdateDelay);
    }, { timeout: 10000 });
  } else {
    setTimeout(() => schedulePeriodicUpdates(registration), nextUpdateDelay);
  }
}

// Initialize PWA features with optimized performance
export async function initPWA() {
  try {
    // Track user interaction for intelligent update scheduling
    document.addEventListener('click', () => {
      (window as any).lastUserInteraction = Date.now();
    });
    
    // Initialize features in parallel with timeouts
    const [installabilityResult, serviceWorkerResult] = await Promise.allSettled([
      Promise.race([
        Promise.resolve().then(checkInstallability),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 2000))
      ]),
      Promise.race([
        Promise.resolve().then(registerServiceWorker),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 5000))
      ])
    ]);
  
    // Check results
    if (installabilityResult.status === 'rejected') {
      console.warn('PWA installability check failed:', installabilityResult.reason);
    }
    
    if (serviceWorkerResult.status === 'rejected') {
      console.warn('Service worker registration failed:', serviceWorkerResult.reason);
    }
    
    // Request persistent storage for PWA data
    if ('storage' in navigator && 'persist' in navigator.storage) {
      navigator.storage.persist()
        .then(isPersisted => console.log(`Persistent storage granted: ${isPersisted}`))
        .catch(err => console.warn('Error requesting persistent storage:', err));
    }
    
    return true;
  } catch (error) {
    console.error('PWA initialization error:', error);
    // Continue app operation even if PWA features fail
    return false;
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  if (!base64String) return new Uint8Array();
  
  try {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  } catch (error) {
    console.error('Error converting base64 to Uint8Array:', error);
    return new Uint8Array();
  }
}