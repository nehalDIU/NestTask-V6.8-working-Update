import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { ArrowDownCircle, RefreshCw, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  pullDownThreshold?: number;
  maxPullDownDistance?: number;
  refreshIndicatorHeight?: number;
  loadingIndicator?: ReactNode;
  pullDownIndicator?: ReactNode;
  releaseIndicator?: ReactNode;
  successIndicator?: ReactNode;
  className?: string;
  disabled?: boolean;
  backgroundColor?: string;
  textColor?: string;
  showSuccessMessage?: boolean;
  successMessage?: string;
  successDuration?: number;
  refreshTimeout?: number; // Min time to show the refreshing state
}

export function PullToRefresh({
  onRefresh,
  children,
  pullDownThreshold = 80,
  maxPullDownDistance = 120,
  refreshIndicatorHeight = 60,
  loadingIndicator,
  pullDownIndicator,
  releaseIndicator,
  successIndicator,
  className = '',
  disabled = false,
  backgroundColor = 'bg-gradient-to-b from-blue-100 to-white dark:from-gray-800 dark:to-gray-900',
  textColor = 'text-blue-600 dark:text-blue-400',
  showSuccessMessage = true,
  successMessage = 'Successfully refreshed',
  successDuration = 1200,
  refreshTimeout = 800,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<number | null>(null);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track touch state with refs
  const startY = useRef<number | null>(null);
  const currentY = useRef<number | null>(null);
  const isPulling = useRef(false);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const shouldRefresh = pullDistance >= pullDownThreshold;
  const pullPercentage = Math.min(100, (pullDistance / pullDownThreshold) * 100);

  // Handle the actual refresh action
  const handleRefresh = async () => {
    if (isRefreshing || disabled || refreshPromiseRef.current) return;
    
    console.log('Starting refresh...');
    setIsRefreshing(true);
    setRefreshProgress(0);
    
    // Start progress animation
    const progressInterval = setInterval(() => {
      setRefreshProgress(prev => {
        // Gradually increase to 90%, then wait for actual completion
        const increment = prev < 30 ? 5 : prev < 60 ? 3 : prev < 90 ? 1 : 0;
        return Math.min(90, prev + increment);
      });
    }, 100);
    
    try {
      // Track minimum display time with a Promise
      const minDisplayPromise = new Promise<void>(resolve => {
        refreshTimeoutRef.current = setTimeout(() => {
          refreshTimeoutRef.current = null;
          resolve();
        }, refreshTimeout);
      });
      
      // Start refresh operation
      const startTime = performance.now();
      refreshPromiseRef.current = onRefresh();
      
      // Wait for both the refresh to complete and the minimum display time
      await refreshPromiseRef.current;
      await minDisplayPromise;
      
      const duration = performance.now() - startTime;
      console.log(`Refresh completed in ${duration.toFixed(2)}ms`);
      
      // Set to 100% complete
      setRefreshProgress(100);
      
      // Show success indicator briefly
      if (showSuccessMessage) {
        setShowSuccess(true);
        successTimeoutRef.current = setTimeout(() => {
          setShowSuccess(false);
          setIsRefreshing(false);
          setPullDistance(0);
          setRefreshProgress(0);
        }, successDuration);
      } else {
        // Reset without showing success
        setIsRefreshing(false);
        setPullDistance(0);
        setRefreshProgress(0);
      }
      
      // Update last refresh time
      setLastRefreshTime(Date.now());
    } catch (error) {
      console.error('Error refreshing:', error);
      setRefreshProgress(0);
      setIsRefreshing(false);
      setPullDistance(0);
    } finally {
      refreshPromiseRef.current = null;
      clearInterval(progressInterval);
      
      // Clear timeout if still running
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    }
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  // Setup global event listeners - this is key for Facebook-style top swipe
  useEffect(() => {
    if (disabled) return;
    
    // These handlers will be attached to the document for top-level capture
    const handleTouchStart = (e: TouchEvent) => {
      // Skip if already refreshing
      if (isRefreshing) return;
      
      // Check if we're already at the top of the page
      const isAtTop = window.scrollY <= 1;
      
      // Only capture touches that start near the top when already at top of page
      if (isAtTop && e.touches[0].clientY < 150) {
        startY.current = e.touches[0].clientY;
        currentY.current = startY.current;
        isPulling.current = true;
        
        // Add momentum damping class to body
        document.body.classList.add('pull-momentum-damping');
        
        console.log('Touch near top detected:', startY.current);
      }
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshing) return;
      
      currentY.current = e.touches[0].clientY;
      
      if (startY.current !== null && currentY.current !== null) {
        const deltaY = Math.max(0, currentY.current - startY.current);
        
        // Start pull effect once we've moved a minimum distance (10px)
        if (deltaY > 10) {
          // Prevent the browser's native pull-to-refresh
          e.preventDefault();
          
          // Calculate distance with progressive resistance
          // More resistance as you pull further
          const resistanceFactor = 0.5 - Math.min(0.3, (deltaY / 1000));
          const distance = Math.min(
            maxPullDownDistance,
            deltaY * resistanceFactor
          );
          
          setPullDistance(distance);
          
          // Add haptic feedback at the threshold point
          if (deltaY > pullDownThreshold && 'navigator' in window && 'vibrate' in navigator) {
            try {
              if (deltaY >= pullDownThreshold && deltaY < pullDownThreshold + 5) {
                navigator.vibrate(10); // Subtle vibration
              }
            } catch (e) {
              // Vibration API not supported or permission not granted
            }
          }
        }
      }
    };
    
    const handleTouchEnd = () => {
      if (!isPulling.current || isRefreshing) return;
      
      isPulling.current = false;
      
      // Remove momentum damping class
      document.body.classList.remove('pull-momentum-damping');
      
      if (shouldRefresh) {
        handleRefresh();
      } else {
        // Spring back animation
        setPullDistance(0);
      }
      
      startY.current = null;
      currentY.current = null;
    };
    
    // Add event listeners to document for top-level capture
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    // Clean up
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.body.classList.remove('pull-momentum-damping');
    };
  }, [disabled, isRefreshing, maxPullDownDistance, pullDownThreshold, shouldRefresh]);

  // Format the last refresh time
  const getLastRefreshText = () => {
    if (!lastRefreshTime) return '';
    
    const now = Date.now();
    const diff = now - lastRefreshTime;
    
    // Less than a minute
    if (diff < 60000) {
      return 'Updated just now';
    }
    
    // Less than an hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `Updated ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    // Less than a day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `Updated ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    // Format as date for older updates
    const date = new Date(lastRefreshTime);
    return `Updated on ${date.toLocaleDateString()}`;
  };

  // Custom indicator components
  const DefaultLoadingIndicator = (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <div className="relative h-8 w-8">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
          {Math.round(refreshProgress)}%
        </div>
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {getLastRefreshText()}
      </span>
    </div>
  );

  const DefaultPullDownIndicator = (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <div className="flex items-center justify-center gap-2">
        <ArrowDownCircle 
          className={`w-6 h-6 transition-transform ${
            pullPercentage > 30 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
          } ${
            pullPercentage > 85 ? 'scale-125' : pullPercentage > 60 ? 'scale-110' : 'scale-100'
          }`}
        />
        <span className={`text-sm font-medium ${
          pullPercentage > 30 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
        }`}>
          Pull down to refresh
        </span>
      </div>
      <div className="w-40 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
        <div 
          className="bg-blue-600 dark:bg-blue-500 h-1.5 rounded-full transition-all" 
          style={{ width: `${pullPercentage}%` }}
        />
      </div>
    </div>
  );

  const DefaultReleaseIndicator = (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <div className="flex items-center justify-center gap-2">
        <RefreshCw className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-pulse" />
        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
          Release to refresh
        </span>
      </div>
      <div className="w-40 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
        <div 
          className="bg-blue-600 dark:bg-blue-500 h-1.5 rounded-full transition-all" 
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
  
  const DefaultSuccessIndicator = (
    <div className="flex items-center justify-center w-full h-full gap-2">
      <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
      <span className="text-sm font-medium text-green-600 dark:text-green-400">
        {successMessage}
      </span>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={`pull-to-refresh-container relative overflow-visible ${className}`}
    >
      {/* Fixed-position Pull-to-refresh indicator at the top of viewport */}
      <AnimatePresence>
        {(pullDistance > 0 || isRefreshing || showSuccess) && (
          <motion.div 
            className={`fixed left-0 right-0 top-0 flex items-center justify-center overflow-hidden z-50 ${backgroundColor} border-b border-gray-200 dark:border-gray-700 shadow-md`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ 
              height: isRefreshing || showSuccess ? refreshIndicatorHeight : pullDistance,
              opacity: 1
            }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ 
              type: 'spring', 
              damping: 26, 
              stiffness: 170,
              mass: 0.9 
            }}
          >
            {showSuccess ? (
              successIndicator || DefaultSuccessIndicator
            ) : isRefreshing ? (
              loadingIndicator || DefaultLoadingIndicator
            ) : shouldRefresh ? (
              releaseIndicator || DefaultReleaseIndicator
            ) : (
              pullDownIndicator || DefaultPullDownIndicator
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content with smooth translation */}
      <motion.div
        className="will-change-transform transform-gpu"
        animate={{ 
          y: isRefreshing || showSuccess ? refreshIndicatorHeight : pullDistance 
        }}
        transition={{ 
          type: 'spring', 
          damping: 26,
          stiffness: 180,
          mass: 0.9
        }}
      >
        {children}
      </motion.div>

      {/* Add a style tag for the momentum damping class */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .pull-momentum-damping {
            overscroll-behavior-y: none;
            touch-action: pan-x pan-y;
            -webkit-overflow-scrolling: auto;
          }
        `
      }} />
    </div>
  );
} 