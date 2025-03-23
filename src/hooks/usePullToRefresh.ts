import { useState, useCallback } from 'react';

interface UsePullToRefreshProps {
  onRefresh: () => Promise<any>;
  disabled?: boolean;
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
 * @returns Object containing refresh state and props to pass to PullToRefresh component
 */
export function usePullToRefresh({
  onRefresh,
  disabled = false,
}: UsePullToRefreshProps): UsePullToRefreshReturn {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startRefresh = useCallback(async () => {
    if (isRefreshing || disabled) return;
    
    setIsRefreshing(true);
    
    try {
      await onRefresh();
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, isRefreshing, disabled]);

  return {
    isRefreshing,
    startRefresh,
    refreshProps: {
      onRefresh: startRefresh,
      disabled,
    },
  };
} 