# Client Integration: PDF Generation

> **For:** Client developer updating Property Damage to v4  
> **Full Spec:** See [PDF_GENERATION_SPEC.md](./PDF_GENERATION_SPEC.md)

---

## Overview

Instead of generating PDFs client-side, the declarative engine now renders **annotated HTML** which is sent to the server for PDF conversion. The server handles:
- Fetching protected media (no auth issues)
- Embedding images as base64
- Converting HTML → PDF with bookmarks

---

## What You Need To Do

### 1. Render HTML with `data-pdf-*` and `data-media-*` attributes
### 2. Include CSS inline (see Styling section below)
### 3. POST the HTML to `/api/pdf/render`
### 4. Receive PDF blob, trigger download

---

## Styling (CSS)

**The server renders whatever HTML you send — embed CSS directly in the HTML.**

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    /* Base styles */
    body { 
      font-family: Arial, sans-serif; 
      font-size: 12pt;
      color: #333;
    }
    
    /* Layout */
    .location-section { margin-bottom: 2em; }
    .issue { margin-left: 1em; margin-bottom: 1em; }
    
    /* Tables */
    table { 
      border-collapse: collapse; 
      width: 100%; 
      margin: 1em 0;
    }
    th, td { 
      border: 1px solid #ddd; 
      padding: 8px; 
      text-align: left;
    }
    th { background: #f5f5f5; }
    
    /* Images */
    .photo-gallery { 
      display: flex; 
      gap: 10px; 
      flex-wrap: wrap; 
    }
    .photo-gallery img { 
      max-width: 200px; 
      max-height: 150px; 
    }
    
    /* Print-specific styles */
    @media print {
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <!-- Your content -->
</body>
</html>
```

**Tips:**
- Use `pt` or `in` units for print (not `px`)
- Test with `@media print` styles
- Avoid external fonts (embed if needed via base64)

---

## Preview Mode

Before generating the final PDF, you can preview how it will look:

```typescript
// Preview: Returns processed HTML with embedded images
const previewResponse = await fetch('/api/pdf/preview', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({ html, options }),
});

const previewHtml = await previewResponse.text();

// Display in iframe for preview
const iframe = document.getElementById('preview-frame') as HTMLIFrameElement;
iframe.srcdoc = previewHtml;
```

**Differences from /render:**
| Endpoint | Returns | Images | Use For |
|----------|---------|--------|---------|
| `/api/pdf/preview` | HTML | Web variant (faster) | Preview in iframe |
| `/api/pdf/render` | PDF binary | Print variant (quality) | Final download |

---

## Quick Reference: Attributes

### Images (Required)

```html
<!-- Instead of fetching blob URLs, just reference by ID -->
<img data-media-id="42" data-media-variant="print" alt="Damage photo" />
```

| Attribute | Required | Values |
|-----------|----------|--------|
| `data-media-id` | ✅ | Media asset ID |
| `data-media-variant` | No | `print` (default), `web`, `thumb`, `original` |

### Bookmarks (For PDF Navigation)

```html
<section data-pdf-bookmark="Living Room" data-pdf-bookmark-level="1">
  <article data-pdf-bookmark="Damaged Sofa" data-pdf-bookmark-level="2">
```

| Attribute | Values |
|-----------|--------|
| `data-pdf-bookmark` | Bookmark title (shown in PDF sidebar) |
| `data-pdf-bookmark-level` | `1` = top level, `2` = nested, etc. |

### Page Breaks

```html
<!-- Start each location on new page -->
<section data-pdf-break="before">

<!-- Keep table together (don't split across pages) -->
<table data-pdf-break="avoid">

<!-- Keep header with its content -->
<h3 data-pdf-flow="keep-with-next">Issue Details</h3>
```

| Attribute | Values |
|-----------|--------|
| `data-pdf-break` | `before`, `after`, `avoid`, `avoid-after` |
| `data-pdf-flow` | `keep-with-next`, `keep-with-previous` |

### Tables with Repeating Headers

```html
<table data-pdf-table="repeat-header">
  <thead>...</thead>  <!-- Repeats on every page -->
  <tbody>...</tbody>
</table>
```

### Hide from PDF

```html
<button data-pdf-hide>Download PDF</button>
```

### Section Markers (for large reports)

For reports with 50+ images, add section markers to enable chunked rendering:

```html
<div data-pdf-section="Living Room" data-pdf-section-start></div>
<!-- Living Room content -->

<div data-pdf-section="Kitchen" data-pdf-section-start></div>
<!-- Kitchen content -->
```

Server splits on these markers, renders each section separately, then merges. Prevents memory issues with large reports.

---

## Property Damage v4: Example Structure

```html
<article class="property-damage-report">
  
  <!-- Cover / Header -->
  <header data-pdf-bookmark="Property Damage Report">
    <h1>Property Damage Report</h1>
    <p>{{ home.name }}</p>
    <p>{{ home.address }}</p>
    <p>Generated: {{ generatedAt }}</p>
  </header>

  <!-- Loop: Locations -->
  {{#each locations}}
  <section 
    class="location-section"
    data-pdf-bookmark="{{ name }}" 
    data-pdf-bookmark-level="1"
    data-pdf-break="before">
    
    <h2>{{ name }}</h2>
    <p class="location-type">{{ typeName }}</p>
    
    <!-- Location Photos -->
    <div class="photo-gallery">
      {{#each media}}
      <img 
        data-media-id="{{ id }}" 
        data-media-variant="print" 
        alt="{{ title }}" />
      {{/each}}
    </div>
    
    <!-- Loop: Issues within Location -->
    {{#each issues}}
    <article 
      class="issue"
      data-pdf-bookmark="{{ title }}" 
      data-pdf-bookmark-level="2">
      
      <h3 data-pdf-flow="keep-with-next">{{ title }}</h3>
      <p>{{ description }}</p>
      
      <!-- Pricing Table -->
      <table data-pdf-break="avoid">
        <tr>
          <td>Repair Estimate:</td>
          <td>{{ formatCurrency repairCost }}</td>
        </tr>
        <tr>
          <td>Replace Estimate:</td>
          <td>{{ formatCurrency replaceCost }}</td>
        </tr>
        {{#if landedCost}}
        <tr>
          <td>Landed Cost (w/ import):</td>
          <td>{{ formatCurrency landedCost }}</td>
        </tr>
        {{/if}}
      </table>
      
      <!-- Issue Photos -->
      <div class="issue-photos">
        {{#each media}}
        <img 
          data-media-id="{{ id }}" 
          data-media-variant="print" 
          alt="{{ title }}" />
        {{/each}}
      </div>
      
    </article>
    {{/each}}
    
  </section>
  {{/each}}

  <!-- Summary Section -->
  <section 
    data-pdf-bookmark="Cost Summary" 
    data-pdf-bookmark-level="1"
    data-pdf-break="before">
    
    <h2>Cost Summary</h2>
    
    <table data-pdf-table="repeat-header" data-pdf-break="avoid">
      <thead>
        <tr>
          <th>Location</th>
          <th>Issue</th>
          <th>Repair</th>
          <th>Replace</th>
        </tr>
      </thead>
      <tbody>
        {{#each allIssues}}
        <tr>
          <td>{{ locationName }}</td>
          <td>{{ title }}</td>
          <td>{{ formatCurrency repairCost }}</td>
          <td>{{ formatCurrency replaceCost }}</td>
        </tr>
        {{/each}}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total</strong></td>
          <td><strong>{{ formatCurrency totalRepair }}</strong></td>
          <td><strong>{{ formatCurrency totalReplace }}</strong></td>
        </tr>
      </tfoot>
    </table>
    
  </section>

  <!-- Interactive elements - hidden from PDF -->
  <div data-pdf-hide class="toolbar">
    <button onclick="downloadPdf()">Download PDF</button>
    <button onclick="print()">Print</button>
  </div>

</article>
```

---

## Calling the PDF Endpoint

```typescript
async function generatePropertyDamagePdf(homeId: number): Promise<void> {
  // 1. Get annotated HTML from declarative engine
  const html = renderPropertyDamageReport(homeId, { mode: 'pdf' });
  
  // 2. Send to server
  const response = await fetch('/api/pdf/render', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({
      html,
      options: {
        filename: `property-damage-${homeId}`,
        format: 'Letter',
        margins: {
          top: '0.75in',
          bottom: '0.75in',
          left: '0.5in',
          right: '0.5in',
        },
        headerFooter: {
          pageNumbers: true,
          pageNumberPosition: 'footer',
        },
      },
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  // 3. Download PDF
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `property-damage-${homeId}.pdf`;
  a.click();
  
  URL.revokeObjectURL(url);
}
```

---

## Declarative Engine Updates

If using the declarative view definition, add PDF-specific options:

```typescript
// In view definition
{
  renderer: "section",
  dataSource: "locations",
  
  // NEW: PDF annotations
  pdfOptions: {
    bookmark: { 
      field: "name",      // Use location.name as bookmark title
      level: 1 
    },
    pageBreak: "before",  // Each location starts new page
  },
  
  children: [
    {
      renderer: "image-gallery",
      dataSource: "location_media",
      itemOptions: {
        // NEW: Reference by ID, not blob URL
        mediaIdField: "id",
        variant: "print",
      },
    },
    {
      renderer: "section",
      dataSource: "issues",
      pdfOptions: {
        bookmark: { field: "title", level: 2 },
      },
      // ...
    },
  ],
}
```

---

## Expected PDF Outline

```
▼ Property Damage Report
▼ Living Room
    Damaged Sofa
    Scratched Coffee Table  
▼ Kitchen
    Broken Floor Tile
    Stained Countertop
▼ Master Bedroom
    Water Damage - Ceiling
  Cost Summary
```

---

## Checklist

- [ ] Images use `data-media-id` instead of fetching blobs
- [ ] Locations have `data-pdf-bookmark` with level `1`
- [ ] Issues have `data-pdf-bookmark` with level `2`  
- [ ] Locations have `data-pdf-break="before"`
- [ ] Headers have `data-pdf-flow="keep-with-next"`
- [ ] Summary table has `data-pdf-table="repeat-header"`
- [ ] Interactive elements have `data-pdf-hide`
- [ ] Endpoint call returns PDF blob and triggers download

---

## Questions?

Full technical spec: [PDF_GENERATION_SPEC.md](./PDF_GENERATION_SPEC.md)
