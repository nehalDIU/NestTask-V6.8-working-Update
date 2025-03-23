import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useAuth } from './hooks/useAuth';
import { useTasks } from './hooks/useTasks';
import { useUsers } from './hooks/useUsers';
import { useNotifications } from './hooks/useNotifications';
import { useRoutines } from './hooks/useRoutines';
import { AuthPage } from './pages/AuthPage';
import { LoadingScreen } from './components/LoadingScreen';
import { Navigation } from './components/Navigation';
import { TaskList } from './components/TaskList';
import { BottomNavigation } from './components/BottomNavigation';
import { NotificationPanel } from './components/notifications/NotificationPanel';
import { InstallPWA } from './components/InstallPWA';
import { OfflineIndicator } from './components/ui/OfflineIndicator';
import { OfflineToast } from './components/ui/OfflineToast';
import { ListTodo, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { TaskCategories } from './components/task/TaskCategories';
import { isOverdue, isSameDay } from './utils/dateUtils';
import { useOfflineStatus } from './hooks/useOfflineStatus';
import { usePredictivePreload } from './hooks/usePredictivePreload';
import { InstantTransition } from './components/InstantTransition';
import { prefetchResources } from './utils/prefetch';
import { STORES, CRITICAL_STORES, clearIndexedDBStore } from './utils/offlineStorage';
import type { NavPage } from './types/navigation';
import type { TaskCategory } from './types/task';
import type { Task } from './types/task';
import type { User } from './types/user';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { supabase } from './lib/supabase';
import { preloadPredictedRoutes, preloadRoute, ROUTES } from './utils/routePreloader';
import { requestPersistentStorage, checkStorageSpace } from './utils/offlineStorage';
import { registerServiceWorker, keepServiceWorkerAlive, handleConnectivityChange } from './utils/serviceWorker';
import { ServiceWorkerUpdateNotification } from './components/ui/ServiceWorkerUpdateNotification';
import { trackPerformanceMetrics, applyPerformanceOptimizations } from './utils/performance';

// Declare global type extension for Window
declare global {
  interface Window {
    syncCoursesOfflineChanges?: () => Promise<boolean>;
  }
}

// Page import functions for prefetching
const importAdminDashboard = () => import('./pages/AdminDashboard').then(module => ({ default: module.AdminDashboard }));
const importUpcomingPage = () => import('./pages/UpcomingPage').then(module => ({ default: module.UpcomingPage }));
const importSearchPage = () => import('./pages/SearchPage').then(module => ({ default: module.SearchPage }));
const importNotificationsPage = () => import('./pages/NotificationsPage').then(module => ({ default: module.NotificationsPage }));
const importCoursePage = () => import('./pages/CoursePage').then(module => ({ default: module.CoursePage }));
const importStudyMaterialsPage = () => import('./pages/StudyMaterialsPage').then(module => ({ default: module.StudyMaterialsPage }));
const importRoutinePage = () => import('./pages/RoutinePage').then(module => ({ default: module.RoutinePage }));

// Lazy-loaded components with instant loading config
const AdminDashboard = lazy(importAdminDashboard);
const UpcomingPage = lazy(importUpcomingPage);
const SearchPage = lazy(importSearchPage);
const NotificationsPage = lazy(importNotificationsPage);
const CoursePage = lazy(importCoursePage);
const StudyMaterialsPage = lazy(importStudyMaterialsPage);
const RoutinePage = lazy(importRoutinePage);

type StatFilter = 'all' | 'overdue' | 'in-progress' | 'completed';

export default function App() {
  // Always call all hooks first, regardless of any conditions
  const { user, loading: authLoading, error: authError, login, signup, logout, forgotPassword } = useAuth();
  const { users, loading: usersLoading } = useUsers();
  const { 
    tasks, 
    loading: tasksLoading, 
    createTask, 
    updateTask, 
    deleteTask,
    refreshTasks,
    syncOfflineChanges
  } = useTasks(user?.id);
  const {
    routines,
    loading: routinesLoading,
    syncOfflineChanges: syncRoutineChanges
  } = useRoutines();
  const { 
    notifications, 
    unreadCount,
    markAsRead, 
    markAllAsRead, 
    clearNotification 
  } = useNotifications(user?.id);
  const isOffline = useOfflineStatus();
  
  const [activePage, setActivePage] = useState<NavPage>('home');
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | null>(null);
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isResetPasswordFlow, setIsResetPasswordFlow] = useState(false);

  // Use predictive preloading based on navigation patterns
  const { predictedPages, recordAction } = usePredictivePreload(activePage, {
    enabled: true,
    threshold: 2
  });

  // Initialize performance monitoring
  useEffect(() => {
    // Start performance monitoring after app is loaded
    if (!isLoading && user) {
      setTimeout(() => {
        trackPerformanceMetrics();
        applyPerformanceOptimizations();
      }, 1000);
    }
  }, [isLoading, user]);

  // Preload resources for predicted pages
  useEffect(() => {
    if (predictedPages.length > 0) {
      // Convert page names to route paths
      const routesToPreload = predictedPages.map(page => {
        switch (page) {
          case 'home': return ROUTES.HOME;
          case 'upcoming': return ROUTES.TASKS;
          case 'search': return ROUTES.TASKS;
          case 'notifications': return ROUTES.NOTIFICATIONS;
          case 'courses': return ROUTES.COURSES;
          case 'study-materials': return ROUTES.COURSES;
          case 'routine': return ROUTES.ROUTINES;
          default: return ROUTES.HOME;
        }
      });
      
      // Preload the routes
      preloadPredictedRoutes(routesToPreload);
    }
  }, [predictedPages]);

  // Preload the current page's assets when page changes
  useEffect(() => {
    let routePath = ROUTES.HOME;
    
    switch (activePage) {
      case 'home': routePath = ROUTES.HOME; break;
      case 'upcoming': routePath = ROUTES.TASKS; break;
      case 'search': routePath = ROUTES.TASKS; break;
      case 'notifications': routePath = ROUTES.NOTIFICATIONS; break;
      case 'courses': routePath = ROUTES.COURSES; break;
      case 'study-materials': routePath = ROUTES.COURSES; break;
      case 'routine': routePath = ROUTES.ROUTINES; break;
    }
    
    // Preload the current route
    preloadRoute(routePath);
  }, [activePage]);

  // Initialize and register service worker
  useEffect(() => {
    const initializeServiceWorker = async () => {
      // Check if we've already attempted to register the service worker in this session
      const hasAttempted = sessionStorage.getItem('serviceWorkerInitAttempted');
      
      if (hasAttempted === 'true') {
        console.log('Service worker initialization already attempted in this session, skipping');
        return;
      }
      
      // Mark that we've attempted service worker registration
      sessionStorage.setItem('serviceWorkerInitAttempted', 'true');
      
      if ('serviceWorker' in navigator) {
        try {
          const registration = await registerServiceWorker();
          if (registration) {
            // Keep service worker active
            keepServiceWorkerAlive(registration);
            
            console.log('Service worker registered successfully');
          }
        } catch (error) {
          console.error('Failed to register service worker:', error);
        }
      }
    };
    
    // Initialize after a short delay to prioritize app loading
    const timerId = setTimeout(() => {
      initializeServiceWorker();
    }, 2000);
    
    return () => clearTimeout(timerId);
  }, []); // Empty dependency array ensures this only runs once

  // Calculate today's task count - always compute this value regardless of rendering path
  const todayTaskCount = useMemo(() => {
    if (!tasks || tasks.length === 0) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to start of day
    
    return tasks.filter(task => {
      // Skip tasks with invalid dates
      if (!task.dueDate) return false;
      
      try {
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0); // Normalize task date to start of day
        
        // Only count non-completed tasks due today
        return isSameDay(taskDate, today) && task.status !== 'completed';
      } catch (e) {
        // Skip tasks with invalid date format
        return false;
      }
    }).length;
  }, [tasks]);

  // Compute task stats - moved here from inside render to ensure consistent hook order
  const taskStats = useMemo(() => ({
    total: tasks.length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => isOverdue(t.dueDate) && t.status !== 'completed').length
  }), [tasks]);

  // Compute category counts - moved here from inside render to ensure consistent hook order
  const categoryCounts = useMemo(() => {
    return tasks.reduce((acc: Record<string, number>, task) => {
      if (!acc[task.category]) {
        acc[task.category] = 0;
      }
      acc[task.category] = (acc[task.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [tasks]);

  // Check for unread notifications - moved here from inside render
  const hasUnreadNotifications = useMemo(() => unreadCount > 0, [unreadCount]);

  // Check URL hash for password recovery path
  const checkHashForRecovery = useCallback(() => {
    const hash = window.location.hash;
    
    // If the URL contains the recovery path, set the reset password flow
    if (hash.includes('#auth/recovery')) {
      setIsResetPasswordFlow(true);
    }
  }, []);
  
  // Check hash on initial load and when it changes
  useEffect(() => {
    // Reduce artificial loading delay to improve perceived performance
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800); // Reduced from 2000ms to 800ms

    // Check hash on initial load
    checkHashForRecovery();
    
    // Also listen for hash changes
    const handleHashChange = () => {
      checkHashForRecovery();
    };
    
    window.addEventListener('hashchange', handleHashChange);

    // Listen for auth state changes, including password recovery
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResetPasswordFlow(true);
      }
    });
    
    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [checkHashForRecovery]);

  // Handle syncing all offline changes when coming back online
  const syncAllOfflineChanges = async () => {
    try {
      console.log('Syncing offline changes for critical data...');
      
      // First, prioritize critical data types
      let tasksSuccess = await syncOfflineChanges().catch(() => false);
      let routinesSuccess = await syncRoutineChanges().catch(() => false);
      
      // Only try to sync courses if we have that hook available
      let coursesSuccess = true;
      if (typeof window.syncCoursesOfflineChanges === 'function') {
        coursesSuccess = await window.syncCoursesOfflineChanges().catch(() => false);
      }
      
      // Refresh data regardless of sync outcome to ensure UI is updated
      refreshTasks();
      
      return tasksSuccess && routinesSuccess && coursesSuccess;
    } catch (error) {
      console.error('Error in sync process:', error);
      return false;
    }
  };
  
  // Function to clear non-critical data if storage is low
  const clearNonCriticalData = async () => {
    try {
      console.log('Clearing non-critical data to free up space...');
      
      // Get all store names from STORES
      const allStores = Object.values(STORES);
      
      // Filter to get only non-critical stores
      const nonCriticalStores = allStores.filter(store => !CRITICAL_STORES.includes(store));
      
      // Clear each non-critical store
      for (const store of nonCriticalStores) {
        await clearIndexedDBStore(store);
      }
      
      console.log('Non-critical data cleared successfully');
      return true;
    } catch (error) {
      console.error('Error clearing non-critical data:', error);
      return false;
    }
  };

  // Filter tasks based on selected stat
  const getFilteredTasks = () => {
    let filtered = tasks;

    // First apply category filter if selected
    if (selectedCategory) {
      filtered = filtered.filter(task => task.category === selectedCategory);
    }

    // Then apply stat filter
    switch (statFilter) {
      case 'overdue':
        return filtered.filter(task => isOverdue(task.dueDate) && task.status !== 'completed');
      case 'in-progress':
        return filtered.filter(task => task.status === 'in-progress');
      case 'completed':
        return filtered.filter(task => task.status === 'completed');
      default:
        return filtered;
    }
  };

  const getStatTitle = () => {
    switch (statFilter) {
      case 'overdue':
        return 'Due Tasks';
      case 'in-progress':
        return 'In Progress Tasks';
      case 'completed':
        return 'Completed Tasks';
      default:
        return selectedCategory 
          ? `${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1).replace('-', ' ')} Tasks`
          : 'All Tasks';
    }
  };

  const renderContent = () => {
    switch (activePage) {
      case 'upcoming':
        return (
          <Suspense fallback={<LoadingScreen minimumLoadTime={300} />}>
            <UpcomingPage tasks={tasks} />
          </Suspense>
        );
      case 'search':
        return (
          <Suspense fallback={<LoadingScreen minimumLoadTime={300} />}>
            <SearchPage tasks={tasks} />
          </Suspense>
        );
      case 'notifications':
        return (
          <Suspense fallback={<LoadingScreen minimumLoadTime={300} />}>
            <NotificationsPage
              notifications={notifications}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
              onClear={clearNotification}
            />
          </Suspense>
        );
      case 'courses':
        return (
          <Suspense fallback={<LoadingScreen minimumLoadTime={300} />}>
            <CoursePage />
          </Suspense>
        );
      case 'study-materials':
        return (
          <Suspense fallback={<LoadingScreen minimumLoadTime={300} />}>
            <StudyMaterialsPage />
          </Suspense>
        );
      case 'routine':
        return (
          <Suspense fallback={<LoadingScreen minimumLoadTime={300} />}>
            <RoutinePage />
          </Suspense>
        );
      default:
        return (
          <div className="space-y-8">
            {/* Welcome Section */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 sm:p-8 text-white">
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                Welcome back, {user?.name || 'User'}!
              </h1>
              <p className="text-blue-100">
                You have {taskStats.total} total tasks
              </p>
            </div>

            {/* Task Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <button
                onClick={() => setStatFilter('all')}
                className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all ${
                  statFilter === 'all' ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <ListTodo className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {taskStats.total}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Tasks</p>
              </button>

              <button
                onClick={() => setStatFilter('overdue')}
                className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all ${
                  statFilter === 'overdue' ? 'ring-2 ring-red-500 dark:ring-red-400' : ''
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {taskStats.overdue}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Due Tasks</p>
              </button>

              <button
                onClick={() => setStatFilter('in-progress')}
                className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all ${
                  statFilter === 'in-progress' ? 'ring-2 ring-indigo-500 dark:ring-indigo-400' : ''
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                    <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {taskStats.inProgress}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">In Progress</p>
              </button>

              <button
                onClick={() => setStatFilter('completed')}
                className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all ${
                  statFilter === 'completed' ? 'ring-2 ring-green-500 dark:ring-green-400' : ''
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {taskStats.completed}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Completed</p>
              </button>
            </div>

            {/* Task Categories */}
            <TaskCategories
              onCategorySelect={(category) => {
                setSelectedCategory(category);
                setStatFilter('all');
              }}
              selectedCategory={selectedCategory}
              categoryCounts={categoryCounts}
            />

            {/* Task List */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {getStatTitle()}
                </h2>
                {statFilter !== 'all' && (
                  <button
                    onClick={() => setStatFilter('all')}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    View All Tasks
                  </button>
                )}
              </div>
              <TaskList
                tasks={getFilteredTasks()}
                showDeleteButton={false}
                onRefresh={refreshTasks}
              />
            </div>
          </div>
        );
    }
  };

  useEffect(() => {
    // Initialize offline storage features
    const initOfflineStorage = async () => {
      try {
        // Request persistent storage
        const isPersisted = await requestPersistentStorage();
        
        // Check available storage space
        const storageInfo = await checkStorageSpace();
        if (storageInfo) {
          console.log('Storage space info:', storageInfo);
          
          // If storage space is low (less than 100MB), take action
          if (storageInfo.availableSpace < 100 * 1024 * 1024) {
            console.warn('Low storage space available:', storageInfo.availableSpace / (1024 * 1024), 'MB');
            
            // Clear non-critical data to free up space
            await clearNonCriticalData();
            
            // Check storage space again after clearing
            const updatedStorageInfo = await checkStorageSpace();
            console.log('Updated storage space after clearing non-critical data:', updatedStorageInfo);
          }
        }
        
        // Register service worker
        const registration = await registerServiceWorker();
        if (registration) {
          // Keep service worker alive
          keepServiceWorkerAlive(registration);
          
          // Handle connectivity changes
          handleConnectivityChange(registration);
        }
      } catch (error) {
        console.error('Error initializing offline storage:', error);
      }
    };
    
    initOfflineStorage();
  }, []);

  // Early returns based on loading state and authentication
  if (isLoading || authLoading || (user?.role === 'admin' && usersLoading)) {
    return <LoadingScreen minimumLoadTime={300} />;
  }

  // Handle password reset flow
  if (isResetPasswordFlow) {
    return <ResetPasswordPage />;
  }

  if (!user) {
    return (
      <AuthPage
        onLogin={(credentials, rememberMe = false) => login(credentials, rememberMe)}
        onSignup={signup}
        onForgotPassword={forgotPassword}
        error={authError || undefined}
      />
    );
  }

  if (user.role === 'admin') {
    return (
      <Suspense fallback={<LoadingScreen minimumLoadTime={300} />}>
        <AdminDashboard
          users={users}
          tasks={tasks}
          onLogout={logout}
          onDeleteUser={() => {}}
          onCreateTask={createTask}
          onDeleteTask={deleteTask}
          onUpdateTask={updateTask}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation 
        onLogout={logout}
        hasUnreadNotifications={hasUnreadNotifications}
        onNotificationsClick={() => setShowNotifications(true)}
        activePage={activePage}
        onPageChange={setActivePage}
        user={{
          name: user.name,
          email: user.email,
        }}
        taskStats={taskStats}
        tasks={tasks}
      />
      
      {showNotifications && (
        <NotificationPanel
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onClear={clearNotification}
        />
      )}
      
      <main className="max-w-7xl mx-auto px-4 py-20 pb-24">
        {isOffline && (
          <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-yellow-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  You are currently offline. Some features may be limited.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {tasksLoading ? (
          <LoadingScreen minimumLoadTime={300} />
        ) : (
          renderContent()
        )}
      </main>

      <BottomNavigation 
        activePage={activePage}
        onPageChange={setActivePage}
        hasUnreadNotifications={hasUnreadNotifications}
        todayTaskCount={todayTaskCount}
      />

      <InstallPWA />
      <OfflineIndicator />
      <OfflineToast />
      <ServiceWorkerUpdateNotification position="bottom" />
    </div>
  );
}