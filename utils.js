// Configuration
const CONFIG = {
    SUPABASE_URL: 'https://xrwuylxyhfyexicnevka.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhyd3V5bHh5aGZ5ZXhpY25ldmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NjQyNDgsImV4cCI6MjA2NzE0MDI0OH0.YCoE4R2QdOnH8Hfws7MEHPdfYYwu5NXVd7r4Jizl0Fk',
    GEMINI_API_KEY: 'AIzaSyB1rjMoaWzgJwQON9a8-T11fzdRbULVzDw',
    //'AIzaSyCjrPNjb78ohaa0t3KqDAd2ls9LqXdtR4M',
    RATE_LIMIT: 40,
    DEBUG: true
  };
  
  // Logging utility
  function debugLog(message, ...args) {
    if (CONFIG.DEBUG) {
      console.log(`VTO: ${message}`, ...args);
    }
  }
  
  // Supabase client
  class SupabaseClient {
    constructor() {
      this.url = CONFIG.SUPABASE_URL;
      this.key = CONFIG.SUPABASE_ANON_KEY;
    }
  
    async query(table, operation = 'select', data = null, conditions = null) {
      try {
        debugLog(`Supabase ${operation} on ${table}`, { data, conditions });
        
        let url = `${this.url}/rest/v1/${table}`;
        let method = 'GET';
        let headers = {
          'apikey': this.key,
          'Authorization': `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        };
  
        if (operation === 'insert') {
          method = 'POST';
        } else if (operation === 'update') {
          method = 'PATCH';
        } else if (operation === 'delete') {
          method = 'DELETE';
        }
  
        if (conditions) {
          const params = new URLSearchParams();
          Object.entries(conditions).forEach(([key, value]) => {
            params.append(key, `eq.${value}`);
          });
          url += `?${params.toString()}`;
        }
  
        const response = await fetch(url, {
          method,
          headers,
          body: data ? JSON.stringify(data) : null
        });
  
        if (!response.ok) {
          throw new Error(`Supabase error: ${response.status} ${response.statusText}`);
        }
  
        return await response.json();
      } catch (error) {
        debugLog('Supabase error:', error);
        throw error;
      }
    }

    async rpc(functionName, params = {}) {
      try {
        const url = `${this.url}/rest/v1/rpc/${functionName}`;
        const headers = {
          'apikey': this.key,
          'Authorization': `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        };
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(params)
        });
        if (!response.ok) {
          throw new Error(`Supabase RPC error: ${response.status} ${response.statusText}`);
        }
        return await response.json();
      } catch (error) {
        debugLog('Supabase RPC error:', error);
        throw error;
      }
    }
  }
  
  // Image utilities
  class ImageUtils {
    static async urlToBase64(url) {
      try {
        debugLog('Converting image to base64:', url);
        const response = await fetch(url);
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        debugLog('Error converting image to base64:', error);
        throw error;
      }
    }
  
    static async resizeImage(base64, maxWidth = 1024, maxHeight = 1024) {
      return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
  
        img.onload = () => {
          const { width, height } = img;
          let { width: newWidth, height: newHeight } = img;
  
          if (width > maxWidth) {
            newWidth = maxWidth;
            newHeight = (height * maxWidth) / width;
          }
  
          if (newHeight > maxHeight) {
            newHeight = maxHeight;
            newWidth = (newWidth * maxHeight) / newHeight;
          }
  
          canvas.width = newWidth;
          canvas.height = newHeight;
          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          
          resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
        };
  
        img.src = `data:image/jpeg;base64,${base64}`;
      });
    }
  
    static isClothingImage(imageUrl, altText = '') {
      const clothingKeywords = [
        'shirt', 'dress', 'pants', 'jacket', 'sweater', 'hoodie', 'top', 
        'bottom', 'clothing', 'apparel', 'fashion', 'wear', 'outfit',
        't-shirt', 'jeans', 'skirt', 'blouse', 'coat', 'blazer'
      ];
      
      const text = (imageUrl + ' ' + altText).toLowerCase();
      return clothingKeywords.some(keyword => text.includes(keyword));
    }
  }
  
  // Rate limiting
  class RateLimit {
    static async checkLimit(userId) {
      try {
        const supabase = new SupabaseClient();
        const today = new Date().toISOString().split('T')[0];
        
        const usage = await supabase.query('api_usage', 'select', null, {
          user_id: userId,
          date: today
        });
  
        const currentCount = usage.length > 0 ? usage[0].count : 0;
        debugLog('Current API usage:', currentCount, 'of', CONFIG.RATE_LIMIT);
        
        return currentCount < CONFIG.RATE_LIMIT;
      } catch (error) {
        debugLog('Error checking rate limit:', error);
        return true; // Allow on error
      }
    }
  
    static async incrementUsage(userId) {
      try {
        const supabase = new SupabaseClient();
        const today = new Date().toISOString().split('T')[0];
        // 1) Try server-side atomic RPC if available
        try {
          const rpcRes = await supabase.rpc('increment_api_usage', {
            p_user_id: userId,
            p_date: today,
            p_limit: CONFIG.RATE_LIMIT
          });
          // Expected shape: [{ allowed: boolean, count: number }]
          const row = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes;
          if (row && typeof row.allowed !== 'undefined') {
            debugLog('API usage increment via RPC:', row);
            if (!row.allowed) throw new Error('Daily generation limit exceeded.');
            return;
          }
        } catch (rpcErr) {
          // If RPC/function not found (404) or any RPC error, fall back to REST flow
          debugLog('RPC not available or failed, falling back to REST increment:', rpcErr?.message || rpcErr);
        }
        
        // 2) REST fallback with conflict handling and small retries
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          // Try fast path: select then update if exists
          const usage = await supabase.query('api_usage', 'select', null, {
            user_id: userId,
            date: today
          });

          if (usage.length > 0) {
            await supabase.query('api_usage', 'update',
              { count: usage[0].count + 1 },
              { id: usage[0].id }
            );
            debugLog('API usage incremented via update');
            return;
          }

          try {
            // Not found: try to insert a new row
            await supabase.query('api_usage', 'insert', {
              user_id: userId,
              date: today,
              count: 1
            });
            debugLog('API usage incremented via insert');
            return;
          } catch (insertErr) {
            const msg = insertErr?.message || '';
            if (msg.includes('409') || msg.toLowerCase().includes('conflict')) {
              debugLog(`Insert conflict on attempt ${attempt}; retrying select+update`);
              // Backoff a bit then retry
              await new Promise(r => setTimeout(r, attempt * 50));
              continue;
            }
            throw insertErr;
          }
        }
        throw new Error('Failed to increment usage after retries');
        
      } catch (error) {
        debugLog('Error incrementing usage:', error);
      }
    }
  }
  
  // User profile management
  class UserProfile {
    static async get() {
      try {
        const result = await chrome.storage.local.get(['userProfile']);
        const profile = result.userProfile;
        debugLog('Profile loaded:', profile);
        return profile;
      } catch (error) {
        debugLog('Error getting profile:', error);
        return null;
      }
    }
  
    static async save(profile) {
      try {
        await chrome.storage.local.set({ userProfile: profile });
        debugLog('Profile saved:', profile);
        return true;
      } catch (error) {
        debugLog('Error saving profile:', error);
        return false;
      }
    }
  
    static async saveToDatabase(profile) {
      try {
        const supabase = new SupabaseClient();
        
        if (profile.id) {
          await supabase.query('users', 'update', {
            name: profile.name,
            gender: profile.gender,
            profile_image_url: profile.profile_image_url,
            full_body_image_url: profile.full_body_image_url,
            updated_at: new Date().toISOString()
          }, { id: profile.id });
        } else {
          const result = await supabase.query('users', 'insert', {
            name: profile.name,
            gender: profile.gender,
            profile_image_url: profile.profile_image_url,
            full_body_image_url: profile.full_body_image_url
          });
          
          if (result.length > 0) {
            profile.id = result[0].id;
            await this.save(profile);
          }
        }
        
        debugLog('Profile saved to database');
        return true;
      } catch (error) {
        debugLog('Error saving profile to database:', error);
        return { success: false, error: error?.message || 'Failed to save profile to database' };
      }
    }
  }
  
  // Error handling
  class ErrorHandler {
    static show(message, type = 'error', duration = 5000) {
      debugLog(`${type.toUpperCase()}: ${message}`);
      
      // Remove existing notifications
      const existing = document.querySelector('.vto-notification');
      if (existing) existing.remove();
      
      const notification = document.createElement('div');
      notification.className = `vto-notification vto-notification--${type}`;
      notification.innerHTML = `
        <div class="vto-notification__content">
          <span class="vto-notification__message">${message}</span>
          <button class="vto-notification__close">&times;</button>
        </div>
      `;
      
      document.body.appendChild(notification);
      
      // Auto-remove
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, duration);
      
      // Manual close
      notification.querySelector('.vto-notification__close').addEventListener('click', () => {
        notification.remove();
      });
    }
  }
  
  // Export for use in other scripts
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, debugLog, SupabaseClient, ImageUtils, RateLimit, UserProfile, ErrorHandler };
  }
