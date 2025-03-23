import { prefetchRoute } from './serviceWorker';

// Routes that should be preloaded
export const ROUTES = {
  HOME: '/',
  TASKS: '/tasks',
  ROUTINES: '/routines',
  COURSES: '/courses',
  NOTIFICATIONS: '/notifications',
  PROFILE: '/profile',
  DASHBOARD: '/dashboard'
};

/**
 * Preload routes in a progressive manner, starting with the most critical ones
 * @param routes An array of routes to preload
 */
export const preloadPredictedRoutes = async (routes: string[]) => {
  if (!navigator.onLine) {
    console.debug('Skipping route preloading while offline');
    return;
  }

  // High-priority routes to preload immediately
  const highPriorityRoutes = routes.filter(route => 
    route === ROUTES.HOME || 
    route === ROUTES.TASKS || 
    route === ROUTES.ROUTINES
  );

  // Low-priority routes to preload with a delay
  const lowPriorityRoutes = routes.filter(route => 
    !highPriorityRoutes.includes(route)
  );

  // Process high priority routes immediately
  console.debug('Preloading high priority routes:', highPriorityRoutes);
  highPriorityRoutes.forEach(route => {
    prefetchRoute(route);
  });

  // Process low priority routes with a delay
  if (lowPriorityRoutes.length > 0) {
    setTimeout(() => {
      console.debug('Preloading low priority routes:', lowPriorityRoutes);
      lowPriorityRoutes.forEach(route => {
        prefetchRoute(route);
      });
    }, 3000); // 3 second delay for non-critical routes
  }
};

/**
 * Manually trigger preloading for a specific route
 * @param route Route to preload
 */
export const preloadRoute = (route: string) => {
  if (!navigator.onLine) return;
  
  console.debug(`Manually preloading route: ${route}`);
  prefetchRoute(route);
}; 