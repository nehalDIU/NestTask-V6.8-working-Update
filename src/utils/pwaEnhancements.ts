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
  document.addEventListener('touchmove', (e) => {
    // Only prevent default if:
    // 1. We're at the top of the page (scrollY === 0)
    // 2. Touch is below the safe zone (top 100px reserved for our custom component)
    // 3. We're pulling down (moving finger downward)
    if (window.scrollY === 0 && 
        e.touches[0].clientY > 100 && 
        e.touches.length === 1) {
      
      // This is likely the browser's overscroll effect, not our custom pull
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