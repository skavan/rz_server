/**
 * PDF Generation Service
 * 
 * Converts annotated HTML to PDF with embedded images and bookmarks.
 * See PDF_GENERATION_SPEC.md for full documentation.
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PDFDocument, PDFDict, PDFName, PDFNumber, PDFString, PDFHexString, PDFRef } from 'pdf-lib';
import {
  PdfOptions,
  PdfResult,
  ProcessingContext,
  DEFAULT_PDF_OPTIONS,
  PDF_LIMITS,
} from './types.js';
import { resolveImages } from './processors/image-resolver.js';
import { extractBookmarks } from './processors/bookmark-extractor.js';
import { processFlowControl } from './processors/flow-handler.js';
import { splitIntoSections } from './processors/section-splitter.js';
import { renderToPdf, initBrowserPool, closeBrowserPool } from './playwright-renderer.js';
import { injectBookmarks } from './bookmark-injector.js';

export { initBrowserPool, closeBrowserPool } from './playwright-renderer.js';
export * from './types.js';

/**
 * Render annotated HTML to PDF
 * 
 * @param html - HTML string with data-pdf-* and data-media-* annotations
 * @param options - PDF generation options
 * @param context - User context for media access validation
 * @returns PDF result with buffer, filename, and mime type
 */
export async function renderHtmlToPdf(
  html: string,
  options: Partial<PdfOptions>,
  context: ProcessingContext
): Promise<PdfResult> {
  const startTime = Date.now();
  
  // Validate input
  if (!html || typeof html !== 'string') {
    throw new PdfError('HTML content is required', 'INVALID_HTML', 400);
  }
  
  if (html.length > PDF_LIMITS.maxHtmlSize) {
    throw new PdfError(
      `HTML exceeds maximum size of ${PDF_LIMITS.maxHtmlSize / 1024 / 1024}MB`,
      'INVALID_HTML',
      400
    );
  }
  
  // Merge options with defaults
  const opts: Required<PdfOptions> = {
    ...DEFAULT_PDF_OPTIONS,
    ...options,
    margins: { ...DEFAULT_PDF_OPTIONS.margins, ...options?.margins },
    headerFooter: { ...DEFAULT_PDF_OPTIONS.headerFooter, ...options?.headerFooter },
    images: { ...DEFAULT_PDF_OPTIONS.images, ...options?.images },
    bookmarks: { ...DEFAULT_PDF_OPTIONS.bookmarks, ...options?.bookmarks },
  };
  
  console.log(`📄 Starting PDF generation: ${opts.filename}`);
  
  // Parse HTML
  const $ = cheerio.load(html);
  
  // 1. Process flow control (page breaks, hide elements)
  processFlowControl($);
  console.log(`  ✓ Flow control processed`);
  
  // 2. Resolve images (use file:// URLs for PDF render)
  const imageOpts = {
    ...opts.images,
    useFileUrls: true,  // Use file:// URLs for Playwright
    usePlaceholders: false,
  };
  console.log(`  📷 Image options:`, imageOpts);
  const imageResult = await resolveImages($, context, imageOpts);
  if (imageResult.errors.length > 0) {
    console.warn(`  ⚠ Image errors (${imageResult.errors.length}):`, imageResult.errors.slice(0, 5));
  }
  console.log(`  ✓ Images resolved`);
  
  // 3. Extract bookmarks
  const bookmarks = extractBookmarks($, opts.bookmarks);
  console.log(`  ✓ Extracted ${countBookmarks(bookmarks)} bookmarks`);
  
  // 4. Add print-friendly CSS overrides (remove overflow:hidden that breaks pagination)
  $('head').append(`
    <style id="pdf-render-overrides">
      html, body { 
        overflow: visible !important; 
        height: auto !important;
        max-height: none !important;
      }
      * {
        overflow: visible !important;
      }
    </style>
  `);
  
  // 5. Get processed HTML
  const processedHtml = $.html();
  console.log(`  📄 HTML size: ${(processedHtml.length / 1024).toFixed(1)}KB`);
  
  // 6. Check for section markers and split if needed
  const sections = await splitIntoSections(processedHtml, true);
  
  let pdfBuffer: Buffer;
  
  if (sections.length > 1) {
    // Render each section separately and merge
    console.log(`  📑 Rendering ${sections.length} sections...`);
    const sectionPdfs: { name: string; buffer: Buffer }[] = [];
    
    // Debug: save chunks
    const debugDir = path.join(process.cwd(), 'pdf-debug-chunks');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.mkdir(debugDir, { recursive: true });
    
    // Clean ALL old debug files before each run
    try {
      const files = await fs.readdir(debugDir);
      await Promise.all(files.map(f => fs.unlink(path.join(debugDir, f)).catch(() => {})));
      console.log(`  🧹 Cleaned ${files.length} old debug files`);
    } catch (e) { /* ignore cleanup errors */ }
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const safeName = section.name.replace(/[^a-zA-Z0-9]/g, '_');
      
      // Save HTML chunk for debugging
      const htmlFilename = `chunk-${timestamp}-${i + 1}-${safeName}.html`;
      await fs.writeFile(path.join(debugDir, htmlFilename), section.html);
      
      console.log(`    ⏳ Section ${i + 1}/${sections.length}: "${section.name}" (${(section.html.length / 1024).toFixed(1)}KB HTML)...`);
      const sectionPdf = await renderToPdf(section.html, opts);
      sectionPdfs.push({ name: section.name, buffer: sectionPdf });
      console.log(`    ✓ Section ${i + 1} rendered (${(sectionPdf.length / 1024).toFixed(1)}KB PDF)`);
      
      // Save PDF chunk
      const pdfFilename = `chunk-${timestamp}-${i + 1}-${safeName}.pdf`;
      await fs.writeFile(path.join(debugDir, pdfFilename), sectionPdf);
    }
    console.log(`  📂 Debug chunks saved to: ${debugDir}`);
    
    // Merge all section PDFs with bookmarks
    console.log(`  📎 Merging ${sectionPdfs.length} PDFs with bookmarks...`);
    pdfBuffer = await mergePdfsWithBookmarks(sectionPdfs);
    console.log(`  ✓ Merged PDF (${(pdfBuffer.length / 1024).toFixed(1)}KB)`);
  } else {
    // Single section - render directly
    console.log(`  ⏳ Rendering PDF...`);
    pdfBuffer = await renderToPdf(processedHtml, opts);
    console.log(`  ✓ PDF rendered (${(pdfBuffer.length / 1024).toFixed(1)}KB)`);
    
    // For single-section PDFs, inject bookmarks from data-pdf-bookmark annotations
    if (bookmarks.length > 0 && opts.bookmarks.enabled) {
      console.log(`  📑 Injecting ${countBookmarks(bookmarks)} bookmarks from annotations...`);
      pdfBuffer = await injectBookmarks(pdfBuffer, bookmarks);
    }
  }
  // Note: For multi-section PDFs, bookmarks are added during merge (one per section)
  
  // Log output size (removed hard limit - compression TBD)
  const sizeMB = pdfBuffer.length / 1024 / 1024;
  if (sizeMB > 50) {
    console.warn(`  ⚠️ Large PDF: ${sizeMB.toFixed(1)}MB - consider compression`);
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`📄 PDF generation complete: ${opts.filename}.pdf (${elapsed}ms)`);
  
  return {
    buffer: pdfBuffer,
    filename: `${opts.filename}.pdf`,
    mimeType: 'application/pdf',
  };
}

/**
 * Count total bookmarks in tree
 */
function countBookmarks(nodes: { children: any[] }[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countBookmarks(n.children), 0);
}

/**
 * Merge multiple PDFs into one using pdf-lib, with bookmarks for each section
 */
async function mergePdfsWithBookmarks(
  sections: { name: string; buffer: Buffer }[]
): Promise<Buffer> {
  const mergedPdf = await PDFDocument.create();
  
  // Track page indices for bookmarks (need to store index, not ref, during merge)
  const bookmarkInfo: { name: string; pageIndex: number }[] = [];
  let currentPageIndex = 0;
  
  for (const section of sections) {
    const pdf = await PDFDocument.load(section.buffer);
    const pageIndices = pdf.getPageIndices();
    
    // Record bookmark position before adding pages
    bookmarkInfo.push({
      name: section.name,
      pageIndex: currentPageIndex,
    });
    
    // Copy pages
    const pages = await mergedPdf.copyPages(pdf, pageIndices);
    for (const page of pages) {
      mergedPdf.addPage(page);
    }
    
    currentPageIndex += pages.length;
  }
  
  // Create PDF outlines (bookmarks) using pdf-lib low-level API
  if (bookmarkInfo.length > 0) {
    addOutlinesToPdf(mergedPdf, bookmarkInfo);
    console.log(`  📑 Added ${bookmarkInfo.length} bookmarks:`, 
      bookmarkInfo.map(b => b.name).join(', '));
  }
  
  const mergedBytes = await mergedPdf.save();
  return Buffer.from(mergedBytes);
}

/**
 * Add PDF outlines (bookmarks) using low-level pdf-lib API
 * See: https://github.com/Hopding/pdf-lib/issues/127
 */
function addOutlinesToPdf(
  doc: PDFDocument,
  bookmarks: { name: string; pageIndex: number }[]
): void {
  if (bookmarks.length === 0) {
    console.log('    📑 No bookmarks to add');
    return;
  }
  
  const context = doc.context;
  const pages = doc.getPages();
  
  console.log(`    📑 Creating ${bookmarks.length} outline entries for ${pages.length} pages...`);
  
  // Create refs for all outline items
  const outlinesDictRef = context.nextRef();
  const itemRefs: PDFRef[] = bookmarks.map(() => context.nextRef());
  
  // Create each outline item
  let successCount = 0;
  for (let i = 0; i < bookmarks.length; i++) {
    const bookmark = bookmarks[i];
    const page = pages[bookmark.pageIndex];
    
    if (!page) {
      console.warn(`    ⚠️ Bookmark "${bookmark.name}" references invalid page ${bookmark.pageIndex}`);
      continue;
    }
    
    const pageRef = page.ref;
    console.log(`    📑 Bookmark ${i + 1}: "${bookmark.name}" -> page ${bookmark.pageIndex + 1} (ref: ${pageRef})`);
    
    const itemMap = new Map<PDFName, any>();
    itemMap.set(PDFName.of('Title'), PDFHexString.fromText(bookmark.name));
    itemMap.set(PDFName.of('Parent'), outlinesDictRef);
    itemMap.set(PDFName.of('Dest'), context.obj([pageRef, PDFName.of('XYZ'), null, null, null]));
    
    // Link to next/prev items
    if (i > 0) {
      itemMap.set(PDFName.of('Prev'), itemRefs[i - 1]);
    }
    if (i < bookmarks.length - 1) {
      itemMap.set(PDFName.of('Next'), itemRefs[i + 1]);
    }
    
    const itemDict = PDFDict.fromMapWithContext(itemMap, context);
    context.assign(itemRefs[i], itemDict);
    successCount++;
  }
  
  // Create the outlines dictionary
  const outlinesMap = new Map<PDFName, any>();
  outlinesMap.set(PDFName.of('Type'), PDFName.of('Outlines'));
  outlinesMap.set(PDFName.of('First'), itemRefs[0]);
  outlinesMap.set(PDFName.of('Last'), itemRefs[itemRefs.length - 1]);
  outlinesMap.set(PDFName.of('Count'), PDFNumber.of(successCount));
  
  const outlinesDict = PDFDict.fromMapWithContext(outlinesMap, context);
  context.assign(outlinesDictRef, outlinesDict);
  
  // Add outlines to catalog
  doc.catalog.set(PDFName.of('Outlines'), outlinesDictRef);
  
  console.log(`    ✅ Added ${successCount} bookmarks to PDF catalog`);
}

/**
 * Custom error class for PDF generation errors
 */
export class PdfError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PdfError';
  }
}
