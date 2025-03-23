/**
 * Performance monitoring and optimization utilities for the PWA
 */

// Track important performance metrics
export const trackPerformanceMetrics = () => {
  try {
    // Observe performance entries and report critical metrics
    if ('PerformanceObserver' in window) {
      // Track FCP (First Contentful Paint)
      const fcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          console.log(`FCP: ${entry.startTime.toFixed(1)}ms`);
          // Report to analytics if needed
          reportPerformanceMetric('FCP', entry.startTime);
        });
      });
      fcpObserver.observe({ type: 'paint', buffered: true });

      // Track LCP (Largest Contentful Paint)
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          console.log(`LCP: ${entry.startTime.toFixed(1)}ms`);
          // Report to analytics if needed
          reportPerformanceMetric('LCP', entry.startTime);
        });
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      // Track FID (First Input Delay)
      const fidObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          const delay = (entry as PerformanceEventTiming).processingStart - entry.startTime;
          console.log(`FID: ${delay.toFixed(1)}ms`);
          // Report to analytics if needed
          reportPerformanceMetric('FID', delay);
        });
      });
      fidObserver.observe({ type: 'first-input', buffered: true });

      // Track CLS (Cumulative Layout Shift)
      let cumulativeLayoutShift = 0;
      const clsObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          if (!(entry as any).hadRecentInput) {
            cumulativeLayoutShift += (entry as any).value;
            console.log(`CLS updated: ${cumulativeLayoutShift.toFixed(3)}`);
            // Report to analytics if needed
            reportPerformanceMetric('CLS', cumulativeLayoutShift);
          }
        });
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });

      // Track Navigation Timing
      const navigationObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming;
            const metrics = {
              DNS: navEntry.domainLookupEnd - navEntry.domainLookupStart,
              TLS: navEntry.secureConnectionStart > 0 ? 
                navEntry.connectEnd - navEntry.secureConnectionStart : 0,
              TTFB: navEntry.responseStart - navEntry.requestStart,
              contentDownload: navEntry.responseEnd - navEntry.responseStart,
              DOMInteractive: navEntry.domInteractive - navEntry.fetchStart,
              DOMComplete: navEntry.domComplete - navEntry.fetchStart,
              loadEvent: navEntry.loadEventEnd - navEntry.loadEventStart,
              totalLoadTime: navEntry.loadEventEnd - navEntry.fetchStart
            };
            
            console.log('Navigation metrics:', metrics);
            // Report metrics if needed
            Object.entries(metrics).forEach(([key, value]) => {
              reportPerformanceMetric(key, value);
            });
          }
        });
      });
      navigationObserver.observe({ type: 'navigation', buffered: true });

      // Detect long tasks
      const longTaskObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          console.warn(`Long task detected: ${entry.duration.toFixed(1)}ms`);
          // Report to analytics if needed
          reportPerformanceMetric('LongTask', entry.duration);
        });
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });

      return true;
    }
    return false;
  } catch (error) {
    console.error('Error setting up performance tracking:', error);
    return false;
  }
};

// Apply automatic performance optimizations
export const applyPerformanceOptimizations = () => {
  try {
    // Defer non-critical operations
    deferNonCriticalOperations();
    
    // Configure resource priorities
    configureResourcePriorities();
    
    // Optimize rendering
    optimizeRendering();
    
    // Optimize media loading
    optimizeMediaLoading();
    
    return true;
  } catch (error) {
    console.error('Error applying performance optimizations:', error);
    return false;
  }
};

// Report metrics to analytics or local storage for debugging
const reportPerformanceMetric = (name: string, value: number) => {
  // Store locally for debugging
  try {
    const metricsStore = JSON.parse(localStorage.getItem('performance_metrics') || '{}');
    metricsStore[name] = value;
    localStorage.setItem('performance_metrics', JSON.stringify(metricsStore));
  } catch (e) {
    // Ignore storage errors
  }
  
  // Send to backend analytics if available
  // This can be implemented when a backend endpoint is available
};

// Defer non-critical operations until after load
const deferNonCriticalOperations = () => {
  // Use requestIdleCallback or setTimeout for non-critical operations
  const scheduleTask = (window as any).requestIdleCallback || 
    ((cb: Function) => setTimeout(cb, 1000));
  
  // Schedule non-critical tasks
  scheduleTask(() => {
    // Prefetch likely next screens
    prefetchLikelyNextScreens();
    
    // Preload important images
    preloadImportantImages();
    
    // Register analytics if needed
    registerAnalytics();
  });
};

// Configure resource priorities based on importance
const configureResourcePriorities = () => {
  // Add fetchpriority attributes to important resources
  document.querySelectorAll('link[rel="preload"]').forEach(link => {
    if (!link.hasAttribute('fetchpriority')) {
      link.setAttribute('fetchpriority', 'high');
    }
  });
  
  // Set low priority for non-critical resources
  document.querySelectorAll('img:not([fetchpriority])').forEach(img => {
    if (!img.hasAttribute('loading')) {
      img.setAttribute('loading', 'lazy');
    }
    if ((img as HTMLImageElement).src.includes('avatar') || 
        (img as HTMLImageElement).src.includes('profile')) {
      img.setAttribute('fetchpriority', 'high');
    } else {
      img.setAttribute('fetchpriority', 'low');
    }
  });
};

// Optimize rendering performance
const optimizeRendering = () => {
  // Add content-visibility to offscreen content
  document.querySelectorAll('.offscreen-content, footer, .sidebar').forEach(el => {
    (el as HTMLElement).style.contentVisibility = 'auto';
  });
  
  // Use contain property for static elements
  document.querySelectorAll('.static-content, .card').forEach(el => {
    (el as HTMLElement).style.contain = 'content';
  });
};

// Optimize media loading
const optimizeMediaLoading = () => {
  // Add lazy loading to all images and iframes
  document.querySelectorAll('img:not([loading]), iframe:not([loading])').forEach(el => {
    el.setAttribute('loading', 'lazy');
  });
  
  // Add decoding async to images
  document.querySelectorAll('img:not([decoding])').forEach(img => {
    img.setAttribute('decoding', 'async');
  });
};

// Prefetch likely next screens based on user navigation patterns
const prefetchLikelyNextScreens = () => {
  // This can be implemented based on user navigation patterns
  // For example, if users often go from tasks to calendar, prefetch calendar
  
  if (window.location.pathname.includes('/tasks')) {
    const prefetchLink = document.createElement('link');
    prefetchLink.rel = 'prefetch';
    prefetchLink.href = '/calendar';
    prefetchLink.as = 'document';
    document.head.appendChild(prefetchLink);
  }
};

// Preload important images
const preloadImportantImages = () => {
  const importantImages = [
    '/icons/icon-192x192.png',
    '/icons/add-task.png'
  ];
  
  importantImages.forEach(imagePath => {
    if (!document.querySelector(`link[rel="preload"][href="${imagePath}"]`)) {
      const preloadLink = document.createElement('link');
      preloadLink.rel = 'preload';
      preloadLink.href = imagePath;
      preloadLink.as = 'image';
      document.head.appendChild(preloadLink);
    }
  });
};

// Register analytics (implement as needed)
const registerAnalytics = () => {
  // Implement analytics registration if needed
};

// Export additional utility functions
export const clearPerformanceMetrics = () => {
  try {
    localStorage.removeItem('performance_metrics');
    return true;
  } catch (e) {
    console.error('Error clearing performance metrics:', e);
    return false;
  }
};

export const getPerformanceMetrics = () => {
  try {
    return JSON.parse(localStorage.getItem('performance_metrics') || '{}');
  } catch (e) {
    console.error('Error getting performance metrics:', e);
    return {};
  }
};

// Performance monitoring and optimization utilities
export const measurePerformance = (name: string, fn: () => void) => {
  const start = performance.now();
  fn();
  const end = performance.now();
  console.debug(`${name} took ${end - start}ms`);
};

// Debounce function for performance optimization
export const debounce = <T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// Throttle function for performance optimization
export const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// RAF-based throttle for smooth animations
export const rafThrottle = <T extends (...args: any[]) => any>(
  fn: T
): ((...args: Parameters<T>) => void) => {
  let ticking = false;
  
  return (...args: Parameters<T>) => {
    if (!ticking) {
      requestAnimationFrame(() => {
        fn(...args);
        ticking = false;
      });
      ticking = true;
    }
  };
};

// Intersection Observer hook for lazy loading
export const createIntersectionObserver = (
  callback: IntersectionObserverCallback,
  options: IntersectionObserverInit = {}
): IntersectionObserver => {
  return new IntersectionObserver(callback, {
    root: null,
    rootMargin: '50px',
    threshold: 0,
    ...options
  });
};

// Performance metrics tracking
export const trackMetrics = () => {
  if ('performance' in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Report to analytics or monitoring service
        console.debug('[Performance]', entry.name, entry.startTime, entry.duration);
      }
    });

    observer.observe({ entryTypes: ['paint', 'largest-contentful-paint', 'layout-shift'] });
  }
};

// Cache API wrapper for response caching
export const cacheResponse = async (
  request: Request,
  response: Response,
  cacheName: string = 'api-cache'
): Promise<void> => {
  if ('caches' in window) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
};

// Memory usage monitoring
export const monitorMemoryUsage = async () => {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    console.debug('Memory Usage:', {
      usedJSHeapSize: memory.usedJSHeapSize / 1048576 + 'MB',
      totalJSHeapSize: memory.totalJSHeapSize / 1048576 + 'MB'
    });
  }
};