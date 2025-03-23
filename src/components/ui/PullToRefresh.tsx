import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { ArrowDownCircle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  pullDownThreshold?: number;
  maxPullDownDistance?: number;
  refreshIndicatorHeight?: number;
  loadingIndicator?: ReactNode;
  pullDownIndicator?: ReactNode;
  releaseIndicator?: ReactNode;
  className?: string;
  disabled?: boolean;
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
  className = '',
  disabled = false,
}: PullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const currentYRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  
  const shouldRefresh = pullDistance >= pullDownThreshold;

  // Handle the actual refresh action
  const handleRefresh = async () => {
    if (isRefreshing || disabled) return;
    
    setIsRefreshing(true);
    
    try {
      await onRefresh();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      // Add a small delay to make the refresh indicator visible
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 600);
    }
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    lastScrollTopRef.current = scrollTop;
    
    // Only enable pull-to-refresh when at the top of the content
    if (scrollTop <= 0) {
      startYRef.current = e.touches[0].clientY;
      currentYRef.current = startYRef.current;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || disabled || isRefreshing) return;
    
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    
    // If scrolled down, cancel the pull-to-refresh
    if (scrollTop > 0) {
      startYRef.current = null;
      setIsPulling(false);
      setPullDistance(0);
      return;
    }
    
    if (startYRef.current !== null) {
      currentYRef.current = e.touches[0].clientY;
      const deltaY = Math.max(0, currentYRef.current - startYRef.current);
      
      // Apply a resistance factor to make the pull feel more natural
      const resistanceFactor = 0.4;
      const distance = Math.min(maxPullDownDistance, deltaY * resistanceFactor);
      
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    if (!isPulling || disabled || isRefreshing) return;
    
    setIsPulling(false);
    
    if (shouldRefresh) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
    
    startYRef.current = null;
    currentYRef.current = null;
  };

  // Custom indicator components
  const DefaultLoadingIndicator = (
    <div className="flex items-center justify-center w-full h-full">
      <RefreshCw className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  const DefaultPullDownIndicator = (
    <div className="flex items-center justify-center w-full h-full gap-2">
      <ArrowDownCircle 
        className={`w-5 h-5 transition-transform ${shouldRefresh ? 'scale-110' : 'scale-100'}`}
      />
      <span className="text-sm font-medium">Pull down to refresh</span>
    </div>
  );

  const DefaultReleaseIndicator = (
    <div className="flex items-center justify-center w-full h-full gap-2">
      <RefreshCw className="w-5 h-5" />
      <span className="text-sm font-medium">Release to refresh</span>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={`pull-to-refresh-container relative overflow-hidden ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <motion.div 
        className="absolute left-0 right-0 flex items-center justify-center overflow-hidden z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700"
        initial={{ height: 0, opacity: 0 }}
        animate={{ 
          height: isRefreshing ? refreshIndicatorHeight : pullDistance, 
          opacity: isRefreshing || pullDistance > 0 ? 1 : 0 
        }}
        transition={{ type: 'spring', damping: 30, stiffness: 200 }}
      >
        {isRefreshing ? (
          loadingIndicator || DefaultLoadingIndicator
        ) : shouldRefresh ? (
          releaseIndicator || DefaultReleaseIndicator
        ) : (
          pullDownIndicator || DefaultPullDownIndicator
        )}
      </motion.div>

      {/* Content with translation */}
      <motion.div
        className="pull-to-refresh-content"
        animate={{ 
          y: isRefreshing ? refreshIndicatorHeight : pullDistance 
        }}
        transition={{ type: 'spring', damping: 30, stiffness: 200 }}
      >
        {children}
      </motion.div>
    </div>
  );
} 