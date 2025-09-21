// Sidebar script for Virtual Try-On Extension
console.log('VTO: Sidebar script loaded');

class SidebarManager {
  constructor() {
    this.currentResult = null;
    this.init();
  }

  init() {
    console.log('VTO: Initializing sidebar');
    
    this.bindEvents();
    this.updateUsageDisplay();
  }

  bindEvents() {
    // Close button
    document.getElementById('closeBtn').addEventListener('click', () => {
      this.closeSidebar();
    });

    // Result actions
    document.getElementById('saveBtn').addEventListener('click', () => this.saveResult());
    document.getElementById('shareBtn').addEventListener('click', () => this.shareResult());
    document.getElementById('downloadBtn').addEventListener('click', () => this.downloadResult());

    // Error actions
    document.getElementById('retryBtn').addEventListener('click', () => this.retryGeneration());
    document.getElementById('reportBtn').addEventListener('click', () => this.reportIssue());

    // Listen for messages from parent window
    window.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });
  }

  handleMessage(data) {
    console.log('VTO: Sidebar received message:', data);

    switch (data.type) {
      case 'SHOW_LOADING':
        this.showLoading();
        break;
      
      case 'SHOW_RESULT':
        this.showResult(data.data);
        break;
      
      case 'SHOW_ERROR':
        this.showError(data.error);
        break;
      
      default:
        console.log('VTO: Unknown message type:', data.type);
    }
  }

  showLoading() {
    console.log('VTO: Showing loading state');
    
    document.getElementById('loadingState').style.display = 'block';
    document.getElementById('resultState').style.display = 'none';
    document.getElementById('errorState').style.display = 'none';
    
    // Update progress text
    const progressTexts = [
      'Analyzing clothing item...',
      'Processing your photo...',
      'Generating virtual try-on...',
      'Adding final touches...'
    ];
    
    let currentIndex = 0;
    const progressText = document.querySelector('.progress-text');
    
    const interval = setInterval(() => {
      progressText.textContent = progressTexts[currentIndex];
      currentIndex = (currentIndex + 1) % progressTexts.length;
    }, 2000);
    
    // Store interval to clear it later
    this.progressInterval = interval;
  }

  showResult(resultData) {
    console.log('VTO: Showing result:', resultData);
    
    // Clear progress interval
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    
    this.currentResult = resultData;
    
    // Hide other states
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'none';
    
    // Show result state
    const resultState = document.getElementById('resultState');
    resultState.style.display = 'block';
    
    // Populate images
    const originalImage = document.getElementById('originalImage');
    const generatedImage = document.getElementById('generatedImage');
    
    originalImage.src = resultData.originalImage;
    generatedImage.src = resultData.generatedImage;
    
    // Update timestamp
    const timestamp = document.getElementById('timestamp');
    timestamp.textContent = this.formatTimestamp(resultData.timestamp);
    
    // Update usage display
    this.updateUsageDisplay();
    
    console.log('VTO: Result displayed successfully');
  }

  showError(error) {
    console.log('VTO: Showing error:', error);
    
    // Clear progress interval
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    
    // Hide other states
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('resultState').style.display = 'none';
    
    // Show error state
    document.getElementById('errorState').style.display = 'block';
    
    // Update error message
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = error || 'An unexpected error occurred. Please try again.';
  }

  async saveResult() {
    if (!this.currentResult) return;
    
    console.log('VTO: Saving result');
    
    try {
      // In a production app, you would save to a user's gallery or cloud storage
      // For now, we'll just show a success message
      this.showNotification('Result saved to your gallery!', 'success');
      
    } catch (error) {
      console.error('VTO: Save failed:', error);
      this.showNotification('Failed to save result', 'error');
    }
  }

  async shareResult() {
    if (!this.currentResult) return;
    
    console.log('VTO: Sharing result');
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'My Virtual Try-On',
          text: 'Check out my virtual try-on result!',
          url: this.currentResult.generatedImage
        });
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(this.currentResult.generatedImage);
        this.showNotification('Image URL copied to clipboard!', 'success');
      }
      
    } catch (error) {
      console.error('VTO: Share failed:', error);
      this.showNotification('Failed to share result', 'error');
    }
  }

  downloadResult() {
    if (!this.currentResult) return;
    
    console.log('VTO: Downloading result');
    
    try {
      const link = document.createElement('a');
      link.href = this.currentResult.generatedImage;
      link.download = `virtual-tryon-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      this.showNotification('Download started!', 'success');
      
    } catch (error) {
      console.error('VTO: Download failed:', error);
      this.showNotification('Failed to download result', 'error');
    }
  }

  retryGeneration() {
    console.log('VTO: Retrying generation');
    
    // Show loading state
    this.showLoading();
    
    // Send retry message to parent
    window.parent.postMessage({
      type: 'RETRY_GENERATION'
    }, '*');
  }

  reportIssue() {
    console.log('VTO: Reporting issue');
    
    // Open feedback form
    const feedbackUrl = 'https://github.com/your-repo/virtual-tryon-feedback/issues/new';
    window.open(feedbackUrl, '_blank');
  }

  closeSidebar() {
    console.log('VTO: Closing sidebar');
    
    // Clear any intervals
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    
    // Send close message to parent window
    window.parent.postMessage({
      type: 'CLOSE_SIDEBAR'
    }, '*');
  }

  async updateUsageDisplay() {
    try {
      // Get current usage from storage or API
      const result = await chrome.storage.local.get(['userProfile']);
      const profile = result.userProfile;
      
      if (profile && profile.id) {
        // This would normally fetch from the API
        const usedCount = 0; // Placeholder
        const totalLimit = 4;
        
        document.getElementById('usageCount').textContent = usedCount;
        
        const usageBar = document.getElementById('usageBar');
        const percentage = (usedCount / totalLimit) * 100;
        usageBar.style.width = `${percentage}%`;
        
        // Change color based on usage
        if (percentage > 75) {
          usageBar.style.background = 'linear-gradient(90deg, #EF4444, #DC2626)';
        } else if (percentage > 50) {
          usageBar.style.background = 'linear-gradient(90deg, #F59E0B, #D97706)';
        } else {
          usageBar.style.background = 'linear-gradient(90deg, #10B981, #059669)';
        }
      }
      
    } catch (error) {
      console.error('VTO: Failed to update usage display:', error);
    }
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return 'Just now';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  showNotification(message, type = 'success') {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification notification--${type}`;
    notification.innerHTML = `
      <span>${message}</span>
      <button class="notification__close">&times;</button>
    `;
    
    // Style the notification
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      left: 20px;
      background: ${type === 'error' ? '#FEF2F2' : '#F0FDF4'};
      border: 1px solid ${type === 'error' ? '#FECACA' : '#BBF7D0'};
      color: ${type === 'error' ? '#DC2626' : '#16A34A'};
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      animation: slideDown 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 3000);
    
    // Manual close
    notification.querySelector('.notification__close').addEventListener('click', () => {
      notification.remove();
    });
  }
}

// Initialize sidebar manager
new SidebarManager();