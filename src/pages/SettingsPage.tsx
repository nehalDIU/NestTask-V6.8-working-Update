import { RefreshCw, Trash2 } from 'lucide-react';
import { triggerManualUpdateCheck, resetUpdateNotificationState } from '../utils/serviceWorkerUtils';

// ... existing code ...

// Add this to the component's JSX, usually in a settings section:
<div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
    App Updates & Data
  </h3>
  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
    Manage your app version and cached data
  </p>
  <div className="mt-4 space-y-4">
    <button
      onClick={async () => {
        try {
          // First show a loading toast
          window.dispatchEvent(new CustomEvent('show-toast', { 
            detail: { 
              message: 'Checking for updates...',
              type: 'info',
              duration: 3000
            } 
          }));
          
          // Check for updates
          const updateAvailable = await triggerManualUpdateCheck();
          
          if (updateAvailable) {
            // Update available - notification will be shown automatically
            console.log('Update available, notification triggered');
          } else {
            // No update available
            window.dispatchEvent(new CustomEvent('show-toast', { 
              detail: { 
                message: 'You are already using the latest version.',
                type: 'success',
                duration: 3000
              } 
            }));
          }
        } catch (error) {
          console.error('Error checking for updates:', error);
          // Show error toast
          window.dispatchEvent(new CustomEvent('show-toast', { 
            detail: { 
              message: 'Error checking for updates. Please try again.',
              type: 'error',
              duration: 5000
            } 
          }));
        }
      }}
      className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
    >
      <RefreshCw className="mr-2 -ml-1 h-4 w-4" />
      Check for Updates
    </button>
    <button
      onClick={() => {
        // Clear all cached data to resolve potential issues
        resetUpdateNotificationState();
        caches.keys().then(cacheNames => {
          cacheNames.forEach(cacheName => {
            caches.delete(cacheName).then(() => {
              window.dispatchEvent(new CustomEvent('show-toast', { 
                detail: { 
                  message: 'Cached data cleared successfully. Refresh to apply changes.',
                  type: 'success',
                  duration: 5000,
                  action: {
                    label: 'Refresh',
                    onClick: () => window.location.reload()
                  }
                } 
              }));
            });
          });
        });
      }}
      className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
    >
      <Trash2 className="mr-2 -ml-1 h-4 w-4" />
      Clear Cached Data
    </button>
  </div>
</div>
// ... existing code ... 