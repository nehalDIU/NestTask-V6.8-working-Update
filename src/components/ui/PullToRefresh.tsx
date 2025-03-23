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
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track touch state with refs
  const startY = useRef<number | null>(null);
  const currentY = useRef<number | null>(null);
  const isPulling = useRef(false);
  
  const shouldRefresh = pullDistance >= pullDownThreshold;

  // Handle the actual refresh action
  const handleRefresh = async () => {
    if (isRefreshing || disabled) return;
    
    console.log('Starting refresh...');
    setIsRefreshing(true);
    
    try {
      await onRefresh();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 800);
    }
  };

  // Setup global event listeners - this is key for Facebook-style top swipe
  useEffect(() => {
    if (disabled) return;
    
    // These handlers will be attached to the document for top-level capture
    const handleTouchStart = (e: TouchEvent) => {
      // Only capture touches that start very close to the top of the viewport
      if (e.touches[0].clientY < 60 && window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        currentY.current = startY.current;
        isPulling.current = true;
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
          
          // Calculate distance with resistance (like Facebook)
          const resistance = 0.4;
          const distance = Math.min(maxPullDownDistance, deltaY * resistance);
          
          setPullDistance(distance);
        }
      }
    };
    
    const handleTouchEnd = () => {
      if (!isPulling.current || isRefreshing) return;
      
      isPulling.current = false;
      
      if (shouldRefresh) {
        handleRefresh();
      } else {
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
    };
  }, [disabled, isRefreshing, maxPullDownDistance, pullDownThreshold, shouldRefresh]);

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
      className={`pull-to-refresh-container relative overflow-visible ${className}`}
    >
      {/* Fixed-position Pull-to-refresh indicator at the top of viewport */}
      <motion.div 
        className="fixed left-0 right-0 top-0 flex items-center justify-center overflow-hidden z-50 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-md"
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
        className="will-change-transform"
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