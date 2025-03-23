import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
// Import CSS (Vite handles this correctly)
import './index.css';
import { LoadingScreen } from './components/LoadingScreen';
import { initPWA } from './utils/pwa';
import { prefetchResources, prefetchAsset, prefetchApiData } from './utils/prefetch';
import { STORES } from './utils/offlineStorage';
import { 
  trackPerformanceMetrics, 
  applyPerformanceOptimizations 
} from './utils/performance';

// Performance optimizations initialization
const startTime = performance.now();

// Mark the first paint timing
performance.mark('app-init-start');

// Initialize performance tracking immediately
const performanceTracking = trackPerformanceMetrics();
console.log(`Performance tracking initialized: ${performanceTracking ? 'success' : 'failed'}`);

// Apply performance optimizations
setTimeout(() => {
  applyPerformanceOptimizations();
}, 0);

// Lazy load the main App component
const App = lazy(() => import('./App').then(module => {
  // Track and log module loading time
  const loadTime = performance.now() - startTime;
  console.debug(`App component loaded in ${loadTime.toFixed(2)}ms`);
  return module;
}));

// Initialize PWA functionality in parallel but don't block initial render
const pwaPromise = Promise.resolve().then(() => {
  // Use idle callback if available
  const initWithTimeout = () => {
    initPWA().catch(err => console.error('PWA initialization error:', err));
  };
  
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(initWithTimeout, { timeout: 2000 });
  } else {
    setTimeout(initWithTimeout, 1000);
  }
});

// Enhanced prefetch for resources with priority marking
const prefetchCriticalResources = () => {
  if (navigator.onLine) {
    // Define critical resources with priority
    const criticalResources = [
      { 
        type: 'asset' as const, 
        key: 'manifest', 
        loader: '/manifest.json',
        options: { priority: 'high' as const }
      },
      { 
        type: 'asset' as const, 
        key: 'icon', 
        loader: '/icons/icon-192x192.png',
        options: { priority: 'high' as const }
      },
      { 
        type: 'route' as const, 
        key: 'auth', 
        loader: () => import('./pages/AuthPage'),
        options: { priority: 'high' as const }
      },
      // API data prefetching for the most important data
      { 
        type: 'api' as const, 
        key: 'tasks', 
        loader: {
          tableName: 'tasks',
          queryFn: (query: any) => query.select('*').limit(10),
          storeName: STORES.TASKS
        },
        options: { priority: 'high' as const }
      },
      { 
        type: 'api' as const, 
        key: 'routines', 
        loader: {
          tableName: 'routines',
          queryFn: (query: any) => query.select('*').eq('is_active', true).limit(1),
          storeName: STORES.ROUTINES
        },
        options: { priority: 'high' as const }
      }
    ];
    
    // Prefetch all critical resources in parallel with priority
    prefetchResources(criticalResources);
  }
};

// Optimize connection to the server with better timeout management
const establishConnectionOptimizations = () => {
  // Use connection preload hints
  const domains = [
    import.meta.env.VITE_SUPABASE_URL || '',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com'
  ].filter(Boolean); // Remove empty values
  
  domains.forEach(domain => {
    try {
      const url = new URL(domain);
      // DNS prefetch
      const dnsPrefetch = document.createElement('link');
      dnsPrefetch.rel = 'dns-prefetch';
      dnsPrefetch.href = url.origin;
      document.head.appendChild(dnsPrefetch);
      
      // Preconnect for faster initial connection
      const preconnect = document.createElement('link');
      preconnect.rel = 'preconnect';
      preconnect.href = url.origin;
      preconnect.crossOrigin = 'anonymous';
      document.head.appendChild(preconnect);
      
      console.debug(`Connection optimization applied for ${url.origin}`);
    } catch (err) {
      console.error('Error setting up connection optimization:', err);
    }
  });
  
  // Optimize bandwidth usage with priority fetch and timeout
  if ('fetch' in window) {
    const originalFetch = window.fetch;
    
    // Enhanced fetch with priority hints and timeout
    window.fetch = function (input, init) {
      // Add timeout for better error handling
      const customInit = init || {};
      const timeout = (customInit as any).timeout || 30000;
      
      // Remove non-standard properties
      const standardInit = { ...customInit };
      if ('timeout' in standardInit) {
        delete (standardInit as any).timeout;
      }
      
      // Create cache-busting URL when needed
      let url = input;
      if (typeof input === 'string' && !input.includes('?_cb=')) {
        if (input.includes('/api/') || input.includes('supabase')) {
          // Add cache buster for API requests
          const urlObj = new URL(input, window.location.origin);
          urlObj.searchParams.set('_cb', Date.now().toString());
          url = urlObj.toString();
        }
      }
      
      // Enhanced options with modern browser hints
      const enhancedInit = {
        ...standardInit,
        // Add modern browser fetch priority hints
        priority: standardInit.priority || 'auto',
      };
      
      // Create abort controller for timeout
      const controller = new AbortController();
      if (!enhancedInit.signal) {
        enhancedInit.signal = controller.signal;
      }
      
      // Set timeout to abort fetch
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);
      
      // Execute the fetch with timeout
      return originalFetch.call(window, url, enhancedInit).finally(() => {
        clearTimeout(timeoutId);
      });
    };
  }
};

// Initialize optimizations in parallel - critical path first
Promise.resolve()
  .then(() => {
    // First tackle the connection optimizations (highest priority)
    establishConnectionOptimizations();
    
    // Then start prefetching critical resources
    prefetchCriticalResources();
    
    // Then handle PWA initialization
    return pwaPromise;
  })
  .catch(err => {
    console.error('Optimization error:', err);
  })
  .finally(() => {
    // Performance measurement
    performance.measure('app-optimizations', 'app-init-start');
    performance.getEntriesByName('app-optimizations').forEach(entry => {
      console.debug(`Optimizations completed in ${entry.duration.toFixed(2)}ms`);
    });
  });

// Get the root element with null check
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Make sure there is a div with id "root" in the HTML.');
}

// Create the root with improved error handling
const root = createRoot(rootElement);

// Track initial render time
performance.mark('react-mount-start');

// Render the app with minimal suspense delay and initialize loading state in DOM
root.render(
  <StrictMode>
    <Suspense fallback={<LoadingScreen minimumLoadTime={300} />}>
      <App />
      <Analytics />
    </Suspense>
  </StrictMode>
);

// Add reliable cleanup for loading screen
window.addEventListener('load', () => {
  setTimeout(() => {
    const loadingScreen = document.querySelector('.loading');
    if (loadingScreen) {
      loadingScreen.remove();
    }
    
    // Initialize PWA features and enhancements when app is fully loaded
    Promise.all([
      import('./utils/pwa').then(({ initPWA }) => initPWA()),
      import('./utils/pwaEnhancements').then(({ initPWAEnhancements }) => initPWAEnhancements()),
      import('./utils/serviceWorkerUtils').then(({ initServiceWorkerUpdates }) => initServiceWorkerUpdates())
    ]).then(([pwaResult, enhancementsResult]) => {
      if (pwaResult && enhancementsResult) {
        console.log('PWA features and enhancements initialized successfully');
      }
    });
    
    // Register service worker update listener after app is ready
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      window.addEventListener('sw-update-available', (event) => {
        console.log('Service worker update available!');
        
        // Check if notification was shown in this session
        const lastNotificationTime = sessionStorage.getItem('updateNotificationShown');
        const currentTime = Date.now();
        
        // Show notification if not shown yet or it's been more than 6 hours
        if (!lastNotificationTime || (currentTime - parseInt(lastNotificationTime)) > 6 * 60 * 60 * 1000) {
          // Update the timestamp
          sessionStorage.setItem('updateNotificationShown', currentTime.toString());
          
          // Show update notification after a delay
          setTimeout(() => {
            // If we have a toast component available, use it
            if (window.dispatchEvent) {
              window.dispatchEvent(new CustomEvent('show-toast', { 
                detail: { 
                  message: 'New version available! Refresh to update.',
                  type: 'info',
                  duration: 30000, // Longer duration to give user time to see it
                  action: {
                    label: 'Refresh',
                    onClick: async () => {
                      try {
                        // Flag that we're intentionally reloading to apply update
                        (document as any).isReloading = true;
                        
                        // Get the service worker registration from the event
                        const registration = (event as CustomEvent).detail?.registration;
                        
                        // If we have direct access to the registration, use it
                        if (registration && registration.waiting) {
                          console.log('Sending skip waiting message to service worker');
                          // Tell the service worker to skip waiting
                          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                          
                          // The service worker will take control and reload will happen
                          // in the controllerchange event (already handled in ServiceWorkerUpdateNotification)
                          return;
                        }
                        
                        // Fallback: try to get registrations
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        if (registrations.length > 0 && registrations[0].waiting) {
                          console.log('Sending skip waiting message via registrations');
                          registrations[0].waiting.postMessage({ type: 'SKIP_WAITING' });
                          return;
                        }
                        
                        // If all else fails, just reload
                        console.log('No waiting service worker found, refreshing page directly');
                        window.location.reload();
                      } catch (error) {
                        console.error('Error during refresh:', error);
                        window.location.reload(); // Fallback
                      }
                    }
                  }
                } 
              }));
            }
          }, 3000);
        }
      });
    }
  }, 800);
});

// Measure and log render completion time
performance.measure('react-mount', 'react-mount-start');
performance.getEntriesByName('react-mount').forEach(entry => {
  console.debug(`Initial render completed in ${entry.duration.toFixed(2)}ms`);
});