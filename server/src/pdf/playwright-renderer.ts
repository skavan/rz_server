/**
 * Playwright-based PDF Renderer
 *
 * Maintains a browser pool for efficient PDF generation.
 */

import { chromium, Browser, BrowserContext } from 'playwright';
import { PdfOptions, DEFAULT_PDF_OPTIONS, PDF_LIMITS } from './types';

interface PooledBrowser {
  browser: Browser;
  inUse: boolean;
}

let browserPool: PooledBrowser[] = [];
let poolInitialized = false;

const PAGE_SIZES: Record<string, { width: string; height: string }> = {
  Letter: { width: '8.5in', height: '11in' },
  Legal: { width: '8.5in', height: '14in' },
  A4: { width: '210mm', height: '297mm' },
  A3: { width: '297mm', height: '420mm' },
};

export async function initBrowserPool(poolSize: number = 2): Promise<void> {
  if (poolInitialized) {
    return;
  }

  for (let i = 0; i < poolSize; i++) {
    const browser = await chromium.launch({
      headless: true,
    });
    browserPool.push({ browser, inUse: false });
  }

  poolInitialized = true;
}

async function acquireBrowser(): Promise<PooledBrowser> {
  if (!poolInitialized || browserPool.length === 0) {
    await initBrowserPool();
  }

  let available = browserPool.find((b) => !b.inUse);

  if (!available) {
    const browser = await chromium.launch({ headless: true });
    available = { browser, inUse: false };
    browserPool.push(available);
  }

  available.inUse = true;
  return available;
}

function releaseBrowser(pooled: PooledBrowser): void {
  pooled.inUse = false;
}

function buildHeaderTemplate(options: PdfOptions): string {
  const hf = options.headerFooter;
  if (!hf) return '';

  if (hf.headerTemplate) {
    return hf.headerTemplate;
  }

  if (hf.pageNumbers && hf.pageNumberPosition === 'header') {
    const format = hf.pageNumberFormat || 'Page {page} of {pages}';
    return buildPageNumberTemplate(format);
  }

  return '';
}

function buildFooterTemplate(options: PdfOptions): string {
  const hf = options.headerFooter;
  if (!hf) return '';

  if (hf.footerTemplate) {
    return hf.footerTemplate;
  }

  if (hf.pageNumbers && hf.pageNumberPosition !== 'header') {
    const format = hf.pageNumberFormat || 'Page {page} of {pages}';
    return buildPageNumberTemplate(format);
  }

  return '';
}

function buildPageNumberTemplate(format: string): string {
  const inner = format
    .replace('{page}', '<span class="pageNumber"></span>')
    .replace('{pages}', '<span class="totalPages"></span>');

  return `<div style="font-size: 10px; width: 100%; text-align: center; padding: 5px 0;">${inner}</div>`;
}

export async function renderToPdf(
  html: string,
  options: PdfOptions = {}
): Promise<Buffer> {
  const opts = {
    ...DEFAULT_PDF_OPTIONS,
    ...options,
    margins: { ...DEFAULT_PDF_OPTIONS.margins, ...options.margins },
    headerFooter: {
      ...DEFAULT_PDF_OPTIONS.headerFooter,
      ...options.headerFooter,
    },
  };

  const timeout = opts.timeout ?? PDF_LIMITS.maxRenderTime;
  const format = opts.format || 'Letter';
  const orientation = opts.orientation || 'portrait';
  const pageSize = PAGE_SIZES[format] || PAGE_SIZES.Letter;

  let width = pageSize.width;
  let height = pageSize.height;
  if (orientation === 'landscape') {
    [width, height] = [height, width];
  }

  const headerTemplate = buildHeaderTemplate(opts);
  const footerTemplate = buildFooterTemplate(opts);
  const displayHeaderFooter = !!(headerTemplate || footerTemplate);

  const pooled = await acquireBrowser();
  let context: BrowserContext | null = null;

  // Write HTML to temp file so Playwright can load file:// images
  const fs = await import('fs/promises');
  const os = await import('os');
  const path = await import('path');
  
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `pdf-render-${Date.now()}.html`);
  await fs.writeFile(tempFile, html, 'utf8');
  
  // Debug: count file:// URLs in HTML
  const fileUrlCount = (html.match(/file:\/\/\//g) || []).length;
  console.log(`📄 Temp HTML file: ${tempFile}`);
  console.log(`📄 File URLs in HTML: ${fileUrlCount}`);
  
  try {
    context = await pooled.browser.newContext();
    const page = await context.newPage();
    
    // Set viewport to match typical screen width
    await page.setViewportSize({ width: 1280, height: 900 });
    
    // Emulate print media so @media print CSS rules apply
    await page.emulateMedia({ media: 'print' });
    
    // Navigate to the temp file (allows file:// image loading)
    await page.goto(`file:///${tempFile.replace(/\\/g, '/')}`, {
      waitUntil: 'networkidle',
      timeout,
    });
    
    // Wait for all images to load
    console.log(`📄 Page loaded, waiting for images...`);
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve; // Don't block on failed images
          });
        })
      );
    });
    
    console.log(`📄 All images loaded, generating PDF...`);

    const pdfBuffer = await page.pdf({
      width,
      height,
      scale: 1,
      preferCSSPageSize: false, // Use our explicit width/height, not CSS @page
      margin: {
        top: opts.margins.top,
        right: opts.margins.right,
        bottom: opts.margins.bottom,
        left: opts.margins.left,
      },
      displayHeaderFooter,
      headerTemplate: headerTemplate || '<span></span>',
      footerTemplate: footerTemplate || '<span></span>',
      printBackground: true,
    });

    // Clean up temp file
    await fs.unlink(tempFile).catch(() => {});
    
    return Buffer.from(pdfBuffer);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    releaseBrowser(pooled);
    // Also try to clean up temp file in case of error
    await fs.unlink(tempFile).catch(() => {});
  }
}

export async function closeBrowserPool(): Promise<void> {
  const closingPromises = browserPool.map(async (pooled) => {
    try {
      await pooled.browser.close();
    } catch {
      // Ignore errors during cleanup
    }
  });

  await Promise.all(closingPromises);
  browserPool = [];
  poolInitialized = false;
}
