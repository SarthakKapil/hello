// Background service worker for Chrome Extension
// Import utilities
try {
  // Prefer relative import; falls back to absolute URL if needed
  importScripts('utils.js');
} catch (e1) {
  try {
    importScripts(chrome.runtime.getURL('utils.js'));
  } catch (e2) {
    // If import fails, log the error. We'll provide a fallback debugLog below.
    console.error('VTO: Failed to import utils.js in service worker', e1, e2);
  }
}

// Provide a safe fallback for debugLog in case utils.js failed to load
if (typeof debugLog === 'undefined') {
  function debugLog(message, ...args) {
    console.log(`VTO: ${message}`, ...args);
  }
}

debugLog('Background service worker starting');

// Ensure an offscreen document exists for DOM/canvas operations
async function ensureOffscreenDocument() {
  try {
    // If a document already exists, creating again will throw; we can ignore that
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Resize images via canvas in an offscreen document.'
    });
  } catch (e) {
    // Ignore errors that indicate the offscreen document already exists
    debugLog('Offscreen createDocument result:', e?.message || String(e));
  }
}

// Perform image resize in the offscreen document
async function resizeInOffscreen(base64, maxW = 1024, maxH = 1024) {
  await ensureOffscreenDocument();
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'resizeImage', base64, maxWidth: maxW, maxHeight: maxH },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response) return reject(new Error('No response from offscreen document'));
        if (response.success) return resolve(response.data);
        reject(new Error(response.error || 'Offscreen resize failed'));
      }
    );
  });
}

// Convert image URL to base64 in the offscreen document
async function urlToBase64InOffscreen(url) {
  await ensureOffscreenDocument();
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'urlToBase64', url },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response) return reject(new Error('No response from offscreen document'));
        if (response.success) return resolve(response.data);
        reject(new Error(response.error || 'Offscreen urlToBase64 failed'));
      }
    );
  });
}

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  debugLog('Extension installed:', details);
  
  if (details.reason === 'install') {
    // Open welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html')
    });
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('Background received message:', request);
  
  switch (request.action) {
    case 'generateTryOn':
      handleTryOnGeneration(request.data)
        .then(sendResponse)
        .catch(error => {
          debugLog('Try-on generation error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep message channel open
      
    case 'saveProfile':
      handleProfileSave(request.data)
        .then(sendResponse)
        .catch(error => {
          debugLog('Profile save error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
      
    case 'uploadImage':
      handleImageUpload(request.data)
        .then(sendResponse)
        .catch(error => {
          debugLog('Image upload error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// Generate virtual try-on using Google Gemini API
async function handleTryOnGeneration(data) {
  const { clothingImageUrl, userProfile, websiteUrl } = data;
  
  debugLog('Starting try-on generation');
  let recordId; // ← Declare outside try block [2]

  try {
    // Check rate limit
    if (!await RateLimit.checkLimit(userProfile.id)) {
      throw new Error('Daily generation limit exceeded. Please try again tomorrow.');
    }
    
    // Convert images to base64
    const clothingBase64 = await urlToBase64InOffscreen(clothingImageUrl);
    const userImageBase64 = await urlToBase64InOffscreen(userProfile.full_body_image_url);
    
    // Resize images if needed
    const resizedClothingImage = await resizeInOffscreen(clothingBase64);
    const resizedUserImage = await resizeInOffscreen(userImageBase64);
    
    // Create try-on record in database
    const supabase = new SupabaseClient();
    const tryOnRecord = await supabase.query('tryons', 'insert', {
      user_id: userProfile.id,
      original_image_url: clothingImageUrl,
      website_url: websiteUrl,
      status: 'processing'
    });
    
    const recordId = tryOnRecord[0].id;
    
    // Call Gemini API
    const generatedImage = await callGeminiAPI(resizedClothingImage, resizedUserImage);
    
    // Save result to database
    await supabase.query('tryons', 'update', {
      generated_image_url: generatedImage,
      status: 'completed'
    }, { id: recordId });
    
    // Increment usage
    await RateLimit.incrementUsage(userProfile.id);
    
    debugLog('Try-on generation completed successfully');
    
    return {
      success: true,
      data: {
        id: recordId,
        originalImage: clothingImageUrl,
        generatedImage: generatedImage,
        timestamp: new Date().toISOString()
      }
    };
    
  } catch (error) {
    debugLog('Try-on generation failed:', error);
    
    // Update record with error if it exists
    if (recordId) {
      const supabase = new SupabaseClient(); // ← Also declare supabase here [2]
      await supabase.query('tryons', 'update', {
        status: 'failed',
        error_message: error.message
      }, { id: recordId });
    }
    
    throw error;
  }
}

// Call Google Gemini API for image generation
async function callGeminiAPI(clothingImage, userImage) {
  debugLog('Calling Gemini API');
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  
  const prompt = `Create a professional e-commerce fashion photo. Take the clothing from the first image and let the person from the second image wear it. Generate a realistic, full-body shot with proper lighting and natural pose. Ensure the clothing fits naturally on the person's body. Maintain the original style and color of the clothing while making it look professionally worn by the person.`;
  
  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: "image/jpeg",
            data: clothingImage
          }
        },
        {
          inline_data: {
            mime_type: "image/jpeg", 
            data: userImage
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.4,
      topK: 32,
      topP: 1,
      maxOutputTokens: 4096
    }
  };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      debugLog('Gemini API error response:', errorText);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    debugLog('Gemini API response received');
    
    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        // Handle text response that might contain image data
        const textContent = candidate.content.parts[0].text;
        
        // For now, return a placeholder - in production you'd handle image generation differently
        // This is a simplified version as Gemini API's image generation capabilities vary
        return `data:image/jpeg;base64,${clothingImage}`; // Placeholder
      }
    }
    
    throw new Error('No valid response from Gemini API');
    
  } catch (error) {
    debugLog('Gemini API call failed:', error);
    throw error;
  }
}

// Handle profile saving
async function handleProfileSave(profileData) {
  debugLog('Saving profile to database');
  
  try {
    const result = await UserProfile.saveToDatabase(profileData);
    if (result && typeof result === 'object' && result.success === false) {
      // utils.js returned a structured failure
      return { success: false, error: result.error || 'Failed to save profile' };
    }
    // Any truthy non-object or true means success
    return { success: !!result };
  } catch (error) {
    debugLog('Profile save failed:', error);
    return { success: false, error: error?.message || 'Unexpected error while saving profile' };
  }
}

// Handle image uploads
async function handleImageUpload(imageData) {
  debugLog('Handling image upload');
  
  try {
    // In a production environment, you would upload to a proper storage service
    // For now, we'll use base64 data URLs
    const base64Data = imageData.split(',')[1];
    const resizedImage = await resizeInOffscreen(base64Data, 512, 512);
    
    return {
      success: true,
      imageUrl: `data:image/jpeg;base64,${resizedImage}`
    };
  } catch (error) {
    debugLog('Image upload failed:', error);
    throw error;
  }
}