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
 * Prevents native browser pull-to-refresh behavior on mobile devices,
 * but leaves alone the top 100px of the page to allow our custom pull-to-refresh
 */
export function preventPullToRefresh() {
  let startY = 0;
  
  // Track touch start position
  document.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
  }, { passive: true });
  
  // Prevent default on touchmove with more precise conditions
  document.addEventListener('touchmove', (e) => {
    // Only prevent pull-to-refresh when:
    // 1. We're at the top of the page (scrollY very small)
    // 2. We're pulling down (moving finger downward)
    // 3. Not inside an interactive element like input, scrollable div
    const touchY = e.touches[0].clientY;
    const touchYDelta = touchY - startY;
    const target = e.target as HTMLElement;
    const isFormElement = target.tagName === 'INPUT' || 
                          target.tagName === 'TEXTAREA' || 
                          target.tagName === 'SELECT';
    
    // Check if element or any parent is scrollable and not at top
    const isScrollableElement = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      if (el === document.body || el === document.documentElement) return false;
      
      const style = window.getComputedStyle(el);
      const overflowY = style.getPropertyValue('overflow-y');
      const isScrollable = overflowY === 'scroll' || overflowY === 'auto';
      
      return (isScrollable && el.scrollTop > 0) || isScrollableElement(el.parentElement);
    };
    
    // Allow pull-to-refresh in our custom header zone (first 100px)
    const isInCustomPullZone = touchY < 100;
    
    if (window.scrollY <= 5 && 
        touchYDelta > 0 && 
        !isFormElement && 
        !isScrollableElement(target) && 
        !isInCustomPullZone) {
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