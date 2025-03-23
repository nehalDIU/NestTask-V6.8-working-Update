import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';
import { applyUpdate } from '../../utils/serviceWorkerUtils';

interface ServiceWorkerUpdateNotificationProps {
  duration?: number;
  position?: 'top' | 'bottom';
}

export function ServiceWorkerUpdateNotification({
  duration = 0, // 0 means it will stay until dismissed
  position = 'bottom'
}: ServiceWorkerUpdateNotificationProps) {
  const [visible, setVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  useEffect(() => {
    // Clear notification flag on component mount to prevent repeated popup
    if (sessionStorage.getItem('dismissedUpdateNotification') === 'true') {
      sessionStorage.removeItem('dismissedUpdateNotification');
    }
    
    // Listen for update available events
    const handleUpdateAvailable = () => {
      // Don't show if the user explicitly dismissed it in this session
      if (sessionStorage.getItem('dismissedUpdateNotification') !== 'true') {
        setVisible(true);
      }
      
      // Auto-hide after duration if specified
      if (duration > 0) {
        const timer = setTimeout(() => {
          setVisible(false);
        }, duration);
        
        return () => clearTimeout(timer);
      }
    };
    
    // Listen for service worker updates
    window.addEventListener('sw-update-available', handleUpdateAvailable);
    
    // Also listen for toast events with update message
    const handleToastEvent = (event: CustomEvent) => {
      const detail = event.detail;
      if (detail?.message?.includes('New version') || 
          detail?.message?.includes('update')) {
        // Don't show if the user explicitly dismissed it in this session
        if (sessionStorage.getItem('dismissedUpdateNotification') !== 'true') {
          setVisible(true);
        }
      }
    };
    
    window.addEventListener('show-toast', handleToastEvent as EventListener);
    
    // Listen for controller change events (when new service worker takes over)
    const handleControllerChange = () => {
      if (isUpdating) {
        // Reload the page to use new assets
        window.location.reload();
      }
    };
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }
    
    return () => {
      window.removeEventListener('sw-update-available', handleUpdateAvailable);
      window.removeEventListener('show-toast', handleToastEvent as EventListener);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, [duration, isUpdating]);
  
  // Handle refresh action
  const handleRefresh = async () => {
    try {
      setIsUpdating(true);
      
      // First, tell the waiting service worker to skip waiting
      const updated = await applyUpdate();
      
      if (!updated) {
        // If no update was applied, just reload the page
        console.log('No waiting service worker found, refreshing page directly');
        window.location.reload();
      }
      // Otherwise, wait for the controllerchange event (handled in useEffect)
      // which will trigger the reload after the new service worker takes control
      
    } catch (error) {
      console.error('Failed to update service worker:', error);
      // Fallback to simple reload
      window.location.reload();
    }
  };
  
  // Handle dismiss action
  const handleDismiss = () => {
    // Mark that user explicitly dismissed the notification
    sessionStorage.setItem('dismissedUpdateNotification', 'true');
    setVisible(false);
  };
  
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`fixed ${position === 'top' ? 'top-4' : 'bottom-4'} left-1/2 transform -translate-x-1/2 z-50`}
          initial={{ opacity: 0, y: position === 'top' ? -20 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: position === 'top' ? -20 : 20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 max-w-md w-full">
            <RefreshCw className={`h-5 w-5 ${isUpdating ? 'animate-spin' : 'animate-spin-slow'}`} />
            <div className="flex-1">
              <p className="text-sm font-medium">New version available</p>
              <p className="text-xs opacity-90">
                {isUpdating ? 'Applying update...' : 'Refresh to update the application'}
              </p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleRefresh}
                disabled={isUpdating}
                className="bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdating ? 'Updating...' : 'Update'}
              </button>
              {!isUpdating && (
                <button
                  onClick={handleDismiss}
                  className="text-white/80 hover:text-white"
                  aria-label="Dismiss"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 