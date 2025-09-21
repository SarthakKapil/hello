// Add to your extension folder
const SUPABASE_CONFIG = {
  url: 'https://xrwuylxyhfyexicnevka.supabase.co',
  anonKey: 'YeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhyd3V5bHh5aGZ5ZXhpY25ldmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NjQyNDgsImV4cCI6MjA2NzE0MDI0OH0.YCoE4R2QdOnH8Hfws7MEHPdfYYwu5NXVd7r4Jizl0Fkk'
};

// Simple storage client for Chrome extensions
class SupabaseStorage {
  constructor(config) {
    this.baseUrl = `${config.url}/storage/v1`;
    this.apiKey = config.anonKey;
    this.bucket = 'profile-pictures'; // Create this bucket in Supabase
  }
  
  async uploadImage(file, fileName) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${this.baseUrl}/object/${this.bucket}/${fileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'apikey': this.apiKey
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Upload failed: ' + await response.text());
    }
    
    // Return public URL
    return `${this.baseUrl}/object/public/${this.bucket}/${fileName}`;
  }
  
  async deleteImage(fileName) {
    const response = await fetch(`${this.baseUrl}/object/${this.bucket}/${fileName}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'apikey': this.apiKey
      }
    });
    
    return response.ok;
  }
}
