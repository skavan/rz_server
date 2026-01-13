import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';

async function main() {
  const files = fs.readdirSync('pdf-debug-chunks')
    .filter(f => f.endsWith('.pdf'))
    .sort()
    .slice(-7); // Last 7 PDFs
  
  for (const file of files) {
    const pdf = await PDFDocument.load(fs.readFileSync('pdf-debug-chunks/' + file));
    const page = pdf.getPage(0);
    const { width, height } = page.getSize();
    console.log(
      file.replace(/chunk-[^-]+-[^-]+-[^-]+-[^-]+-/, ''),
      ':',
      pdf.getPageCount(),
      'pages,',
      `${width.toFixed(0)}x${height.toFixed(0)}`
    );
  }
}
main();
