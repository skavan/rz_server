/**
 * PDF Generation Types
 * 
 * Defines all interfaces for the declarative PDF generation system.
 */

export interface PdfRenderRequest {
  html: string;
  options?: PdfOptions;
}

export interface PdfOptions {
  filename?: string;
  format?: 'Letter' | 'Legal' | 'A4' | 'A3';
  orientation?: 'portrait' | 'landscape';
  margins?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  headerFooter?: HeaderFooterOptions;
  images?: ImageOptions;
  bookmarks?: BookmarkOptions;
  timeout?: number;
}

export interface HeaderFooterOptions {
  pageNumbers?: boolean;
  pageNumberFormat?: string;
  pageNumberPosition?: 'header' | 'footer';
  headerTemplate?: string;
  footerTemplate?: string;
}

export interface ImageOptions {
  defaultVariant?: 'original' | 'print' | 'web' | 'thumb';
  skipOnError?: boolean;
  errorPlaceholder?: string;
}

export interface BookmarkOptions {
  enabled?: boolean;
  autoFromHeadings?: boolean;
}

export interface PdfResult {
  buffer: Buffer;
  filename: string;
  mimeType: 'application/pdf';
}

export interface BookmarkNode {
  title: string;
  level: number;
  id?: string;
  children: BookmarkNode[];
}

export interface MediaReference {
  elementIndex: number;
  mediaId: number;
  variant: string;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  fallback: 'placeholder' | 'hide' | 'error';
}

export interface ResolvedMedia {
  mediaId: number;
  base64: string;
  mimeType: string;
  error?: string;
}

export interface ProcessingContext {
  customerId: number;
  homeIds: number[];
}

export const DEFAULT_PDF_OPTIONS: Required<PdfOptions> = {
  filename: 'document',
  format: 'Letter',
  orientation: 'portrait',
  margins: {
    top: '0.5in',
    right: '0.5in',
    bottom: '0.5in',
    left: '0.5in',
  },
  headerFooter: {
    pageNumbers: false,
    pageNumberFormat: 'Page {page} of {pages}',
    pageNumberPosition: 'footer',
    headerTemplate: '',
    footerTemplate: '',
  },
  images: {
    defaultVariant: 'print',
    skipOnError: true,
    errorPlaceholder: 'placeholder',
  },
  bookmarks: {
    enabled: true,
    autoFromHeadings: false,
  },
  timeout: 60000,
};

export const PDF_LIMITS = {
  maxHtmlSize: 10 * 1024 * 1024,     // 10MB HTML input
  maxImages: 1000,                     // Support large reports
  maxRenderTime: 300000,               // 5 minutes for large reports
  maxOutputSize: 200 * 1024 * 1024,    // 200MB PDF output
};
