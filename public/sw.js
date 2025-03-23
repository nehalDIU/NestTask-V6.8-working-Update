const CACHE_NAME = 'nesttask-v1';
const STATIC_CACHE_NAME = 'nesttask-static-v1';
const DYNAMIC_CACHE_NAME = 'nesttask-dynamic-v1';
const DB_NAME = 'nesttask_offline_db';
const DB_VERSION = 3;

// Critical data types that need offline support
const CRITICAL_STORES = ['tasks', 'routines', 'courses'];

// Assets to precache for faster loading
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  // Add core CSS files
  '/css/main.css',
  // Add core JS files
  '/js/app.js',
  // Add critical images
  '/logo.png',
  // Add critical fonts
  // '/fonts/roboto.woff2',
];

// Performance-critical API routes that should be cached with network-first strategy
const NETWORK_FIRST_ROUTES = [
  '/api/tasks',
  '/api/routines',
  '/api/courses'
];

// Install event - cache static assets and precache critical resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  // Skip waiting to ensure the new service worker activates immediately
  self.skipWaiting();
  
  event.waitUntil(
    Promise.all([
      // Precache static assets
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('[Service Worker] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS);
      }),
      
      // Create dynamic cache
      caches.open(DYNAMIC_CACHE_NAME)
    ])
  );
});

// Activate event - clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  // Take control of all clients immediately
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (
              cacheName !== STATIC_CACHE_NAME && 
              cacheName !== DYNAMIC_CACHE_NAME && 
              cacheName !== CACHE_NAME && 
              cacheName !== `${CACHE_NAME}-critical`
            ) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Helper function for network-first strategy
const networkFirst = async (request) => {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // If successful, clone and cache the response
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // If network fails, try cache
    console.log('[Service Worker] Falling back to cache for:', request.url);
    const cachedResponse = await caches.match(request);
    return cachedResponse || Promise.reject('No network or cache response');
  }
};

// Helper function for cache-first strategy
const cacheFirst = async (request) => {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // If not in cache, get from network and cache for next time
  try {
    const networkResponse = await fetch(request);
    
    // Cache valid responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Both cache and network failed for:', request.url);
    return Promise.reject('No network or cache response');
  }
};

// Fetch event - prioritize critical data types and implement different strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip browser extensions and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Prioritize API requests for critical data
  const isCriticalDataRequest = CRITICAL_STORES.some(store => 
    url.pathname.includes(`/api/${store}`) || 
    url.pathname.includes(`/api/sync/${store}`)
  );
  
  // Check if it's a network-first route
  const isNetworkFirstRoute = NETWORK_FIRST_ROUTES.some(route =>
    url.pathname.includes(route)
  );
  
  // Check if it's a static asset (stylesheets, scripts, images, fonts)
  const isStaticAsset = /\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/.test(url.pathname);
  
  if (isCriticalDataRequest) {
    // Higher priority caching for critical data endpoints - network first with fallback
    event.respondWith(
      caches.open(`${CACHE_NAME}-critical`).then(cache => 
        fetch(event.request.clone())
          .then(response => {
            cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cache.match(event.request))
      ).catch(() => fetch(event.request))
    );
  } else if (isNetworkFirstRoute) {
    // Network-first for important API endpoints
    event.respondWith(networkFirst(event.request));
  } else if (isStaticAsset) {
    // Cache-first for static assets for better performance
    event.respondWith(cacheFirst(event.request));
  } else {
    // Regular caching - stale-while-revalidate for everything else
    event.respondWith(
      caches.match(event.request).then((response) => {
        // Return cached response if found (stale)
        const fetchPromise = fetch(event.request.clone())
          .then((response) => {
            // Don't cache non-successful responses or non-GET responses
            if (!response || response.status !== 200 || event.request.method !== 'GET') {
              return response;
            }
            
            // Clone response
            const responseToCache = response.clone();
            
            // Update cache with fresh response (revalidate)
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
            
            return response;
          })
          .catch(() => {
            console.log('[Service Worker] Fetch failed, returning offline page');
            // If both cache and network fail for HTML requests, return offline page
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/offline.html');
            }
            return new Response('Network error happened', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
          
        // Return cache first, but fetch in background (stale-while-revalidate)
        return response || fetchPromise;
      })
    );
  }
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'heartbeat') {
    event.source.postMessage({ type: 'heartbeat-ack' });
  } else if (event.data.type === 'sync') {
    // Handle data synchronization when coming back online
    syncData();
  } else if (event.data.type === 'skipWaiting') {
    // Skip waiting when requested (for immediate updates)
    self.skipWaiting();
  } else if (event.data.type === 'precacheAssets') {
    // Allow dynamic precaching from main thread
    if (event.data.assets && Array.isArray(event.data.assets)) {
      caches.open(STATIC_CACHE_NAME).then(cache => {
        return cache.addAll(event.data.assets);
      });
    }
  }
});

// Sync data with the server
async function syncData() {
  try {
    // Open IndexedDB
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      // Only sync critical stores
      CRITICAL_STORES.forEach(storeName => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = () => {
          const items = getAllRequest.result;
          
          // Filter items that need syncing (created/updated offline)
          const itemsToSync = items.filter(item => 
            item._isOffline || item._isOfflineUpdated || item._isOfflineDeleted
          );
          
          if (itemsToSync.length > 0) {
            // Send sync request to the server
            fetch(`/api/sync/${storeName}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(itemsToSync)
            })
            .then(response => response.json())
            .then(result => {
              // Update local database with server response
              const updateTransaction = db.transaction(storeName, 'readwrite');
              const updateStore = updateTransaction.objectStore(storeName);
              
              result.forEach(item => {
                // Remove offline flags
                delete item._isOffline;
                delete item._isOfflineUpdated;
                delete item._isOfflineDeleted;
                
                if (item._isOfflineDeleted) {
                  updateStore.delete(item.id);
                } else {
                  updateStore.put(item);
                }
              });
            })
            .catch(error => {
              console.error(`Error syncing ${storeName}:`, error);
            });
          }
        };
      });
    };
  } catch (error) {
    console.error('Error during data sync:', error);
  }
} 