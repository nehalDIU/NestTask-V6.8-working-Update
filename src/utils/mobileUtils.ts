/**
 * Mobile-specific utilities to improve user experience and prevent common issues
 */

/**
 * Prevents mobile browsers from auto-refreshing the page when pulling down (overscroll)
 * This is particularly problematic in iOS Safari and Android WebView
 */
export function preventMobileAutoRefresh() {
  // Prevent pull-to-refresh on mobile browsers
  document.addEventListener('touchstart', function(e) {
    // Store the initial touch position
    const touchY = e.touches[0].clientY;
    
    // Save it in the dataset of the document element
    document.documentElement.dataset.touchStartY = touchY.toString();
  }, { passive: true });
  
  // Prevent the default behavior when pulling down at the top of the page
  document.addEventListener('touchmove', function(e) {
    // Only do this if we're at the top of the page
    if (window.scrollY <= 0) {
      const touchStartY = parseInt(document.documentElement.dataset.touchStartY || '0');
      const touchY = e.touches[0].clientY;
      
      // If pulling down (moving finger downward)
      if (touchY > touchStartY && touchY - touchStartY > 10) {
        e.preventDefault();
      }
    }
  }, { passive: false });
  
  // Apply CSS fixes
  const style = document.createElement('style');
  style.textContent = `
    :root {
      overscroll-behavior-y: none;
    }
    body {
      overscroll-behavior-y: none;
      -webkit-overflow-scrolling: touch;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Fixes iOS height issues when virtual keyboard appears
 */
export function fixIOSVirtualKeyboard() {
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    // Fix iOS viewport height issues when keyboard appears
    const metaViewport = document.querySelector('meta[name=viewport]');
    if (metaViewport) {
      metaViewport.setAttribute('content', 
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }
    
    // Listen for input focus and blur events
    document.addEventListener('focusin', () => {
      // Add a small delay to allow the keyboard to appear
      setTimeout(() => {
        // Scroll to the active element
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    });
    
    // On blur, scroll back to top if needed
    document.addEventListener('focusout', () => {
      // Small delay to let animations complete
      setTimeout(() => {
        // Only scroll if we're not still focused on an input
        if (!(document.activeElement instanceof HTMLInputElement) && 
            !(document.activeElement instanceof HTMLTextAreaElement)) {
          window.scrollTo(0, 0);
        }
      }, 100);
    });
  }
}

/**
 * Initialize all mobile-specific optimizations
 */
export function initMobileOptimizations() {
  // Apply all optimizations
  preventMobileAutoRefresh();
  fixIOSVirtualKeyboard();
  
  // Add a class to identify mobile optimization
  document.documentElement.classList.add('mobile-optimized');
  
  console.log('Mobile optimizations applied');
  return true;
} 