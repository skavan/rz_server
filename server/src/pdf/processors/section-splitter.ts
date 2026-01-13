/**
 * Section Splitter for Large Reports
 * 
 * Splits HTML at data-pdf-section-start markers for chunked rendering.
 */

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';

export interface Section {
  name: string;
  html: string;
}

/**
 * Split HTML into sections based on data-pdf-section-start markers.
 * 
 * Client structure (markers are siblings of content):
 *   <div class="container">
 *     <div data-pdf-section="Living Room" data-pdf-section-start="true"></div>
 *     <div id="location-5"><!-- content --></div>
 *     <div data-pdf-section="Kitchen" data-pdf-section-start="true"></div>
 *     <div id="location-6"><!-- content --></div>
 *   </div>
 */
export async function splitIntoSections(
  html: string,
  saveDebug: boolean = true
): Promise<Section[]> {
  const $ = cheerio.load(html);
  const markers = $('[data-pdf-section-start]').toArray();
  
  // If no markers, return the whole document as one section
  if (markers.length === 0) {
    console.log('📄 No section markers found, rendering as single document');
    return [{ name: 'Document', html }];
  }
  
  console.log(`📄 Found ${markers.length} section markers:`);
  markers.forEach((m, i) => {
    const $m = $(m);
    console.log(`    ${i + 1}. "${$m.attr('data-pdf-section') || 'unnamed'}"`);
  });
  
  // Get the head content to include in each section
  const headContent = $('head').html() || '';
  
  const sections: Section[] = [];
  
  // Check for content BEFORE the first marker (intro/cover section)
  const firstMarker = markers[0];
  let prevSibling = firstMarker.previousSibling;
  const introElements: Element[] = [];
  
  while (prevSibling) {
    if (prevSibling.type === 'tag' || (prevSibling.type === 'text' && (prevSibling as any).data?.trim())) {
      introElements.unshift(prevSibling as Element);
    }
    prevSibling = prevSibling.previousSibling;
  }
  
  if (introElements.length > 0) {
    const introBody = introElements.map(el => $.html(el)).join('\n');
    if (introBody.trim().length > 0) {
      const introHtml = wrapSectionHtml(headContent, introBody);
      sections.push({ name: 'Cover', html: introHtml });
      console.log(`  📑 Section 0: "Cover" (${(introHtml.length / 1024).toFixed(1)}KB, ${introElements.length} elements) - content before first marker`);
    }
  }
  
  // Process each marker - collect it and all following siblings until next marker
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const $marker = $(marker);
    const sectionName = $marker.attr('data-pdf-section') || `Section ${i + 1}`;
    const nextMarker = i + 1 < markers.length ? markers[i + 1] : null;
    
    // Collect elements: the marker itself + all siblings until next marker
    const elements: Element[] = [marker];
    let sibling = marker.nextSibling;
    
    while (sibling) {
      // Stop if we hit the next marker
      if (sibling === nextMarker) break;
      
      // Check if sibling contains the next marker (nested structure)
      if (nextMarker && sibling.type === 'tag') {
        const $sibling = $(sibling);
        if ($sibling.find(nextMarker).length > 0) break;
      }
      
      // Include this sibling
      if (sibling.type === 'tag' || sibling.type === 'text') {
        elements.push(sibling as Element);
      }
      
      sibling = sibling.nextSibling;
    }
    
    // Build section HTML from collected elements
    const sectionBody = elements.map(el => $.html(el)).join('\n');
    const sectionHtml = wrapSectionHtml(headContent, sectionBody);
    
    sections.push({ name: sectionName, html: sectionHtml });
    
    console.log(`  📑 Section ${i + 1}: "${sectionName}" (${(sectionHtml.length / 1024).toFixed(1)}KB, ${elements.length} elements)`);
  }
  
  console.log(`  ✅ Split into ${sections.length} sections total`);
  
  return sections;
}

/**
 * Wrap section body content in a complete HTML document
 */
function wrapSectionHtml(headContent: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html>
<head>
${headContent}
<style>
  /* PDF section overrides - force consistent sizing across all sections */
  html {
    font-size: 16px !important;
  }
  
  html, body { 
    overflow: visible !important; 
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  
  /* Constrain content width to prevent shrink-to-fit */
  body > * {
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
  
  img {
    max-width: 100% !important;
    height: auto !important;
  }
  
  @media print {
    html { font-size: 16px !important; }
  }
</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}
