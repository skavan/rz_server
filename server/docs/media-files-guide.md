# Media Files Guide

## Overview

The media management system allows uploading photos, documents, and other files to entities (products, SKUs, inventory items, locations, homes). Files are stored on disk at `G:\OneDrive\Jamaica\Jamaica\Media` and automatically sync to OneDrive.

## Storage Structure

```
G:\OneDrive\Jamaica\Jamaica\Media\
└── customers/
    └── {customerId}/
        ├── product/
        │   └── {productId}/
        │       ├── 1730476800-delta-faucet-chrome.jpg
        │       └── 1730476801-installation-guide.pdf
        ├── sku/
        │   └── {skuId}/
        ├── inventory_item/
        │   └── {inventoryItemId}/
        ├── location/
        │   └── {locationId}/
        └── home/
            └── {homeId}/
```

## Supported Entity Types

- `product`
- `sku`
- `inventory_item`
- `location`
- `home`

## File Restrictions

- **Max size**: 10MB
- **Allowed types**: 
  - Images: `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/webp`
  - Documents: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

---

## Client Flow: Uploading Media with Metadata

### Scenario
User has a form with:
- File input (photo/document)
- Title field
- Description field
- "Set as primary" checkbox

### Step-by-Step Flow

```
┌─────────────┐
│   Client    │
│   (Form)    │
└──────┬──────┘
       │ 1. User fills form:
       │    - Selects file (kitchen-faucet.jpg)
       │    - Enters title: "Chrome Delta Faucet"
       │    - Enters description: "Main product photo"
       │    - Checks "Set as primary"
       │
       │ 2. User clicks "Upload"
       │
       ▼
┌─────────────────────────────┐
│ Client prepares FormData    │
│ - Appends file              │
│ - Appends metadata fields   │
└──────┬──────────────────────┘
       │
       │ 3. POST request with FormData
       │    (multipart/form-data)
       │
       ▼
┌─────────────────────────────┐
│  Server validates auth      │
│  & entity access            │
└──────┬──────────────────────┘
       │
       │ 4. File saved to disk:
       │    G:\OneDrive\...\customers\1\product\42\1730476800-kitchen-faucet.jpg
       │
       ▼
┌─────────────────────────────┐
│  Record saved to DB:        │
│  media_assets table         │
└──────┬──────────────────────┘
       │
       │ 5. Response with media record
       │
       ▼
┌─────────────┐
│   Client    │
│  (Success)  │
└─────────────┘
```

---

## Client Implementation Examples

### 1. Basic Upload (Vanilla JavaScript)

```javascript
const fileInput = document.querySelector('#file');
const titleInput = document.querySelector('#title');
const descriptionInput = document.querySelector('#description');
const isPrimaryCheckbox = document.querySelector('#isPrimary');

async function uploadMedia(entityType, entityId) {
  const formData = new FormData();
  
  // 1. Append the file
  formData.append('file', fileInput.files[0]);
  
  // 2. Append metadata
  formData.append('title', titleInput.value);
  formData.append('description', descriptionInput.value);
  formData.append('isPrimary', isPrimaryCheckbox.checked);
  formData.append('sortOrder', '0');
  
  // 3. Get JWT token (from localStorage, cookie, etc.)
  const token = localStorage.getItem('authToken');
  
  // 4. Send request
  const response = await fetch(`http://localhost:5000/api/media/${entityType}/${entityId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
      // DON'T set Content-Type - browser sets it automatically with boundary
    },
    body: formData
  });
  
  // 5. Handle response
  const result = await response.json();
  
  if (response.ok) {
    console.log('Upload success:', result.data);
    // result.data contains the media_assets record
  } else {
    console.error('Upload failed:', result.error);
  }
}

// Usage
uploadMedia('product', 42);
```

### 2. React/Next.js Example

```tsx
import { useState } from 'react';

export function MediaUploadForm({ entityType, entityId, token }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!file) {
      alert('Please select a file');
      return;
    }

    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title || file.name);
    formData.append('description', description);
    formData.append('isPrimary', String(isPrimary));

    try {
      const response = await fetch(
        `http://localhost:5000/api/media/${entityType}/${entityId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        }
      );

      const result = await response.json();

      if (response.ok) {
        alert('Upload successful!');
        // Refresh media list, reset form, etc.
        setFile(null);
        setTitle('');
        setDescription('');
        setIsPrimary(false);
      } else {
        alert(`Upload failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Network error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>File</label>
        <input
          type="file"
          accept="image/*,application/pdf,.doc,.docx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
      </div>

      <div>
        <label>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter title (optional)"
        />
      </div>

      <div>
        <label>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter description (optional)"
        />
      </div>

      <div>
        <label>
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
          />
          Set as primary image
        </label>
      </div>

      <button type="submit" disabled={uploading || !file}>
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
    </form>
  );
}
```

### 3. cURL Example (Testing)

```bash
# Get token first
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  | jq -r '.token')

# Upload with metadata
curl -X POST http://localhost:5000/api/media/product/42 \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/faucet.jpg" \
  -F "title=Chrome Delta Faucet" \
  -F "description=Main product photo showing chrome finish" \
  -F "isPrimary=true" \
  -F "sortOrder=0"
```

---

## API Endpoints

### Upload Media
```http
POST /api/media/:entityType/:entityId
Authorization: Bearer {token}
Content-Type: multipart/form-data

FormData:
  file: <binary>             (required)
  title: string              (optional, defaults to filename)
  description: string        (optional)
  isPrimary: boolean         (optional, default false)
  sortOrder: number          (optional, default 0)

Response 201:
{
  "data": {
    "id": 1,
    "customerId": 1,
    "entityType": "product",
    "entityId": 42,
    "url": "customers/1/product/42/1730476800-faucet.jpg",
    "title": "Chrome Delta Faucet",
    "description": "Main product photo",
    "fileName": "1730476800-faucet.jpg",
    "fileSize": 245680,
    "mimeType": "image/jpeg",
    "assetType": "image",
    "isPrimary": true,
    "sortOrder": 0,
    "isActive": true,
    "createdAt": "2024-11-01T12:00:00Z",
    "updatedAt": "2024-11-01T12:00:00Z"
  }
}
```

### List Media for Entity
```http
GET /api/media/:entityType/:entityId
Authorization: Bearer {token}

Response 200:
{
  "data": [
    {
      "id": 1,
      "entityType": "product",
      "entityId": 42,
      "url": "customers/1/product/42/1730476800-faucet.jpg",
      "title": "Chrome Delta Faucet",
      "isPrimary": true,
      ...
    },
    {
      "id": 2,
      "entityType": "product",
      "entityId": 42,
      "url": "customers/1/product/42/1730476801-manual.pdf",
      "title": "Installation Manual",
      "isPrimary": false,
      ...
    }
  ],
  "meta": { "count": 2 }
}
```

### Serve File (Download/Display)
```http
GET /api/media/serve/:id
Authorization: Bearer {token}

Response 200:
Content-Type: image/jpeg (or file's actual mime type)
<binary file data>
```

### Update Metadata
```http
PUT /api/media/:id
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  "title": "Updated Title",
  "description": "Updated description",
  "sortOrder": 5
}

Response 200:
{
  "data": { /* updated media record */ }
}
```

### Set Primary Image
```http
PATCH /api/media/:id/primary
Authorization: Bearer {token}

Response 200:
{
  "data": { /* updated media record with isPrimary: true */ }
}
```
**Note**: Automatically sets all other media for the same entity to `isPrimary: false`

### Delete Media
```http
DELETE /api/media/:id
Authorization: Bearer {token}

Response 200:
{ "success": true }
```
**Side effects**:
- Deletes file from disk
- If last media for entity, sets `hasMediaAssets: false` on parent entity

---

## Complete Client Flow Example

### Full Upload Workflow

```javascript
class MediaManager {
  constructor(baseUrl, getToken) {
    this.baseUrl = baseUrl;
    this.getToken = getToken;
  }

  // 1. Upload new media
  async upload(entityType, entityId, file, metadata = {}) {
    const formData = new FormData();
    formData.append('file', file);
    
    // Add optional metadata
    if (metadata.title) formData.append('title', metadata.title);
    if (metadata.description) formData.append('description', metadata.description);
    if (metadata.isPrimary !== undefined) formData.append('isPrimary', metadata.isPrimary);
    if (metadata.sortOrder !== undefined) formData.append('sortOrder', metadata.sortOrder);

    const response = await fetch(
      `${this.baseUrl}/api/media/${entityType}/${entityId}`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.getToken()}` },
        body: formData
      }
    );

    return response.json();
  }

  // 2. List all media for entity
  async list(entityType, entityId) {
    const response = await fetch(
      `${this.baseUrl}/api/media/${entityType}/${entityId}`,
      {
        headers: { 'Authorization': `Bearer ${this.getToken()}` }
      }
    );

    return response.json();
  }

  // 3. Get file URL for display
  getFileUrl(mediaId) {
    return `${this.baseUrl}/api/media/serve/${mediaId}`;
  }

  // 4. Update metadata
  async updateMetadata(mediaId, updates) {
    const response = await fetch(
      `${this.baseUrl}/api/media/${mediaId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      }
    );

    return response.json();
  }

  // 5. Set as primary
  async setPrimary(mediaId) {
    const response = await fetch(
      `${this.baseUrl}/api/media/${mediaId}/primary`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${this.getToken()}` }
      }
    );

    return response.json();
  }

  // 6. Delete media
  async delete(mediaId) {
    const response = await fetch(
      `${this.baseUrl}/api/media/${mediaId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.getToken()}` }
      }
    );

    return response.json();
  }
}

// Usage
const media = new MediaManager('http://localhost:5000', () => localStorage.getItem('token'));

// Upload
const result = await media.upload('product', 42, file, {
  title: 'Product Photo',
  description: 'Main view',
  isPrimary: true
});

// List all media for product
const list = await media.list('product', 42);

// Display image in <img> tag
list.data.forEach(item => {
  const img = document.createElement('img');
  img.src = media.getFileUrl(item.id);
  img.alt = item.title;
  document.body.appendChild(img);
});
```

---

## Database Schema

The `media_assets` table stores metadata:

```sql
CREATE TABLE media_assets (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL,  -- 'product' | 'sku' | 'inventory_item' | 'location' | 'home'
  entity_id INTEGER NOT NULL,
  url TEXT NOT NULL,                 -- Relative path: "customers/1/product/42/1730476800-file.jpg"
  title VARCHAR(255),
  description TEXT,
  file_name VARCHAR(255),
  file_size INTEGER,
  mime_type VARCHAR(100),
  asset_type VARCHAR(20) DEFAULT 'image',  -- 'image' | 'document' | 'video' | 'link'
  is_primary BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  tags JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Parent entities (products, skus, inventory_items, locations) have a `has_media_assets` boolean flag that's automatically updated.

---

## Error Handling

### Common Errors

**400 Bad Request**
```json
{ "error": "No file uploaded" }
```

**403 Forbidden**
```json
{ "error": "Access denied to this entity" }
```

**404 Not Found**
```json
{ "error": "Media not found" }
{ "error": "File not found on disk" }
```

**413 Payload Too Large**
```json
{ "error": "File too large. Max size: 10MB" }
```

**415 Unsupported Media Type**
```json
{ "error": "File type image/bmp not allowed" }
```

### Client Error Handling Example

```javascript
try {
  const result = await media.upload('product', 42, file, metadata);
  
  if (result.error) {
    // Server returned error
    if (result.error.includes('too large')) {
      alert('File is too large. Maximum size is 10MB');
    } else if (result.error.includes('not allowed')) {
      alert('File type not supported. Use JPG, PNG, or PDF');
    } else {
      alert(`Upload failed: ${result.error}`);
    }
  } else {
    // Success
    console.log('Uploaded:', result.data);
  }
} catch (error) {
  // Network or other error
  console.error('Upload error:', error);
  alert('Network error. Please try again.');
}
```

---

## Security Notes

1. **Authentication Required**: All endpoints require valid JWT token
2. **Entity Access Control**: User must have access to the entity's home
3. **Multi-tenant Isolation**: Files stored in customer-specific directories
4. **File Type Restrictions**: Only safe file types allowed
5. **Size Limits**: 10MB per file
6. **Secure Serving**: Files served through authenticated endpoint, not static file server

---

## OneDrive Sync

Files stored at `G:\OneDrive\Jamaica\Jamaica\Media` automatically sync to OneDrive, providing:
- ✅ Automatic cloud backup
- ✅ Access from multiple devices
- ✅ Version history (OneDrive feature)
- ✅ Shared folder access

**Important**: If OneDrive is not running, uploads will still work (files saved locally), but won't sync until OneDrive starts.
