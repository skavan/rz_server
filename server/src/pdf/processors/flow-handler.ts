/**
 * Flow Control Processor for PDF Generation
 *
 * Converts data-pdf-* attributes to inline CSS styles for paged media.
 */

import type { CheerioAPI } from 'cheerio';

const BREAK_STYLES: Record<string, string> = {
  before: 'page-break-before: always; break-before: page;',
  after: 'page-break-after: always; break-after: page;',
  avoid: 'page-break-inside: avoid; break-inside: avoid;',
  'avoid-before': 'page-break-before: avoid; break-before: avoid;',
  'avoid-after': 'page-break-after: avoid; break-after: avoid;',
};

const FLOW_STYLES: Record<string, string> = {
  'keep-with-next': 'page-break-after: avoid; break-after: avoid;',
  'keep-with-previous': 'page-break-before: avoid; break-before: avoid;',
  'orphans-2': 'orphans: 2;',
  'orphans-3': 'orphans: 3;',
  'widows-2': 'widows: 2;',
  'widows-3': 'widows: 3;',
};

function appendStyle(existingStyle: string | undefined, newStyles: string): string {
  const base = existingStyle?.trim() || '';
  if (!base) return newStyles;
  return base.endsWith(';') ? `${base} ${newStyles}` : `${base}; ${newStyles}`;
}

export function processFlowControl($: CheerioAPI): void {
  $('[data-pdf-hide]').remove();

  $('[data-pdf-break]').each((_, el) => {
    const $el = $(el);
    const value = $el.attr('data-pdf-break');
    if (value && BREAK_STYLES[value]) {
      const currentStyle = $el.attr('style');
      $el.attr('style', appendStyle(currentStyle, BREAK_STYLES[value]));
    }
    $el.removeAttr('data-pdf-break');
  });

  $('[data-pdf-flow]').each((_, el) => {
    const $el = $(el);
    const values = ($el.attr('data-pdf-flow') || '').split(/\s+/).filter(Boolean);
    const styles = values.map((v) => FLOW_STYLES[v]).filter(Boolean);
    if (styles.length > 0) {
      const currentStyle = $el.attr('style');
      $el.attr('style', appendStyle(currentStyle, styles.join(' ')));
    }
    $el.removeAttr('data-pdf-flow');
  });

  $('[data-pdf-table="repeat-header"]').each((_, el) => {
    const $el = $(el);
    const $thead = $el.find('thead');
    if ($thead.length > 0) {
      const currentStyle = $thead.attr('style');
      $thead.attr('style', appendStyle(currentStyle, 'display: table-header-group;'));
    }
    $el.removeAttr('data-pdf-table');
  });
}
