const CACHE_NAME = 'nesttask-v5';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/maskable-icon.png',
  '/icons/add-task.png',
  '/icons/view-tasks.png',
  '/icons/badge.png'
];

// Dynamic assets that should be cached during runtime
const RUNTIME_CACHE_PATTERNS = [
  /\.(js|css)$/, // JS and CSS files
  /assets\/.*\.(js|css|woff2|png|jpg|svg)$/, // Vite build assets
  /\/icons\/.*\.png$/, // Icon images
  /^https:\/\/fonts\.googleapis\.com/, // Google fonts stylesheets
  /^https:\/\/fonts\.gstatic\.com/ // Google fonts files
];

// Performance optimization - precache critical assets immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Pre-caching offline resources');
        return cache.addAll(STATIC_ASSETS)
          .catch(error => {
            console.error('[ServiceWorker] Pre-cache error:', error);
            // Try to cache each asset individually
            return Promise.all(
              STATIC_ASSETS.map(url => 
                cache.add(url).catch(err => 
                  console.warn(`[ServiceWorker] Failed to cache ${url}:`, err)
                )
              )
            );
          });
      })
      .then(() => {
        console.log('[ServiceWorker] Installation completed');
        return self.skipWaiting();
      })
  );
});

// Handle messages to skip waiting and immediately activate new service worker
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Received SKIP_WAITING message, activating new version immediately');
    
    // Skip waiting and activate immediately
    self.skipWaiting()
      .then(() => console.log('[ServiceWorker] Successfully skipped waiting'))
      .catch(error => console.error('[ServiceWorker] Error skipping waiting:', error));
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate event triggered');
  
  event.waitUntil(
    Promise.all([
      // Delete old caches
      caches.keys()
        .then((cacheNames) => {
          return Promise.all(
            cacheNames
              .filter((cacheName) => cacheName !== CACHE_NAME)
              .map((cacheName) => {
                console.log('[ServiceWorker] Deleting old cache:', cacheName);
                return caches.delete(cacheName);
              })
          );
        }),
      
      // Claim all clients immediately to ensure update takes effect
      self.clients.claim()
        .then(() => {
          console.log('[ServiceWorker] Claimed all clients');
          
          // Notify all clients that the service worker has been updated
          return self.clients.matchAll()
            .then(clients => {
              clients.forEach(client => {
                client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_NAME });
              });
            });
        })
    ])
    .then(() => console.log('[ServiceWorker] Activation complete'))
    .catch(error => console.error('[ServiceWorker] Activation error:', error))
  );
});

// Helper function to determine if a URL should be cached at runtime
function shouldCacheAtRuntime(url) {
  try {
    // Skip unsupported URL schemes
    const urlObj = new URL(url);
    if (urlObj.protocol === 'chrome-extension:' || 
        urlObj.protocol === 'chrome:' ||
        urlObj.protocol === 'edge:' ||
        urlObj.protocol === 'brave:' ||
        urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return false;
    }
    
    // Don't cache API requests or authentication endpoints
    if (url.includes('supabase.co') || 
        url.includes('/auth/') || 
        url.includes('/api/')) {
      return false;
    }
    
    // Check if the URL matches any of our patterns
    return RUNTIME_CACHE_PATTERNS.some(pattern => pattern.test(url));
  } catch (error) {
    console.error('[ServiceWorker] Error checking URL for caching:', error, url);
    return false;
  }
}

// Optimized fetch handler with improved error handling and performance
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Get request URL
  let requestUrl;
  try {
    requestUrl = new URL(event.request.url);
  } catch (error) {
    console.error('[ServiceWorker] Invalid URL:', event.request.url);
    return;
  }

  // Skip unsupported URL schemes and API requests
  if (requestUrl.protocol === 'chrome-extension:' || 
      requestUrl.protocol === 'chrome:' ||
      requestUrl.protocol === 'edge:' ||
      requestUrl.protocol === 'brave:' ||
      requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:' ||
      requestUrl.hostname.includes('supabase.co')) {
    return;
  }

  // Handle navigation requests (HTML pages) - network first with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Navigation request failed: ${response.status}`);
          }
          
          // Clone the response for caching
          const responseClone = response.clone();
          
          // Cache the latest version
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, responseClone))
            .catch(err => console.warn('[ServiceWorker] Failed to cache navigation:', err));
          
          return response;
        })
        .catch(error => {
          console.log('[ServiceWorker] Navigation fetch failed:', error);
          
          // Offline fallback
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                console.log('[ServiceWorker] Serving cached navigation response');
                return cachedResponse;
              }
              
              console.log('[ServiceWorker] Serving offline page');
              return caches.match(OFFLINE_URL);
            });
        })
    );
    return;
  }

  // CSS and JS assets - Cache first, then network
  if (event.request.destination === 'style' || 
      event.request.destination === 'script') {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            // Update the cache in the background without blocking response
            setTimeout(() => {
              fetch(event.request)
                .then(response => {
                  if (response.ok) {
                    caches.open(CACHE_NAME)
                      .then(cache => cache.put(event.request, response))
                      .catch(err => console.warn('[ServiceWorker] Background cache update failed:', err));
                  }
                })
                .catch(() => {});
            }, 1000);
            
            return cachedResponse;
          }
          
          // Not in cache, get from network
          return fetch(event.request)
            .then(response => {
              if (!response.ok) {
                console.warn(`[ServiceWorker] Bad response for ${event.request.url}: ${response.status}`);
                return response;
              }
              
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseClone))
                .catch(err => console.warn('[ServiceWorker] Failed to cache asset:', err));
              
              return response;
            });
        })
        .catch(error => {
          console.error('[ServiceWorker] Asset fetch error:', error);
          return new Response('Asset not available', { status: 404 });
        })
    );
    return;
  }

  // Images and other static assets - Stale-while-revalidate
  if (shouldCacheAtRuntime(event.request.url)) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          // Start network fetch
          const fetchPromise = fetch(event.request)
            .then(networkResponse => {
              if (networkResponse.ok) {
                // Update cache with fresh response
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(event.request, responseClone))
                  .catch(err => console.warn('[ServiceWorker] Failed to cache resource:', err));
              }
              return networkResponse;
            })
            .catch(() => null);
          
          // Return cached response or wait for network
          return cachedResponse || fetchPromise;
        })
        .catch(error => {
          console.error('[ServiceWorker] Resource fetch error:', error);
          return new Response('Resource unavailable', { status: 404 });
        })
    );
    return;
  }

  // Default behavior for other requests - network first with brief timeout
  event.respondWith(
    Promise.race([
      fetch(event.request)
        .then(response => {
          // Don't cache by default 
          return response;
        }),
      // Short timeout for better UX
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ])
    .catch(error => {
      console.log('[ServiceWorker] Network request failed or timed out:', error);
      
      // Try the cache as a fallback
      return caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            console.log('[ServiceWorker] Serving cached response after network failure');
            return cachedResponse;
          }
          
          // No cache, return error response
          console.log('[ServiceWorker] No cached response available');
          return new Response('Network error, and no cached version available', { 
            status: 408,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
    })
  );
});

// Enhanced push notification handler with better error management
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'New notification',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.data?.url || '/',
        taskId: data.data?.taskId,
        type: data.data?.type || 'default'
      },
      actions: data.actions || [
        {
          action: 'open',
          title: 'Open',
          icon: '/icons/icon-192x192.png'
        }
      ],
      tag: data.tag || 'default',
      renotify: true,
      requireInteraction: data.requireInteraction !== false
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'NestTask Notification', options)
        .catch(error => console.error('[ServiceWorker] Failed to show notification:', error))
    );
  } catch (error) {
    console.error('[ServiceWorker] Error handling push notification:', error);
    
    // Show a generic notification on parse error
    event.waitUntil(
      self.registration.showNotification('New Notification', {
        body: 'You have a new notification',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge.png'
      })
    );
  }
});

// Optimized notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data?.url || '/';
  const taskId = event.notification.data?.taskId;
  const notificationType = event.notification.data?.type || 'default';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Try to focus an existing window first
        for (const client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        // If no matching window, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
      .catch(error => console.error('[ServiceWorker] Error handling notification click:', error))
  );
});

// Helper function to safely put items in cache with error handling
async function safeCachePut(cacheName, request, response) {
  if (!response || !response.body) {
    console.warn('[ServiceWorker] Invalid response for caching', request.url);
    return;
  }
  
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  } catch (error) {
    console.error('[ServiceWorker] Error caching response:', error, request.url);
  }
}

// Helper function to safely match items in cache with error handling
async function safeCacheMatch(cacheName, request) {
  try {
    const cache = await caches.open(cacheName);
    return await cache.match(request);
  } catch (error) {
    console.error('[ServiceWorker] Error retrieving from cache:', error, 
      typeof request === 'string' ? request : request.url);
    return null;
  }
}

// Periodic cleanup of old cached items to prevent storage overflow
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_OLD_CACHES') {
    event.waitUntil(
      caches.keys()
        .then((cacheNames) => {
          return Promise.all(
            cacheNames
              .filter((cacheName) => cacheName !== CACHE_NAME)
              .map((cacheName) => caches.delete(cacheName))
          );
        })
        .then(() => {
          console.log('[ServiceWorker] Cache cleanup completed');
          clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage({
              type: 'CACHE_CLEANED'
            }));
          });
        })
    );
  }
});