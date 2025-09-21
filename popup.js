// Popup script for Virtual Try-On Extension
debugLog('Popup script loaded');

class PopupManager {
  constructor() {
    this.profile = null;
    this.isEditing = false;
    this.init();
  }

  async init() {
    debugLog('Initializing popup');
    
    this.bindEvents();
    await this.loadProfile();
    this.updateUI();
  }

  bindEvents() {
    // Form submission
    document.getElementById('saveProfile').addEventListener('click', () => this.saveProfile());
    
    // Image uploads
    document.getElementById('profileImage').addEventListener('change', (e) => this.handleImageUpload(e, 'profile'));
    document.getElementById('fullBodyImage').addEventListener('change', (e) => this.handleImageUpload(e, 'fullBody'));
    
    // Profile actions
    document.getElementById('editProfile').addEventListener('click', () => this.toggleEdit());
    document.getElementById('viewHistory').addEventListener('click', () => this.viewHistory());
    
    // Footer links
    document.getElementById('helpLink').addEventListener('click', () => this.openHelp());
    document.getElementById('feedbackLink').addEventListener('click', () => this.openFeedback());
    
    // Form validation
    document.getElementById('name').addEventListener('input', () => this.validateForm());
    document.getElementById('gender').addEventListener('change', () => this.validateForm());
  }

  async loadProfile() {
    try {
      this.profile = await UserProfile.get();
      debugLog('Profile loaded:', this.profile);
      
      if (this.profile) {
        await this.loadUsageStats();
      }
    } catch (error) {
      debugLog('Error loading profile:', error);
      this.showError('Failed to load profile');
    }
  }

  async loadUsageStats() {
    try {
      if (!this.profile || !this.profile.id) return;
      
      const supabase = new SupabaseClient();
      const today = new Date().toISOString().split('T')[0];
      
      const usage = await supabase.query('api_usage', 'select', null, {
        user_id: this.profile.id,
        date: today
      });
      
      const usedCount = usage.length > 0 ? usage[0].count : 0;
      const remainingCount = Math.max(0, CONFIG.RATE_LIMIT - usedCount);
      
      document.getElementById('usageCount').textContent = usedCount;
      document.getElementById('remainingCount').textContent = remainingCount;
      
    } catch (error) {
      debugLog('Error loading usage stats:', error);
    }
  }

  updateUI() {
    const hasProfile = this.profile && this.profile.name;
    const profileForm = document.getElementById('profileForm');
    const profileDisplay = document.getElementById('profileDisplay');
    
    if (hasProfile && !this.isEditing) {
      // Show profile display
      profileForm.style.display = 'none';
      profileDisplay.style.display = 'block';
      this.populateProfileDisplay();
    } else {
      // Show profile form
      profileForm.style.display = 'block';
      profileDisplay.style.display = 'none';
      this.populateProfileForm();
    }
    
    this.updateStatus();
  }

  populateProfileDisplay() {
    if (!this.profile) return;
    
    document.getElementById('displayName').textContent = this.profile.name;
    document.getElementById('displayGender').textContent = this.profile.gender || 'Not specified';
    
    const avatar = document.getElementById('displayAvatar');
    if (this.profile.profile_image_url) {
      avatar.src = this.profile.profile_image_url;
    } else {
      avatar.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCA0MCA0MCI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNGM0Y0RjYiLz48cGF0aCBkPSJNMjAgMThjMi4yMDkgMCA0LTEuNzkxIDQtNHMtMS43OTEtNC00LTQtNCAxLjc5MS00IDQgMS43OTEgNCA0IDR6TTIwIDIwYy0yLjY3IDAtOCAxLjM0LTggNHYyaDEydi0yYzAtMi42Ni01LjMzLTQtNC00eiIgZmlsbD0iIzlDQTNBRiIvPjwvc3ZnPg==';
    }
  }

  populateProfileForm() {
    if (!this.profile) return;
    
    document.getElementById('name').value = this.profile.name || '';
    document.getElementById('gender').value = this.profile.gender || '';
    
    if (this.profile.profile_image_url) {
      this.showImagePreview('profileImagePreview', this.profile.profile_image_url);
    }
    
    if (this.profile.full_body_image_url) {
      this.showImagePreview('fullBodyImagePreview', this.profile.full_body_image_url);
    }
  }

  updateStatus() {
    const statusText = document.querySelector('.popup__status-text');
    const statusDot = document.querySelector('.popup__status-dot');
    
    if (this.profile && this.profile.full_body_image_url) {
      statusText.textContent = 'Ready';
      statusDot.style.background = '#10B981';
    } else {
      statusText.textContent = 'Setup Required';
      statusDot.style.background = '#F59E0B';
    }
  }

  async handleImageUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      this.showError('Please upload a JPEG or PNG image');
      return;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      this.showError('Image must be smaller than 5MB');
      return;
    }
    
    try {
      debugLog(`Uploading ${type} image:`, file.name);
      this.setLoading(true);
      
      // Convert to base64
      const base64 = await this.fileToBase64(file);
      
      // Upload image
      const response = await chrome.runtime.sendMessage({
        action: 'uploadImage',
        data: base64
      });
      
      if (response.success) {
        // Show preview
        const previewId = type === 'profile' ? 'profileImagePreview' : 'fullBodyImagePreview';
        this.showImagePreview(previewId, response.imageUrl);
        
        // Store temporarily
        if (!this.profile) this.profile = {};
        const key = type === 'profile' ? 'profile_image_url' : 'full_body_image_url';
        this.profile[key] = response.imageUrl;
        
        this.showSuccess('Image uploaded successfully!');
      } else {
        throw new Error(response.error);
      }
      
    } catch (error) {
      debugLog('Image upload failed:', error);
      this.showError(`Image upload failed: ${error.message}`);
    } finally {
      this.setLoading(false);
    }
  }

  showImagePreview(containerId, imageUrl) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<img class="image-upload__image" src="${imageUrl}" alt="Preview">`;
    container.classList.add('image-upload__preview--has-image');
  }

  async saveProfile() {
    if (!this.validateForm()) {
      return;
    }
    
    try {
      debugLog('Saving profile');
      this.setLoading(true);
      
      const formData = {
        id: this.profile?.id || null,
        name: document.getElementById('name').value.trim(),
        gender: document.getElementById('gender').value,
        profile_image_url: this.profile?.profile_image_url || null,
        full_body_image_url: this.profile?.full_body_image_url || null
      };
      
      // Validate required fields
      if (!formData.name) {
        throw new Error('Name is required');
      }
      
      if (!formData.gender) {
        throw new Error('Gender is required');
      }
      
      if (!formData.full_body_image_url) {
        throw new Error('Full body photo is required for virtual try-on');
      }
      
      // Save locally
      await UserProfile.save(formData);
      
      // Save to database
      const response = await chrome.runtime.sendMessage({
        action: 'saveProfile',
        data: formData
      });
      
      if (response.success) {
        this.profile = formData;
        this.isEditing = false;
        this.updateUI();
        this.showSuccess('Profile saved successfully!');
      } else {
        throw new Error(response.error);
      }
      
    } catch (error) {
      debugLog('Profile save failed:', error);
      this.showError(error.message);
    } finally {
      this.setLoading(false);
    }
  }

  validateForm() {
    const name = document.getElementById('name').value.trim();
    const gender = document.getElementById('gender').value;
    let isValid = true;
    
    // Clear previous errors
    document.querySelectorAll('.form-input--error, .form-select--error').forEach(el => {
      el.classList.remove('form-input--error', 'form-select--error');
    });
    document.querySelectorAll('.error-message').forEach(el => el.remove());
    
    // Validate name
    if (!name) {
      this.showFieldError('name', 'Name is required');
      isValid = false;
    } else if (name.length < 2) {
      this.showFieldError('name', 'Name must be at least 2 characters');
      isValid = false;
    }
    
    // Validate gender
    if (!gender) {
      this.showFieldError('gender', 'Gender is required');
      isValid = false;
    }
    
    return isValid;
  }

  showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    field.classList.add('form-input--error', 'form-select--error');
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    field.parentNode.appendChild(errorDiv);
  }

  toggleEdit() {
    this.isEditing = !this.isEditing;
    this.updateUI();
  }

  async viewHistory() {
    try {
      if (!this.profile || !this.profile.id) return;
      
      const supabase = new SupabaseClient();
      const history = await supabase.query('tryons', 'select', null, {
        user_id: this.profile.id
      });
      
      debugLog('Try-on history:', history);
      
      // For now, just show a simple alert
      // In production, you'd open a dedicated history page
      alert(`You have ${history.length} try-on(s) in your history.`);
      
    } catch (error) {
      debugLog('Error loading history:', error);
      this.showError('Failed to load history');
    }
  }

  openHelp() {
    chrome.tabs.create({
      url: 'https://github.com/your-repo/virtual-tryon-help'
    });
  }

  openFeedback() {
    chrome.tabs.create({
      url: 'https://github.com/your-repo/virtual-tryon-feedback'
    });
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  setLoading(loading) {
    const button = document.getElementById('saveProfile');
    const buttonText = button.querySelector('.btn__text');
    const buttonSpinner = button.querySelector('.btn__spinner');
    
    if (loading) {
      button.disabled = true;
      buttonText.style.display = 'none';
      buttonSpinner.style.display = 'block';
    } else {
      button.disabled = false;
      buttonText.style.display = 'block';
      buttonSpinner.style.display = 'none';
    }
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showNotification(message, type) {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification notification--${type}`;
    notification.innerHTML = `
      <span>${message}</span>
      <button class="notification__close">&times;</button>
    `;
    
    // Add styles
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#FEF2F2' : '#F0FDF4'};
      border: 1px solid ${type === 'error' ? '#FECACA' : '#BBF7D0'};
      color: ${type === 'error' ? '#DC2626' : '#16A34A'};
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
    
    // Manual close
    notification.querySelector('.notification__close').addEventListener('click', () => {
      notification.remove();
    });
  }
}

// Initialize popup
new PopupManager();