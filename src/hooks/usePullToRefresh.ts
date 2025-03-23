import { useState, useCallback, useRef, useEffect } from 'react';

interface UsePullToRefreshProps {
  onRefresh: () => Promise<any>;
  disabled?: boolean;
  refreshTimeout?: number;
}

interface UsePullToRefreshReturn {
  isRefreshing: boolean;
  startRefresh: () => Promise<void>;
  refreshProps: {
    onRefresh: () => Promise<void>;
    disabled: boolean;
  };
}

/**
 * Custom hook to handle pull-to-refresh functionality
 * @param onRefresh Function to call when a refresh is triggered
 * @param disabled Whether the pull-to-refresh functionality is disabled
 * @param refreshTimeout Minimum time to show the refresh indicator (for UX)
 * @returns Object containing refresh state and props to pass to PullToRefresh component
 */
export function usePullToRefresh({
  onRefresh,
  disabled = false,
  refreshTimeout = 800,
}: UsePullToRefreshProps): UsePullToRefreshReturn {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<number | null>(null);
  const refreshPromiseRef = useRef<Promise<any> | null>(null);
  
  // Clean up any timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  const startRefresh = useCallback(async () => {
    // Don't allow multiple concurrent refreshes
    if (isRefreshing || disabled || refreshPromiseRef.current) {
      console.debug('Pull-to-refresh skipped: already refreshing or disabled');
      return;
    }
    
    console.debug('Pull-to-refresh triggered, starting refresh...');
    setIsRefreshing(true);
    
    // Start a timer for minimum display time for better UX
    const minDisplayPromise = new Promise<void>(resolve => {
      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        resolve();
      }, refreshTimeout);
    });
    
    try {
      const startTime = performance.now();
      
      // This will be our refresh operation promise
      refreshPromiseRef.current = onRefresh();
      
      // Wait for the refresh to complete
      await refreshPromiseRef.current;
      
      const duration = performance.now() - startTime;
      console.debug(`Pull-to-refresh operation completed in ${duration.toFixed(2)}ms`);
      
      // Wait for minimum display time to complete
      await minDisplayPromise;
    } catch (error) {
      console.error('Error during pull-to-refresh:', error);
    } finally {
      // Clear refs and reset state
      refreshPromiseRef.current = null;
      
      // In case the timeout hasn't fired yet
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      
      setIsRefreshing(false);
      console.debug('Pull-to-refresh state reset');
    }
  }, [onRefresh, isRefreshing, disabled, refreshTimeout]);

  return {
    isRefreshing,
    startRefresh,
    refreshProps: {
      onRefresh: startRefresh,
      disabled,
    },
  };
} 