/**
 * PWA Enhancements for professional app behavior
 */

/**
 * Prevents pinch zoom gestures on the app
 */
export function preventPinchZoom() {
  document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
    // @ts-ignore - This is a non-standard property
    document.documentElement.style.zoom = 1;
  }, { passive: false });

  document.addEventListener('gesturechange', (e) => {
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('gestureend', (e) => {
    e.preventDefault();
  }, { passive: false });
}

/**
 * Prevents pull-to-refresh behavior on mobile devices
 * except for elements with the class 'pull-to-refresh-container'
 */
export function preventPullToRefresh() {
  let startY: number;
  
  document.addEventListener('touchstart', (e) => {
    startY = e.touches[0].pageY;
  }, { passive: true });
  
  document.addEventListener('touchmove', (e) => {
    // Skip prevention if the event originated from our pull-to-refresh component
    if (e.target instanceof Element) {
      const pullToRefreshContainer = e.target.closest('.pull-to-refresh-container');
      if (pullToRefreshContainer) {
        return; // Allow the pull-to-refresh container to handle the event
      }
    }
    
    const y = e.touches[0].pageY;
    // Prevent overscroll when already at the top
    if (document.scrollingElement!.scrollTop === 0 && y > startY) {
      e.preventDefault();
    }
  }, { passive: false });
}

/**
 * Handles iOS specific quirks for better PWA experience
 */
export function applyIOSPWAFixes() {
  // iOS doesn't maintain scroll position on refresh
  if (navigator.userAgent.match(/iPhone|iPad|iPod/)) {
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        // Fix iOS scroll position on back navigation
        window.scrollTo(0, parseInt(sessionStorage.getItem('scrollPosition') || '0'));
      }
    });
    
    window.addEventListener('pagehide', () => {
      // Store scroll position when leaving page
      sessionStorage.setItem('scrollPosition', window.scrollY.toString());
    });
    
    // Fix for 300ms tap delay on iOS
    document.documentElement.style.setProperty('touch-action', 'manipulation');
  }
}

/**
 * Adds professional keyboard handling for form fields
 */
export function enhanceKeyboardBehavior() {
  // Auto-dismiss keyboard on submit
  document.addEventListener('submit', () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  
  // Handle input field keyboard behavior
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && 
        document.activeElement instanceof HTMLInputElement && 
        document.activeElement.type !== 'textarea') {
      e.preventDefault();
      document.activeElement.blur();
    }
  });
}

/**
 * Initialize all PWA enhancements
 */
export function initPWAEnhancements() {
  preventPinchZoom();
  preventPullToRefresh();
  applyIOSPWAFixes();
  enhanceKeyboardBehavior();
  
  // Apply professional PWA behavior classes
  document.body.classList.add('prevent-double-tap-zoom');
  
  console.log('PWA enhancements initialized for professional experience');
  
  return true;
} 