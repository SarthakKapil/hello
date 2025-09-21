// Content script for Virtual Try-On Extension
debugLog('Content script loaded');

class VirtualTryOnDetector {
  constructor() {
    this.overlays = new Map();
    this.observer = null;
    this.sidebar = null;
    this.processingImages = new Set();
    this.maxOverlays = 20;
    this.currentOverlayCount = 0;
    
    this.init();
  }

  init() {
    debugLog('Initializing VTO detector');
    
    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.start());
    } else {
      this.start();
    }
  }

  start() {
    debugLog('Starting image detection');
    this.detectImages();
    this.setupObserver();
  }

  // Smart product image detection
  detectImages() {
    const selectors = [
      // Amazon selectors
      '.s-image',
      '.a-image-wrapper img',
      '[data-component-type="s-product-image"] img',
      '.a-dynamic-image',
      
      // Myntra selectors
      '.product-image img',
      '.image-grid-image img',
      '.product-imageSlots img',
      
      // Universal e-commerce selectors
      'img[alt*="product" i]',
      'img[alt*="dress" i]',
      'img[alt*="shirt" i]',
      'img[alt*="clothing" i]',
      'img[alt*="apparel" i]',
      '.product-card img',
      '.item-image img',
      '.product-photo img',
      '.product-main-image img',
      '[class*="product"] img',
      '[class*="item"] img'
    ];

    const images = document.querySelectorAll(selectors.join(', '));
    debugLog(`Found ${images.length} potential product images`);

    images.forEach(img => this.processImage(img));
  }

  processImage(img) {
    // Skip if already processed or limit reached
    if (this.overlays.has(img) || this.currentOverlayCount >= this.maxOverlays) {
      return;
    }

    // Check if image is large enough and visible
    if (!this.isValidImage(img)) {
      return;
    }

    // Check if it looks like clothing comment:mvp
    //if (!this.isClothingImage(img)) {
      //return;
    //}

    this.addOverlay(img);
  }

  isValidImage(img) {
    const rect = img.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(img);
    
    return (
      rect.width >= 200 &&
      rect.height >= 200 &&
      computedStyle.display !== 'none' &&
      computedStyle.visibility !== 'hidden' &&
      img.complete &&
      img.naturalWidth > 0
    );
  }
//comment:mvp
  //isClothingImage(img) {
    //const src = img.src || '';
    //const alt = img.alt || '';
    //const className = img.className || '';
    
    //const clothingKeywords = [
      //'shirt', 'dress', 'pants', 'jacket', 'sweater', 'hoodie', 'top',
      //'bottom', 'clothing', 'apparel', 'fashion', 'wear', 'outfit',
      //'t-shirt', 'jeans', 'skirt','pant','kurta', 'blouse', 'coat', 'blazer', 'suit',
      //'shoes', 'footwear', 'sneakers', 'boots', 'sandals'
    //];

    //const text = (src + ' ' + alt + ' ' + className).toLowerCase();
    
    // Check for clothing keywords
    //if (clothingKeywords.some(keyword => text.includes(keyword))) {
      //return true;
    //}

    // Check if we're on a known fashion website
    //const hostname = window.location.hostname.toLowerCase();
    //const fashionSites = ['myntra', 'ajio', 'amazon', 'flipkart', 'nykaa', 'zara', 'h&m'];
    
    //if (fashionSites.some(site => hostname.includes(site))) {
      // On fashion sites, be more liberal with detection
      //return !text.includes('logo') && !text.includes('banner');
    //}

   // return false;
  //}

  addOverlay(img) {
    debugLog('Adding overlay to image:', img.src);
    
    // Make container relative positioned
    const container = img.closest('[class*="product"], [class*="item"]') || img.parentElement;
    if (container) {
      container.classList.add('vto-image-container');
    }

    // Create overlay button
    const overlay = document.createElement('button');
    overlay.className = 'vto-overlay';
    overlay.innerHTML = '👕 Try On';
    overlay.setAttribute('data-vto-image', img.src);
    
    // Position overlay
    this.positionOverlay(overlay, img);
    
    // Add event listeners
    overlay.addEventListener('click', (e) => this.handleTryOnClick(e, img));
    
    // Insert overlay
    document.body.appendChild(overlay);
    
    // Store reference
    this.overlays.set(img, overlay);
    this.currentOverlayCount++;
    
    // Update overlay position on scroll/resize
    this.setupOverlayPositioning(overlay, img);
  }

  positionOverlay(overlay, img) {
    const rect = img.getBoundingClientRect();
    overlay.style.position = 'fixed';
    overlay.style.top = (rect.top + 8) + 'px';
    overlay.style.right = (window.innerWidth - rect.right + 8) + 'px';
    overlay.style.left = 'auto';
  }

  setupOverlayPositioning(overlay, img) {
    const updatePosition = () => {
      if (!document.body.contains(img)) {
        overlay.remove();
        this.overlays.delete(img);
        this.currentOverlayCount--;
        return;
      }
      this.positionOverlay(overlay, img);
    };

    // Throttled position update
    let updateTimer;
    const throttledUpdate = () => {
      if (updateTimer) return;
      updateTimer = setTimeout(() => {
        updatePosition();
        updateTimer = null;
      }, 100);
    };

    window.addEventListener('scroll', throttledUpdate);
    window.addEventListener('resize', throttledUpdate);
  }

  async handleTryOnClick(event, img) {
    event.preventDefault();
    event.stopPropagation();
    
    debugLog('Try-on clicked for image:', img.src);
    
    // Check if already processing
    if (this.processingImages.has(img.src)) {
      return;
    }

    // Get user profile
    const profile = await UserProfile.get();
    if (!profile || !profile.full_body_image_url) {
      ErrorHandler.show('Please set up your profile first by clicking the extension icon.');
      return;
    }

    // Validate image comment:mvp
    //if (!ImageUtils.isClothingImage(img.src, img.alt)) {
      //ErrorHandler.show('This doesn\'t appear to be a clothing item.');
      //return;
    //}

    // Check rate limit
    if (!await RateLimit.checkLimit(profile.id)) {
      ErrorHandler.show('Daily generation limit exceeded. Please try again tomorrow.');
      return;
    }

    // Start processing
    this.processingImages.add(img.src);
    const overlay = this.overlays.get(img);
    this.setOverlayProcessing(overlay, true);

    try {
      // Show sidebar with loading state
      this.showSidebar(true);
      
      // Generate try-on
      const response = await chrome.runtime.sendMessage({
        action: 'generateTryOn',
        data: {
          clothingImageUrl: img.src,
          userProfile: profile,
          websiteUrl: window.location.href
        }
      });

      if (response.success) {
        debugLog('Try-on generation successful');
        this.showResult(response.data);
        ErrorHandler.show('Virtual try-on generated successfully!', 'success');
      } else {
        throw new Error(response.error || 'Generation failed');
      }

    } catch (error) {
      debugLog('Try-on generation failed:', error);
      ErrorHandler.show(`Generation failed: ${error.message}`);
      this.hideSidebar();
    } finally {
      this.processingImages.delete(img.src);
      this.setOverlayProcessing(overlay, false);
    }
  }

  setOverlayProcessing(overlay, processing) {
    if (!overlay) return;
    
    if (processing) {
      overlay.classList.add('vto-overlay--processing');
      overlay.innerHTML = '<div class="vto-spinner"></div> Processing...';
    } else {
      overlay.classList.remove('vto-overlay--processing');
      overlay.innerHTML = '👕 Try On';
    }
  }

  showSidebar(loading = false) {
    if (this.sidebar) {
      this.hideSidebar();
    }

    debugLog('Showing sidebar');
    
    // Create sidebar iframe
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sidebar.html');
    iframe.className = 'vto-sidebar';
    iframe.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 400px;
      height: 100vh;
      border: none;
      z-index: 10002;
      background: white;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `;
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'vto-sidebar-overlay';
    overlay.addEventListener('click', () => this.hideSidebar());
    
    document.body.appendChild(overlay);
    document.body.appendChild(iframe);
    
    // Show with animation
    requestAnimationFrame(() => {
      overlay.classList.add('vto-sidebar-overlay--visible');
      iframe.style.transform = 'translateX(0)';
    });
    
    this.sidebar = { iframe, overlay };
    
    // Handle loading state
    if (loading) {
      iframe.onload = () => {
        iframe.contentWindow.postMessage({ type: 'SHOW_LOADING' }, '*');
      };
    }
  }

  showResult(data) {
    if (this.sidebar && this.sidebar.iframe.contentWindow) {
      this.sidebar.iframe.contentWindow.postMessage({
        type: 'SHOW_RESULT',
        data: data
      }, '*');
    }
  }

  hideSidebar() {
    if (!this.sidebar) return;
    
    debugLog('Hiding sidebar');
    
    const { iframe, overlay } = this.sidebar;
    
    iframe.style.transform = 'translateX(100%)';
    overlay.classList.remove('vto-sidebar-overlay--visible');
    
    setTimeout(() => {
      iframe.remove();
      overlay.remove();
    }, 300);
    
    this.sidebar = null;
  }

  setupObserver() {
    // Observe DOM changes for new images
    this.observer = new MutationObserver((mutations) => {
      let hasNewImages = false;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the node itself is an image
            if (node.tagName === 'IMG') {
              this.processImage(node);
              hasNewImages = true;
            }
            
            // Check for images within the node
            const images = node.querySelectorAll && node.querySelectorAll('img');
            if (images && images.length > 0) {
              images.forEach(img => this.processImage(img));
              hasNewImages = true;
            }
          }
        });
      });
      
      if (hasNewImages) {
        debugLog('Processed new images from DOM mutations');
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Cleanup on page unload
  destroy() {
    debugLog('Cleaning up VTO detector');
    
    if (this.observer) {
      this.observer.disconnect();
    }
    
    this.overlays.forEach((overlay) => {
      overlay.remove();
    });
    
    this.overlays.clear();
    
    if (this.sidebar) {
      this.hideSidebar();
    }
  }
}

// Initialize when DOM is ready
let vtoDetector;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    vtoDetector = new VirtualTryOnDetector();
  });
} else {
  vtoDetector = new VirtualTryOnDetector();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (vtoDetector) {
    vtoDetector.destroy();
  }
});

// Listen for messages from sidebar
window.addEventListener('message', (event) => {
  if (event.data.type === 'CLOSE_SIDEBAR' && vtoDetector) {
    vtoDetector.hideSidebar();
  }
});