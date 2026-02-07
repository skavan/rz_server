/**
 * PDF Generation Routes
 * 
 * POST /api/pdf/render - Convert annotated HTML to PDF
 */

import { Router, json } from 'express';
import { authenticateToken } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';
import { renderHtmlToPdf, PdfError, PDF_LIMITS } from '../pdf/index.js';
import type { PdfRenderRequest } from '../pdf/types.js';

const router = Router();

// Increase body limit for PDF routes - HTML payloads can be 500KB-2MB+
router.use(json({ limit: '10mb' }));

/**
 * POST /api/pdf/render
 * 
 * Renders annotated HTML to PDF with embedded images and bookmarks.
 * 
 * Request body:
 * {
 *   html: string,           // HTML with data-pdf-* and data-media-* attributes
 *   options?: {
 *     filename?: string,
 *     format?: 'Letter' | 'Legal' | 'A4' | 'A3',
 *     orientation?: 'portrait' | 'landscape',
 *     margins?: { top?, right?, bottom?, left? },
 *     headerFooter?: { pageNumbers?, ... },
 *     images?: { defaultVariant?, ... },
 *     bookmarks?: { enabled?, ... }
 *   }
 * }
 * 
 * Response: application/pdf binary stream
 */
router.post('/render', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('📄 PDF render request received');
  console.log('📄 User from auth:', (req as any).user);
  
  try {
    // Get user scope for media access validation
    const scope = await getRequestScope(req as any);
    console.log('📄 User scope:', { customerId: scope.customerId, homeIds: scope.homeIds });
    
    // Parse request body
    const body = req.body as PdfRenderRequest;
    
    // Validate HTML exists
    if (!body.html || typeof body.html !== 'string') {
      return res.status(400).json({
        error: 'HTML content is required',
        code: 'INVALID_HTML',
      });
    }
    
    // Check size limit early
    if (body.html.length > PDF_LIMITS.maxHtmlSize) {
      return res.status(400).json({
        error: `HTML exceeds maximum size of ${PDF_LIMITS.maxHtmlSize / 1024 / 1024}MB`,
        code: 'INVALID_HTML',
      });
    }
    
    // Generate PDF
    const result = await renderHtmlToPdf(
      body.html,
      body.options || {},
      {
        customerId: scope.customerId,
        homeIds: scope.homeIds,
      }
    );
    
    // Set response headers
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    
    // Log timing
    const elapsed = Date.now() - startTime;
    console.log(`📄 PDF served: ${result.filename} (${elapsed}ms, ${(result.buffer.length / 1024).toFixed(1)}KB)`);
    
    // Send PDF
    res.send(result.buffer);
    
  } catch (error: any) {
    console.error('PDF generation error:', error);
    
    // Handle known PDF errors
    if (error instanceof PdfError) {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
        details: error.details,
      });
    }
    
    // Handle timeout
    if (error.name === 'TimeoutError') {
      return res.status(504).json({
        error: 'PDF generation timed out',
        code: 'TIMEOUT',
      });
    }
    
    // Generic error
    res.status(500).json({
      error: 'Failed to generate PDF',
      code: 'RENDER_FAILED',
    });
  }
});

/**
 * POST /api/pdf/preview
 * 
 * Returns processed HTML (with embedded images) for preview before PDF generation.
 * Client can display this in an iframe to preview the final layout.
 * 
 * Request body: Same as /render
 * Response: text/html with embedded base64 images
 */
router.post('/preview', authenticateToken, async (req, res) => {
  console.log('📄 PDF preview request received');
  console.log('📄 User from auth:', (req as any).user);
  
  try {
    const scope = await getRequestScope(req as any);
    console.log('📄 Preview scope:', { customerId: scope.customerId, homeIds: scope.homeIds });
    const body = req.body as PdfRenderRequest;
    
    if (!body.html || typeof body.html !== 'string') {
      return res.status(400).json({
        error: 'HTML content is required',
        code: 'INVALID_HTML',
      });
    }
    
    // Import processors
    const cheerio = await import('cheerio');
    const { resolveImages } = await import('../pdf/processors/image-resolver.js');
    const { processFlowControl } = await import('../pdf/processors/flow-handler.js');
    
    const $ = cheerio.load(body.html);
    
    // Process flow control (removes hidden elements, adds CSS)
    processFlowControl($);
    
    // For preview: use placeholders instead of actual images (browser can't load file:// URLs)
    // Just validate images exist, show placeholder SVGs
    const imageResult = await resolveImages($, {
      customerId: scope.customerId,
      homeIds: scope.homeIds,
    }, { 
      defaultVariant: 'thumb',
      skipOnError: true,
      useFileUrls: false,
      usePlaceholders: true,  // Show placeholders instead of actual images for preview
      ...body.options?.images,
    });
    
    if (imageResult.errors.length > 0) {
      console.warn('Preview image errors:', imageResult.errors);
    }
    
    // Add override styles for preview (remove overflow:hidden that may be on html/body)
    $('head').append(`
      <style id="pdf-preview-overrides">
        html, body { 
          overflow: auto !important; 
          height: auto !important;
          max-height: none !important;
        }
      </style>
    `);
    
    // Return processed HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send($.html());
    
  } catch (error: any) {
    console.error('PDF preview error:', error);
    res.status(500).json({
      error: 'Failed to generate preview',
      code: 'PREVIEW_FAILED',
    });
  }
});

/**
 * GET /api/pdf/render
 * 
 * Renders a PDF from a URL (fetches HTML from the URL and converts to PDF).
 * 
 * Query params:
 *   url: string     - URL to fetch HTML from
 *   filename?: string - Output filename (default: 'document')
 *   format?: string   - Paper format: Letter, Legal, A4, A3
 *   orientation?: string - portrait or landscape
 * 
 * Example: /api/pdf/render?url=https://example.com/report&filename=report
 */
router.get('/render', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  const { url, filename, format, orientation } = req.query;
  
  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      error: 'URL query parameter is required',
      code: 'MISSING_URL',
    });
  }
  
  try {
    const scope = await getRequestScope(req as any);
    
    // Fetch HTML from the URL
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(400).json({
        error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
        code: 'FETCH_FAILED',
      });
    }
    
    const html = await response.text();
    
    // Generate PDF
    const result = await renderHtmlToPdf(
      html,
      {
        filename: (filename as string) || 'document',
        format: (format as any) || 'Letter',
        orientation: (orientation as any) || 'portrait',
      },
      {
        customerId: scope.customerId,
        homeIds: scope.homeIds,
      }
    );
    
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    
    const elapsed = Date.now() - startTime;
    console.log(`📄 PDF from URL: ${result.filename} (${elapsed}ms, ${(result.buffer.length / 1024).toFixed(1)}KB)`);
    
    res.send(result.buffer);
    
  } catch (error: any) {
    console.error('PDF render from URL error:', error);
    
    if (error instanceof PdfError) {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }
    
    res.status(500).json({
      error: 'Failed to generate PDF from URL',
      code: 'RENDER_FAILED',
    });
  }
});

/**
 * GET /api/pdf/health
 * 
 * Health check for PDF service
 */
router.get('/health', async (req, res) => {
  res.json({
    status: 'ok',
    service: 'pdf',
    limits: {
      maxHtmlSize: `${PDF_LIMITS.maxHtmlSize / 1024 / 1024}MB`,
      maxImages: PDF_LIMITS.maxImages,
      maxRenderTime: `${PDF_LIMITS.maxRenderTime / 1000}s`,
      maxOutputSize: `${PDF_LIMITS.maxOutputSize / 1024 / 1024}MB`,
    },
  });
});

export default router;
