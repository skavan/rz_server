# Server-Side PDF Generation Specification

> **Version:** 1.0  
> **Status:** Draft  
> **Last Updated:** 2025-01-13

## Overview

A declarative, reusable PDF generation service that converts client-rendered HTML into PDFs with embedded images and navigable bookmarks. The client retains full control over layout via its declarative engine; the server handles protected media resolution and PDF conversion.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                            CLIENT                                   │
├─────────────────────────────────────────────────────────────────────┤
│  Declarative Engine                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │ View        │ -> │ Data        │ -> │ HTML Renderer           │ │
│  │ Definition  │    │ Transform   │    │ (with PDF annotations)  │ │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘ │
│                                                  │                  │
│                                                  ▼                  │
│                                        ┌─────────────────┐         │
│                                        │ Annotated HTML  │         │
│                                        │ - data-pdf-*    │         │
│                                        │ - data-media-*  │         │
│                                        └────────┬────────┘         │
└─────────────────────────────────────────────────┼───────────────────┘
                                                  │
                              POST /api/pdf/render│
                                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SERVER (rz_server)                          │
├─────────────────────────────────────────────────────────────────────┤
│  PDF Service                                                        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │ Image       │ -> │ Bookmark    │ -> │ Puppeteer               │ │
│  │ Resolver    │    │ Extractor   │    │ PDF Generator           │ │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘ │
│        │                   │                       │                │
│        ▼                   ▼                       ▼                │
│  ┌───────────┐      ┌───────────┐          ┌───────────┐           │
│  │ Storage   │      │ Outline   │          │ PDF       │           │
│  │ (no auth) │      │ Tree      │          │ Buffer    │           │
│  └───────────┘      └───────────┘          └───────────┘           │
└─────────────────────────────────────────────────────────────────────┘
                                                  │
                                                  ▼
                                        ┌─────────────────┐
                                        │ PDF Response    │
                                        │ (streamed)      │
                                        └─────────────────┘
```

---

## API Contract

### Endpoint

```
POST /api/pdf/render
Content-Type: application/json
Authorization: Bearer <token>
```

### Request Body

```typescript
interface PdfRenderRequest {
  /** The complete HTML document or fragment to render */
  html: string;
  
  /** PDF generation options */
  options?: PdfOptions;
}

interface PdfOptions {
  /** Output filename (without extension) */
  filename?: string;               // default: "document"
  
  /** Page format */
  format?: 'Letter' | 'Legal' | 'A4' | 'A3';  // default: "Letter"
  
  /** Page orientation */
  orientation?: 'portrait' | 'landscape';      // default: "portrait"
  
  /** Page margins */
  margins?: {
    top?: string;      // e.g., "0.5in", "12mm"
    right?: string;
    bottom?: string;
    left?: string;
  };
  
  /** Header/footer configuration */
  headerFooter?: {
    /** Show page numbers */
    pageNumbers?: boolean;          // default: false
    pageNumberFormat?: string;      // default: "Page {page} of {pages}"
    pageNumberPosition?: 'header' | 'footer';  // default: "footer"
    
    /** Custom header HTML (supports {page}, {pages}, {date} tokens) */
    headerTemplate?: string;
    
    /** Custom footer HTML */
    footerTemplate?: string;
  };
  
  /** Image handling */
  images?: {
    /** Default variant to use if not specified per-image */
    defaultVariant?: 'original' | 'print' | 'web' | 'thumb';  // default: "print"
    
    /** Skip images that fail to load instead of failing entire PDF */
    skipOnError?: boolean;          // default: true
    
    /** Placeholder to show for failed images (HTML or "none") */
    errorPlaceholder?: string;      // default: shows broken image icon
  };
  
  /** Bookmark/outline options */
  bookmarks?: {
    /** Enable bookmark extraction */
    enabled?: boolean;              // default: true
    
    /** Auto-generate bookmarks from headings if no explicit bookmarks */
    autoFromHeadings?: boolean;     // default: false
  };
}
```

### Response

**Success (200):**
```
Content-Type: application/pdf
Content-Disposition: inline; filename="<filename>.pdf"

<binary PDF data>
```

**Error (4xx/5xx):**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { /* optional context */ }
}
```

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_HTML` | 400 | HTML is empty or malformed |
| `MEDIA_ACCESS_DENIED` | 403 | User lacks access to referenced media |
| `MEDIA_NOT_FOUND` | 404 | Referenced media asset doesn't exist |
| `RENDER_FAILED` | 500 | Puppeteer/PDF generation failed |
| `TIMEOUT` | 504 | Generation exceeded time limit |

---

## HTML Annotation Spec

The client annotates HTML with `data-pdf-*` and `data-media-*` attributes. The server parses these declaratively — no hardcoded report logic.

### Images: `data-media-*`

Use these attributes on `<img>` tags to reference protected media assets.

#### Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-media-id` | Yes* | Media asset ID from `media_assets` table |
| `data-media-variant` | No | `original`, `print`, `web`, `thumb` (default: from options or `print`) |
| `data-media-fallback` | No | What to do if image fails: `placeholder`, `hide`, `error` |

*Either `data-media-id` OR a resolvable `src` URL is required.

#### Examples

**Basic (recommended):**
```html
<img data-media-id="42" alt="Living room damage" />
```

**With variant:**
```html
<img data-media-id="42" data-media-variant="print" alt="High-res for print" />
```

**With fallback:**
```html
<img data-media-id="42" data-media-fallback="hide" alt="Optional image" />
```

**Using URL pattern (alternative):**
```html
<!-- Server extracts ID from known URL patterns -->
<img src="/api/media/serve/42?variant=print" alt="Via URL" />
```

#### Resolution Process

1. Server finds all `<img>` with `data-media-id` or matching URL pattern
2. Validates user has access to each media asset (tenant + home scope)
3. Reads file from storage using appropriate variant
4. Converts to base64 data URI
5. Replaces `src` attribute in HTML

---

### Bookmarks: `data-pdf-bookmark`

Bookmarks create a navigable outline (table of contents) in the PDF viewer.

#### Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-pdf-bookmark` | Yes | Bookmark title (what appears in PDF outline) |
| `data-pdf-bookmark-level` | No | Nesting level: `1` (top), `2`, `3`, etc. (default: `1`) |
| `data-pdf-bookmark-id` | No | Unique ID for cross-referencing (optional) |

#### Example: Property Damage Report

```html
<article>
  <!-- Level 1: Main sections -->
  <header data-pdf-bookmark="Property Damage Report" data-pdf-bookmark-level="1">
    <h1>Property Damage Report</h1>
    <p>123 Main Street</p>
    <p>Generated: January 13, 2025</p>
  </header>

  <!-- Level 1: Location -->
  <section data-pdf-bookmark="Living Room" data-pdf-bookmark-level="1">
    <h2>Living Room</h2>
    
    <!-- Location photos -->
    <div class="photo-gallery">
      <img data-media-id="101" data-media-variant="print" alt="Living room overview" />
      <img data-media-id="102" data-media-variant="print" alt="Living room detail" />
    </div>
    
    <!-- Level 2: Issues within location -->
    <article data-pdf-bookmark="Damaged Sofa" data-pdf-bookmark-level="2">
      <h3>Issue #1: Damaged Sofa</h3>
      <p>Large tear on left cushion, approximately 6 inches.</p>
      
      <table>
        <tr><td>Repair Cost:</td><td>$450.00</td></tr>
        <tr><td>Replace Cost:</td><td>$1,200.00</td></tr>
      </table>
      
      <div class="issue-photos">
        <img data-media-id="201" alt="Sofa damage close-up" />
        <img data-media-id="202" alt="Sofa damage wide shot" />
      </div>
    </article>
    
    <article data-pdf-bookmark="Scratched Coffee Table" data-pdf-bookmark-level="2">
      <h3>Issue #2: Scratched Coffee Table</h3>
      <p>Multiple scratches on surface.</p>
      
      <img data-media-id="203" alt="Table scratches" />
    </article>
  </section>

  <section data-pdf-bookmark="Kitchen" data-pdf-bookmark-level="1">
    <h2>Kitchen</h2>
    
    <article data-pdf-bookmark="Broken Tile" data-pdf-bookmark-level="2">
      <h3>Issue #3: Broken Floor Tile</h3>
      <img data-media-id="301" alt="Broken tile" />
    </article>
  </section>

  <!-- Level 1: Summary -->
  <section data-pdf-bookmark="Cost Summary" data-pdf-bookmark-level="1">
    <h2>Cost Summary</h2>
    <table>
      <tr><td>Total Repair:</td><td>$1,250.00</td></tr>
      <tr><td>Total Replace:</td><td>$3,400.00</td></tr>
    </table>
  </section>
</article>
```

#### Resulting PDF Outline

```
▼ Property Damage Report
▼ Living Room
    Damaged Sofa
    Scratched Coffee Table
▼ Kitchen
    Broken Tile
  Cost Summary
```

---

### Page Breaks & Flow Control: `data-pdf-break`, `data-pdf-flow`

Control pagination and content flow explicitly.

#### Page Break: `data-pdf-break`

| Value | Description | CSS Equivalent |
|-------|-------------|----------------|
| `before` | Start on new page | `page-break-before: always` |
| `after` | Force page break after | `page-break-after: always` |
| `avoid` | Keep element together (no split) | `page-break-inside: avoid` |
| `avoid-before` | Don't break right before this | `page-break-before: avoid` |
| `avoid-after` | Don't break right after this (for headers) | `page-break-after: avoid` |

#### Flow Control: `data-pdf-flow`

| Value | Description | CSS Equivalent |
|-------|-------------|----------------|
| `keep-with-next` | Keep with following element (headers) | `break-after: avoid` |
| `keep-with-previous` | Keep with preceding element | `break-before: avoid` |
| `orphans-2` | Min 2 lines at page start | `orphans: 2` |
| `orphans-3` | Min 3 lines at page start | `orphans: 3` |
| `widows-2` | Min 2 lines at page end | `widows: 2` |
| `widows-3` | Min 3 lines at page end | `widows: 3` |

#### Table Headers: `data-pdf-table`

| Value | Description |
|-------|-------------|
| `repeat-header` | Repeat `<thead>` on every page |

#### Examples

```html
<!-- Each location starts on new page -->
<section data-pdf-bookmark="Kitchen" data-pdf-break="before">
  <h2>Kitchen</h2>
  ...
</section>

<!-- Header stays with its content (won't be alone at bottom of page) -->
<h3 data-pdf-flow="keep-with-next">Issue Details</h3>
<div class="issue-content">...</div>

<!-- Keep summary table together, don't split across pages -->
<table data-pdf-break="avoid">
  <tr><td>Total:</td><td>$5,000</td></tr>
</table>

<!-- Table with repeating header on each page -->
<table data-pdf-table="repeat-header">
  <thead>
    <tr><th>Item</th><th>Cost</th></tr>
  </thead>
  <tbody>
    <tr><td>Sofa repair</td><td>$450</td></tr>
    <!-- ... many rows ... -->
  </tbody>
</table>

<!-- Ensure at least 3 lines of paragraph stay together at page boundaries -->
<p data-pdf-flow="orphans-3 widows-3">
  Long paragraph that might span pages...
</p>

<!-- Section header won't be stranded at bottom of page -->
<h2 data-pdf-break="avoid-after">Damage Assessment</h2>
<p>Content that follows...</p>
```

#### CSS Fallback (also supported)

The server also respects standard CSS paged media properties:

```css
/* Force page breaks */
.location-section { page-break-before: always; }
.keep-together { page-break-inside: avoid; }

/* Keep headers with content */
h2, h3, h4 { 
  page-break-after: avoid;
  break-after: avoid;
}

/* Table header repeat */
thead { display: table-header-group; }

/* Orphan/widow control */
p { 
  orphans: 3; 
  widows: 3; 
}
```

> **Note:** `data-pdf-*` attributes are converted to inline CSS by the server. 
> You can use either approach, or mix them. The data attributes are recommended 
> for clarity and to keep styles separate from print behavior.

---

### Hide from PDF: `data-pdf-hide`

Exclude elements from PDF output (useful for interactive UI elements).

```html
<button data-pdf-hide>Download PDF</button>
<div data-pdf-hide class="screen-only-controls">...</div>
```

---

### Section Markers: `data-pdf-section-start`

For large reports, mark section boundaries to enable chunked rendering. This prevents memory issues with reports containing hundreds of images.

```html
<div data-pdf-section="Living Room" data-pdf-section-start></div>
<!-- Living Room content (images, issues, etc.) -->

<div data-pdf-section="Kitchen" data-pdf-section-start></div>
<!-- Kitchen content -->

<div data-pdf-section="Summary" data-pdf-section-start></div>
<!-- Summary content -->
```

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-pdf-section-start` | Yes | Marks the start of a new section |
| `data-pdf-section` | Yes | Section name (used for bookmarks) |

**Server behavior:**
1. Splits HTML at each `data-pdf-section-start` marker
2. Renders each section as a separate PDF (memory-safe)
3. Merges all section PDFs into final output
4. Section names become PDF bookmarks

**When to use:**
- Reports with 50+ images
- Reports with 20+ pages
- Any report where rendering fails or produces artifacts

---

## Complete Attribute Reference

### Media Attributes

| Attribute | Applies To | Values | Description |
|-----------|------------|--------|-------------|
| `data-media-id` | `<img>` | number | Media asset ID |
| `data-media-variant` | `<img>` | `original`, `print`, `web`, `thumb` | Image variant to use |
| `data-media-fallback` | `<img>` | `placeholder`, `hide`, `error` | Behavior when image fails |
| `data-media-quality` | `<img>` | `1-100` | JPEG quality (triggers recompression) |
| `data-media-max-width` | `<img>` | pixels | Scale down if wider |
| `data-media-max-height` | `<img>` | pixels | Scale down if taller |

### Bookmark Attributes

| Attribute | Applies To | Values | Description |
|-----------|------------|--------|-------------|
| `data-pdf-bookmark` | any | string | Bookmark title in PDF outline |
| `data-pdf-bookmark-level` | any | `1`, `2`, `3`... | Nesting depth (1 = top level) |
| `data-pdf-bookmark-id` | any | string | Optional unique identifier |

### Page Break Attributes

| Attribute | Applies To | Values | Description |
|-----------|------------|--------|-------------|
| `data-pdf-break` | any | `before` | Force page break before element |
| | | `after` | Force page break after element |
| | | `avoid` | Prevent element from splitting across pages |
| | | `avoid-before` | Prevent page break immediately before |
| | | `avoid-after` | Prevent page break immediately after |

### Flow Control Attributes

| Attribute | Applies To | Values | Description |
|-----------|------------|--------|-------------|
| `data-pdf-flow` | any | `keep-with-next` | Keep element on same page as next sibling |
| | | `keep-with-previous` | Keep element on same page as previous sibling |
| | | `orphans-2`, `orphans-3` | Min lines at start of page |
| | | `widows-2`, `widows-3` | Min lines at end of page |

### Table Attributes

| Attribute | Applies To | Values | Description |
|-----------|------------|--------|-------------|
| `data-pdf-table` | `<table>` | `repeat-header` | Repeat `<thead>` on every page |

### Visibility Attributes

| Attribute | Applies To | Values | Description |
|-----------|------------|--------|-------------|
| `data-pdf-hide` | any | (presence) | Exclude element from PDF output |

---

## Renderer Selection

### Options Comparison

| Renderer | Pros | Cons | Best For |
|----------|------|------|----------|
| **Puppeteer/Playwright** | Excellent CSS support, modern features, accurate rendering | Heavy (~300MB), slow cold start, resource intensive | Complex layouts, pixel-perfect rendering |
| **wkhtmltopdf** | Lightweight, fast, battle-tested | Older WebKit, CSS Grid/Flexbox issues, orphaned project | Simple layouts, high volume |
| **Prince** | Best quality, excellent paged media CSS | Commercial license ($$$) | Publishing-grade output |
| **WeasyPrint** | Good CSS support, lightweight, active development | Python (requires subprocess or service), some CSS gaps | Medium complexity, cost-sensitive |
| **Gotenberg** | Docker-based, wraps multiple engines, API-ready | Extra infrastructure, network hop | Microservice architecture |
| **PDFKit (direct)** | No HTML overhead, streaming, lightweight | No HTML/CSS (programmatic only), manual layout | Simple, structured reports |

### Recommendation: Hybrid Approach

Given your requirements (complex layouts from declarative engine + performance):

**Primary: Playwright (Chromium)**
- Best CSS paged media support (`break-*`, `orphans`, `widows`, table headers)
- Handles complex layouts from declarative engine
- Active development, security updates

**Mitigation for resource concerns:**
1. **Browser pool** – Reuse browser instances (don't launch per request)
2. **Warm instances** – Keep 2-3 browsers ready
3. **Timeout limits** – Kill long-running renders
4. **Optional: Gotenberg sidecar** – Offload to dedicated container if needed

**Fallback consideration: WeasyPrint**
- If Playwright proves too heavy for your infrastructure
- Good CSS support, Python-based (can call via subprocess)
- ~10x lighter than Chromium

### Configuration

```typescript
interface PdfRendererConfig {
  /** Which renderer to use */
  engine: 'playwright' | 'puppeteer' | 'weasyprint' | 'gotenberg';
  
  /** Playwright/Puppeteer specific */
  chromium?: {
    /** Reuse browser instances */
    poolSize: number;              // default: 3
    /** Max concurrent renders per browser */
    maxConcurrent: number;         // default: 2
    /** Kill browser after N renders (memory leak prevention) */
    recycleAfter: number;          // default: 50
  };
  
  /** External service (Gotenberg, WeasyPrint API) */
  serviceUrl?: string;
}
```

---

## Image Quality & Compression

### Existing Variants

Your media system already handles quality tiers:

| Variant | Typical Resolution | Use Case |
|---------|-------------------|----------|
| `original` | As uploaded | Archival, maximum quality |
| `print` | ~2000px max dimension, high JPEG quality | PDF generation (recommended default) |
| `web` | ~1200px max dimension, optimized | Screen viewing |
| `thumb` | ~300px | Thumbnails, previews |

### PDF-Specific Quality Options

```typescript
interface ImageQualityOptions {
  /** Default variant for PDF images */
  defaultVariant: 'original' | 'print' | 'web' | 'thumb';  // default: 'print'
  
  /** Re-compress images before embedding (reduces PDF size) */
  recompress?: {
    enabled: boolean;             // default: false
    quality: number;              // JPEG quality 0-100, default: 85
    maxDimension?: number;        // Max width/height, default: none
    format: 'jpeg' | 'webp';      // Output format, default: 'jpeg'
  };
  
  /** Embed as base64 data URI vs linked (base64 is more portable) */
  embedMethod: 'base64' | 'file';  // default: 'base64'
}
```

### Per-Image Quality Override

Allow client to specify quality per image:

```html
<!-- Use print variant (high quality) -->
<img data-media-id="42" data-media-variant="print" />

<!-- Use web variant (smaller file, acceptable for thumbnails in PDF) -->
<img data-media-id="43" data-media-variant="web" />

<!-- Force original (maximum quality, larger PDF) -->
<img data-media-id="44" data-media-variant="original" />

<!-- Request server-side recompression -->
<img data-media-id="45" 
     data-media-variant="original" 
     data-media-quality="80" 
     data-media-max-width="1500" />
```

### New Media Attributes

| Attribute | Values | Description |
|-----------|--------|-------------|
| `data-media-quality` | `1-100` | JPEG quality for this image (triggers recompression) |
| `data-media-max-width` | pixels | Max width, scale down if larger |
| `data-media-max-height` | pixels | Max height, scale down if larger |

### PDF Size Optimization Strategy

```
┌─────────────────────────────────────────────────────────────┐
│ Image in HTML                                               │
│ data-media-id="42" data-media-variant="print"               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Load variant from storage                                │
│    → print variant already optimized (2000px, quality 90)   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Optional: Re-compress if data-media-quality specified    │
│    → Sharp: resize + compress to target quality             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Convert to base64, embed in HTML                         │
│    → data:image/jpeg;base64,...                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Playwright renders HTML → PDF                            │
│    → Images embedded as-is (no additional compression)      │
└─────────────────────────────────────────────────────────────┘
```

### Recommended Defaults

```typescript
const DEFAULT_IMAGE_OPTIONS: ImageQualityOptions = {
  defaultVariant: 'print',      // Already optimized for print
  recompress: {
    enabled: false,             // Trust existing variants
    quality: 85,
    format: 'jpeg',
  },
  embedMethod: 'base64',
};
```

**Rationale:** Your `print` variant is already optimized. Only enable recompression if:
- PDFs are still too large
- You need to cap dimensions below what `print` provides
- Specific images need different quality than their variant

---

## Server Implementation

### File Structure

```
server/src/
  pdf/
    index.ts                 # Public API: renderHtmlToPdf()
    types.ts                 # Interfaces
    html-processor.ts        # Main processing pipeline
    processors/
      image-resolver.ts      # data-media-* handling
      bookmark-extractor.ts  # data-pdf-bookmark handling
      page-break-handler.ts  # data-pdf-break handling
      hide-handler.ts        # data-pdf-hide handling
    puppeteer-renderer.ts    # HTML -> PDF conversion
    bookmark-injector.ts     # Add outlines to PDF (pdf-lib)
  routes/
    pdf.ts                   # POST /api/pdf/render
```

### Processing Pipeline

```typescript
async function renderHtmlToPdf(
  html: string,
  options: PdfOptions,
  scope: RequestScope
): Promise<PdfResult> {
  
  // 1. Parse HTML
  const $ = cheerio.load(html);
  
  // 2. Remove hidden elements
  $('[data-pdf-hide]').remove();
  
  // 3. Resolve images (parallel)
  await resolveImages($, scope, options.images);
  
  // 4. Extract bookmark tree
  const bookmarks = extractBookmarks($, options.bookmarks);
  
  // 5. Process page breaks (convert to CSS)
  processPageBreaks($);
  
  // 6. Render PDF via Puppeteer
  const pdfBuffer = await renderWithPuppeteer($.html(), options);
  
  // 7. Inject bookmarks (pdf-lib)
  const pdfWithBookmarks = await injectBookmarks(pdfBuffer, bookmarks);
  
  return {
    buffer: pdfWithBookmarks,
    filename: `${options.filename || 'document'}.pdf`,
    mimeType: 'application/pdf',
  };
}
```

### Image Resolver Detail

```typescript
interface MediaReference {
  element: cheerio.Element;
  mediaId: number;
  variant: string;
}

async function resolveImages(
  $: cheerio.CheerioAPI,
  scope: RequestScope,
  options: ImageOptions
): Promise<void> {
  
  // 1. Collect all media references
  const refs: MediaReference[] = [];
  
  $('img[data-media-id]').each((_, el) => {
    refs.push({
      element: el,
      mediaId: parseInt($(el).attr('data-media-id')!),
      variant: $(el).attr('data-media-variant') || options.defaultVariant,
    });
  });
  
  // Also parse URL patterns: /api/media/serve/:id
  $('img[src^="/api/media/serve/"]').each((_, el) => {
    const src = $(el).attr('src')!;
    const match = src.match(/\/api\/media\/serve\/(\d+)/);
    if (match) {
      refs.push({
        element: el,
        mediaId: parseInt(match[1]),
        variant: new URL(src, 'http://x').searchParams.get('variant') 
                 || options.defaultVariant,
      });
    }
  });
  
  // 2. Batch validate access
  const mediaIds = [...new Set(refs.map(r => r.mediaId))];
  const accessibleMedia = await validateMediaAccess(scope, mediaIds);
  
  // 3. Resolve each image in parallel
  await Promise.all(refs.map(async (ref) => {
    const $el = $(ref.element);
    const media = accessibleMedia.get(ref.mediaId);
    
    if (!media) {
      handleImageError($el, 'access_denied', options);
      return;
    }
    
    try {
      const base64 = await getImageAsBase64(media, ref.variant);
      $el.attr('src', base64);
      $el.removeAttr('data-media-id');
      $el.removeAttr('data-media-variant');
    } catch (err) {
      handleImageError($el, 'load_failed', options);
    }
  }));
}

async function getImageAsBase64(
  media: MediaAsset,
  variant: string
): Promise<string> {
  // Try variant, fall back to original
  const variantPath = getVariantPath(media.url, variant);
  const filePath = await storage.exists(variantPath)
    ? variantPath
    : media.url;
  
  const buffer = await storage.readFile(filePath);
  const mimeType = variant !== 'original' ? 'image/jpeg' : media.mimeType;
  
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
```

### Bookmark Extractor Detail

```typescript
interface BookmarkNode {
  title: string;
  level: number;
  id?: string;
  pageIndex?: number;  // Populated after PDF render
  children: BookmarkNode[];
}

function extractBookmarks(
  $: cheerio.CheerioAPI,
  options: BookmarkOptions
): BookmarkNode[] {
  const flat: Array<{ title: string; level: number; id?: string }> = [];
  
  $('[data-pdf-bookmark]').each((_, el) => {
    flat.push({
      title: $(el).attr('data-pdf-bookmark')!,
      level: parseInt($(el).attr('data-pdf-bookmark-level') || '1'),
      id: $(el).attr('data-pdf-bookmark-id'),
    });
  });
  
  // Auto-generate from headings if enabled and no explicit bookmarks
  if (flat.length === 0 && options.autoFromHeadings) {
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const tag = el.tagName.toLowerCase();
      const level = parseInt(tag.charAt(1));
      flat.push({
        title: $(el).text().trim(),
        level,
      });
    });
  }
  
  // Convert flat list to tree
  return buildBookmarkTree(flat);
}

function buildBookmarkTree(
  flat: Array<{ title: string; level: number; id?: string }>
): BookmarkNode[] {
  const root: BookmarkNode[] = [];
  const stack: BookmarkNode[] = [];
  
  for (const item of flat) {
    const node: BookmarkNode = {
      title: item.title,
      level: item.level,
      id: item.id,
      children: [],
    };
    
    // Pop stack until we find parent level
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }
    
    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    
    stack.push(node);
  }
  
  return root;
}
```

---

## Client Integration Guide

### Declarative Engine Updates

The declarative engine should support PDF-specific rendering options:

```typescript
// View definition enhancement
interface ViewDefinition {
  // ... existing fields ...
  
  pdfOptions?: {
    /** Enable PDF-specific rendering mode */
    enabled: boolean;
    
    /** Map entity types to bookmark levels */
    bookmarkMapping?: {
      location: 1,
      issue: 2,
      // etc.
    };
    
    /** Image variant for PDF output */
    imageVariant?: 'print' | 'web' | 'original';
  };
}
```

### Renderer Enhancement

When rendering for PDF, the engine should:

1. Add `data-media-id` to images instead of fetching blobs
2. Add `data-pdf-bookmark` based on data context
3. Add `data-pdf-break="before"` on section boundaries
4. Skip interactive elements or mark with `data-pdf-hide`

### Example: Declarative to HTML

**Input (declarative definition):**
```typescript
{
  renderer: "section",
  dataSource: "locations",
  pdfOptions: {
    bookmark: { field: "name", level: 1 },
    pageBreak: "before"
  },
  children: [
    {
      renderer: "image-gallery",
      dataSource: "location_media",
      itemOptions: {
        mediaId: { field: "id" },
        variant: "print"
      }
    },
    {
      renderer: "section",
      dataSource: "issues",
      pdfOptions: {
        bookmark: { field: "title", level: 2 }
      },
      // ...
    }
  ]
}
```

**Output (annotated HTML):**
```html
<section 
  data-pdf-bookmark="Living Room" 
  data-pdf-bookmark-level="1"
  data-pdf-break="before">
  
  <h2>Living Room</h2>
  
  <div class="image-gallery">
    <img data-media-id="101" data-media-variant="print" />
    <img data-media-id="102" data-media-variant="print" />
  </div>
  
  <article 
    data-pdf-bookmark="Damaged Sofa" 
    data-pdf-bookmark-level="2">
    <h3>Damaged Sofa</h3>
    <!-- ... -->
  </article>
</section>
```

---

## Security Considerations

### Media Access Validation

Before embedding any image, the server validates:

1. **Tenant scope:** `media.customerId === scope.customerId`
2. **Home access:** If media is home-scoped, verify `homeId ∈ scope.homeIds`
3. **Entity access:** Validate user can access the parent entity (location, issue, etc.)

### Request Size Limits

```typescript
// Recommended limits
const PDF_LIMITS = {
  maxHtmlSize: 5 * 1024 * 1024,     // 5MB HTML input
  maxImages: 200,                    // Max images per PDF
  maxRenderTime: 60_000,             // 60 second timeout
  maxOutputSize: 50 * 1024 * 1024,   // 50MB PDF output
};
```

### Rate Limiting

PDF generation is resource-intensive. Implement per-user rate limiting:

```typescript
// Suggested limits
const RATE_LIMITS = {
  requestsPerMinute: 10,
  requestsPerHour: 50,
  concurrentRequests: 2,
};
```

---

## Performance Considerations

### Image Optimization

1. **Use print variant by default** — already optimized for quality/size balance
2. **Parallel fetching** — resolve all images concurrently
3. **Cache base64** — consider short-lived cache for repeated images

### Puppeteer Pool

For production, maintain a pool of browser instances:

```typescript
import genericPool from 'generic-pool';

const browserPool = genericPool.createPool({
  create: () => puppeteer.launch({ headless: true }),
  destroy: (browser) => browser.close(),
}, {
  min: 2,
  max: 10,
});
```

### Large Document Handling

For reports with 50+ pages:
- Stream PDF chunks if possible
- Consider generating sections separately and merging
- Provide progress webhooks for async generation

---

## Error Handling

### Graceful Degradation

| Scenario | Default Behavior | Configurable |
|----------|------------------|--------------|
| Image not found | Show placeholder | `data-media-fallback` |
| Image access denied | Show placeholder | `data-media-fallback` |
| Invalid HTML | Return 400 error | No |
| Render timeout | Return 504 error | `options.timeout` |

### Placeholder Image

Default placeholder for failed images:
```html
<div style="
  width: 200px; 
  height: 150px; 
  background: #f0f0f0; 
  display: flex; 
  align-items: center; 
  justify-content: center;
  border: 1px dashed #ccc;
">
  <span style="color: #999;">Image unavailable</span>
</div>
```

---

## Future Enhancements

### Phase 2: Async Generation
- Queue-based generation for large reports
- Webhook notification on completion
- Download link with expiry

### Phase 3: Templates
- Server-side template library for common layouts
- Header/footer templates with logo embedding
- Cover page templates

### Phase 4: Multi-format
- Extend to support XLSX, DOCX exports
- Same declarative annotation approach

---

## Appendix: Complete Example

### Client Request

```typescript
const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .header { text-align: center; margin-bottom: 2em; }
    .location { margin-bottom: 2em; }
    .issue { margin-left: 1em; margin-bottom: 1em; }
    .photos { display: flex; gap: 10px; flex-wrap: wrap; }
    .photos img { max-width: 200px; max-height: 150px; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ddd; padding: 8px; }
  </style>
</head>
<body>
  <header class="header" data-pdf-bookmark="Property Damage Report">
    <h1>Property Damage Report</h1>
    <p>123 Ocean View Drive, Malibu, CA</p>
    <p>Inspection Date: January 13, 2025</p>
  </header>
  
  <section class="location" data-pdf-bookmark="Living Room" data-pdf-bookmark-level="1" data-pdf-break="before">
    <h2>Living Room</h2>
    
    <div class="photos">
      <img data-media-id="101" data-media-variant="print" alt="Living room" />
    </div>
    
    <article class="issue" data-pdf-bookmark="Damaged Sofa" data-pdf-bookmark-level="2">
      <h3>Issue: Damaged Sofa</h3>
      <p>Large tear on left cushion.</p>
      <table>
        <tr><th>Repair Estimate</th><td>$450.00</td></tr>
        <tr><th>Replace Estimate</th><td>$1,200.00</td></tr>
      </table>
      <div class="photos">
        <img data-media-id="201" alt="Sofa damage" />
        <img data-media-id="202" alt="Sofa detail" />
      </div>
    </article>
  </section>
  
  <section class="location" data-pdf-bookmark="Kitchen" data-pdf-bookmark-level="1" data-pdf-break="before">
    <h2>Kitchen</h2>
    
    <article class="issue" data-pdf-bookmark="Cracked Counter" data-pdf-bookmark-level="2">
      <h3>Issue: Cracked Counter</h3>
      <img data-media-id="301" alt="Counter crack" />
    </article>
  </section>
  
  <button data-pdf-hide onclick="downloadPdf()">Download PDF</button>
</body>
</html>
`;

const response = await fetch('/api/pdf/render', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    html,
    options: {
      filename: 'property-damage-report-123-main-st',
      format: 'Letter',
      margins: { top: '0.75in', bottom: '0.75in', left: '0.5in', right: '0.5in' },
      headerFooter: {
        pageNumbers: true,
        pageNumberPosition: 'footer',
      },
    },
  }),
});

const blob = await response.blob();
const url = URL.createObjectURL(blob);
window.open(url);
```

### Resulting PDF Features

- ✅ All images embedded (fetched from protected storage)
- ✅ Navigable bookmarks in PDF viewer sidebar
- ✅ Page breaks between locations
- ✅ Page numbers in footer
- ✅ "Download PDF" button excluded from output
