# Server Implementation: PDF Generation Endpoints

> **For:** Server developer implementing PDF generation  
> **Client Spec:** See [CLIENT_PDF_INTEGRATION.md](./CLIENT_PDF_INTEGRATION.md)

---

## Overview

The client sends annotated HTML (with image placeholders) to the server. The server:

1. Parses `data-media-id` attributes from `<img>` tags
2. Fetches images from protected storage (using auth context)
3. Embeds images as base64 data URIs
4. For `/render`: Converts to PDF using Playwright
5. For `/preview`: Returns processed HTML

---

## Required Endpoints

### 1. `POST /api/pdf/preview`

Returns processed HTML with embedded images (web variant for speed).

**Request:**
```json
{
  "html": "<!DOCTYPE html>...",
  "options": {
    "format": "Letter",
    "orientation": "portrait"
  }
}
```

**Response:** `text/html` - The processed HTML with images embedded

---

### 2. `POST /api/pdf/render`

Returns a PDF binary with print-quality images.

**Request:**
```json
{
  "html": "<!DOCTYPE html>...",
  "options": {
    "filename": "property-damage-report",
    "format": "Letter",
    "orientation": "portrait",
    "margins": {
      "top": "0.75in",
      "bottom": "0.75in",
      "left": "0.5in",
      "right": "0.5in"
    },
    "headerFooter": {
      "pageNumbers": true,
      "pageNumberPosition": "footer"
    }
  }
}
```

**Response:** `application/pdf` - Binary PDF data

---

## ⚠️ IMPORTANT: Increase Body Parser Limit

The HTML payload can be 500KB-2MB. **Increase the body parser limit:**

```js
// In Express setup, BEFORE other routes
app.use('/api/pdf', express.json({ limit: '10mb' }));
```

Or for these specific routes:
```js
app.post('/api/pdf/preview', express.json({ limit: '10mb' }), previewHandler);
app.post('/api/pdf/render', express.json({ limit: '10mb' }), renderHandler);
```

---

## Image Processing

### Input HTML (from client)

Images arrive as **placeholders** - no `src` attribute, only `data-media-id`:

```html
<img data-media-id="42" data-media-variant="print" alt="Damage photo" 
     style="background-color: #f0f0f0; min-height: 100px; min-width: 100px;">
```

### Processing Steps

```js
// Pseudocode
const cheerio = require('cheerio');

async function processImages(html, variant = 'print') {
  const $ = cheerio.load(html);
  
  const images = $('img[data-media-id]');
  
  for (const img of images.toArray()) {
    const $img = $(img);
    const mediaId = $img.attr('data-media-id');
    const requestedVariant = $img.attr('data-media-variant') || variant;
    
    try {
      // Fetch from your media storage (S3, local, etc.)
      const imageBuffer = await fetchMediaAsset(mediaId, requestedVariant);
      const mimeType = detectMimeType(imageBuffer); // 'image/jpeg', 'image/png', etc.
      const base64 = imageBuffer.toString('base64');
      
      // Embed as data URI
      $img.attr('src', `data:${mimeType};base64,${base64}`);
      
      // Clean up placeholder styles
      $img.css('background-color', '');
      $img.css('min-height', '');
      $img.css('min-width', '');
    } catch (error) {
      console.error(`Failed to fetch media ${mediaId}:`, error);
      // Leave placeholder or add error indicator
      $img.attr('alt', `[Image ${mediaId} unavailable]`);
    }
  }
  
  return $.html();
}
```

### Variant Selection

| Endpoint | Variant | Purpose |
|----------|---------|---------|
| `/preview` | `web` or `view` | Faster loading, lower quality |
| `/render` | `print` | High quality for PDF |

---

## PDF Bookmark Processing

The HTML contains `data-pdf-bookmark` attributes for PDF outline/TOC:

```html
<section data-pdf-bookmark="Living Room" data-pdf-bookmark-level="1">
  <article data-pdf-bookmark="Damaged Sofa" data-pdf-bookmark-level="2">
```

### Playwright Bookmark Implementation

```js
const puppeteer = require('playwright'); // or puppeteer

async function generatePdfWithBookmarks(html, options) {
  const browser = await puppeteer.chromium.launch();
  const page = await browser.newPage();
  
  await page.setContent(html, { waitUntil: 'networkidle' });
  
  // Extract bookmarks from DOM
  const bookmarks = await page.evaluate(() => {
    const elements = document.querySelectorAll('[data-pdf-bookmark]');
    return Array.from(elements).map(el => ({
      title: el.getAttribute('data-pdf-bookmark'),
      level: parseInt(el.getAttribute('data-pdf-bookmark-level') || '1', 10),
      // Get vertical position for PDF bookmark destination
      top: el.getBoundingClientRect().top + window.scrollY,
    }));
  });
  
  // Generate PDF
  const pdfBuffer = await page.pdf({
    format: options.format || 'Letter',
    landscape: options.orientation === 'landscape',
    margin: options.margins || {
      top: '0.75in',
      bottom: '0.75in',
      left: '0.5in',
      right: '0.5in',
    },
    printBackground: true,
    displayHeaderFooter: options.headerFooter?.pageNumbers,
    footerTemplate: options.headerFooter?.pageNumbers 
      ? '<div style="font-size:10px;text-align:center;width:100%;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
      : undefined,
  });
  
  await browser.close();
  
  // Note: Playwright/Puppeteer doesn't natively support PDF bookmarks.
  // For bookmarks, you may need to post-process with a library like pdf-lib:
  // const pdfWithBookmarks = await addBookmarksToPdf(pdfBuffer, bookmarks);
  
  return pdfBuffer;
}
```

---

## Page Break Attributes

The client adds these attributes for page break control:

| Attribute | CSS Equivalent | Use |
|-----------|---------------|-----|
| `data-pdf-break="before"` | `page-break-before: always` | New page before element |
| `data-pdf-break="after"` | `page-break-after: always` | New page after element |
| `data-pdf-break="avoid"` | `page-break-inside: avoid` | Keep element together |
| `data-pdf-flow="keep-with-next"` | `page-break-after: avoid` | Keep with following element |

These are handled by CSS in the embedded styles. No server processing needed.

---

## Error Responses

```json
{
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

| Code | Status | Description |
|------|--------|-------------|
| `MISSING_HTML` | 400 | No HTML in request body |
| `INVALID_HTML` | 400 | HTML parsing failed |
| `MEDIA_FETCH_FAILED` | 500 | Could not fetch one or more images |
| `PDF_GENERATION_FAILED` | 500 | Playwright/PDF conversion failed |

---

## Complete Handler Example

```js
// routes/pdf.js
const express = require('express');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

const router = express.Router();

// Increase body limit for HTML payloads
router.use(express.json({ limit: '10mb' }));

// Shared image processing
async function embedImages(html, variant) {
  const $ = cheerio.load(html);
  const images = $('img[data-media-id]').toArray();
  
  await Promise.all(images.map(async (img) => {
    const $img = $(img);
    const mediaId = $img.attr('data-media-id');
    const v = $img.attr('data-media-variant') || variant;
    
    try {
      const buffer = await fetchMediaAsset(mediaId, v);
      const mime = detectMimeType(buffer);
      $img.attr('src', `data:${mime};base64,${buffer.toString('base64')}`);
    } catch (e) {
      console.error(`Media ${mediaId} failed:`, e.message);
    }
  }));
  
  return $.html();
}

// Preview endpoint
router.post('/preview', async (req, res) => {
  try {
    const { html } = req.body;
    if (!html) return res.status(400).json({ message: 'Missing html' });
    
    const processed = await embedImages(html, 'web');
    res.type('text/html').send(processed);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Render endpoint
router.post('/render', async (req, res) => {
  try {
    const { html, options = {} } = req.body;
    if (!html) return res.status(400).json({ message: 'Missing html' });
    
    const processed = await embedImages(html, 'print');
    
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(processed, { waitUntil: 'networkidle' });
    
    const pdf = await page.pdf({
      format: options.format || 'Letter',
      landscape: options.orientation === 'landscape',
      margin: options.margins,
      printBackground: true,
    });
    
    await browser.close();
    
    const filename = options.filename || 'report';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    res.type('application/pdf').send(pdf);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
```

---

## Testing

1. **Preview:** Should return HTML viewable in browser with images
2. **Render:** Should return downloadable PDF
3. **Large payload:** Test with 50+ images to verify body limit works
4. **Missing images:** Should gracefully handle missing media IDs
5. **Bookmarks:** PDF should have navigable outline (if implemented)

---

## Questions?

Contact: [your-name]
