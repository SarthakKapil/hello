// Offscreen document script for DOM/canvas operations
// Listens for messages from the background service worker and performs tasks that
// require access to the DOM (e.g., canvas-based image resizing).

// Minimal logger in case utils.js isn't loaded here
function log(msg, ...args) {
  try { console.log(`[Offscreen] ${msg}`, ...args); } catch (_) {}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'urlToBase64': {
      const { url } = message;
      urlToBase64(url)
        .then((base64) => sendResponse({ success: true, data: base64 }))
        .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));
      return true;
    }
    case 'resizeImage': {
      const { base64, maxWidth = 1024, maxHeight = 1024 } = message;
      resizeBase64JPEG(base64, maxWidth, maxHeight)
        .then((resizedBase64) => sendResponse({ success: true, data: resizedBase64 }))
        .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));
      return true; // keep the message channel open for async response
    }
    default:
      // ignore
  }
});

async function urlToBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const base64 = String(reader.result).split(',')[1];
          resolve(base64);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

async function resizeBase64JPEG(base64, maxWidth, maxHeight) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          let newWidth = width;
          let newHeight = height;

          if (newWidth > maxWidth) {
            newWidth = maxWidth;
            newHeight = Math.round((height * maxWidth) / width);
          }
          if (newHeight > maxHeight) {
            newHeight = maxHeight;
            newWidth = Math.round((newWidth * maxHeight) / newHeight);
          }

          const canvas = document.createElement('canvas');
          canvas.width = newWidth;
          canvas.height = newHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          const out = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
          resolve(out);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = (e) => reject(new Error('Failed to load image for resizing'));
      img.src = `data:image/jpeg;base64,${base64}`;
    } catch (err) {
      reject(err);
    }
  });
}
