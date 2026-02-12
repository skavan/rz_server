import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pathToFileURL } from 'url';

const DEFAULT_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'UPS', regex: /\b1Z[0-9A-Z]{16}\b/g },
  { name: 'FedEx-12', regex: /\b\d{12}\b/g },
  { name: 'FedEx-15', regex: /\b\d{15}\b/g },
  { name: 'USPS-20-22', regex: /\b\d{20,22}\b/g },
  { name: 'Amazon-TBA', regex: /\bTBA\d{10,}\b/g },
];

type OutputFormat = 'list' | 'csv' | 'json';

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value = ''] = arg.slice(2).split('=');
      args.set(key, value);
    }
  }
  return args;
}

function getPdfJsUrls() {
  const pdfJsPath = path.resolve('node_modules/pdfjs-dist/build/pdf.min.js');
  const workerPath = path.resolve('node_modules/pdfjs-dist/build/pdf.worker.min.js');
  return {
    pdfJsUrl: pathToFileURL(pdfJsPath).toString(),
    workerUrl: pathToFileURL(workerPath).toString(),
  };
}

async function extractTextWithPlaywright(pdfBytes: Uint8Array): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>', { waitUntil: 'domcontentloaded' });

    const { pdfJsUrl, workerUrl } = getPdfJsUrls();

    await page.addScriptTag({ url: pdfJsUrl });

    return await page.evaluate(
      async ({ bytes, worker }) => {
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = worker;

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        const textPages: string[] = [];

        for (let i = 1; i <= pdf.numPages; i += 1) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str).join(' ');
          textPages.push(strings);
        }

        return textPages;
      },
      { bytes: Array.from(pdfBytes), worker: workerUrl }
    );
  } finally {
    await browser.close();
  }
}

type TrackingRow = { rowNumber: string; trackingNumber: string };

async function extractTrackingColumnWithPlaywright(
  pdfBytes: Uint8Array
): Promise<TrackingRow[]> {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>', { waitUntil: 'domcontentloaded' });

    const { pdfJsUrl, workerUrl } = getPdfJsUrls();

    await page.addScriptTag({ url: pdfJsUrl });

    return await page.evaluate(
      async ({ bytes, worker }) => {
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = worker;

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        const results: Array<{ rowNumber: string; trackingNumber: string }> = [];

        const yTolerance = 2;
        const xPadding = 2;

        for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
          const pdfPage = await pdf.getPage(pageIndex);
          const content = await pdfPage.getTextContent();
          const items = content.items
            .map((item: any) => ({
              text: String(item.str || '').trim(),
              x: item.transform?.[4] ?? 0,
              y: item.transform?.[5] ?? 0,
              width: item.width ?? 0,
            }))
            .filter((item: any) => item.text);

          if (items.length === 0) {
            continue;
          }

          let trackingHeader: any | null = null;
          let trackingNumberHeader: any | null = null;
          let numberHeader: any | null = null;
          let dateHeader: any | null = null;

          for (const item of items) {
            const text = item.text.toLowerCase();
            if (text === 'tracking') {
              trackingHeader = item;
            }
            if (text === 'number') {
              if (!numberHeader || item.x < numberHeader.x) {
                numberHeader = item;
              }
              if (!trackingNumberHeader && trackingHeader && item.x > trackingHeader.x) {
                trackingNumberHeader = item;
              }
            }
            if (text === 'date') {
              dateHeader = item;
            }
          }

          if (!trackingHeader || !trackingNumberHeader) {
            continue;
          }

          const headerY = (trackingHeader.y + trackingNumberHeader.y) / 2;
          const trackingMinX = Math.min(trackingHeader.x, trackingNumberHeader.x) - xPadding;
          const trackingMaxX =
            Math.max(
              trackingHeader.x + trackingHeader.width,
              trackingNumberHeader.x + trackingNumberHeader.width
            ) + xPadding;

          if (!numberHeader) {
            continue;
          }

          const numberMinX = numberHeader.x - xPadding;
          const numberMaxX = dateHeader
            ? dateHeader.x - xPadding
            : numberHeader.x + numberHeader.width + 40;

          const lines: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
          for (const item of items) {
            if (item.y >= headerY - yTolerance) {
              continue;
            }
            let line = lines.find((entry) => Math.abs(entry.y - item.y) <= yTolerance);
            if (!line) {
              line = { y: item.y, items: [] };
              lines.push(line);
            }
            line.items.push({ x: item.x, text: item.text });
          }

          const sortedLines = lines.sort((a, b) => b.y - a.y);
          for (const line of sortedLines) {
            const numberText = line.items
              .filter((entry) => entry.x >= numberMinX && entry.x <= numberMaxX)
              .sort((a, b) => a.x - b.x)
              .map((entry) => entry.text)
              .join(' ')
              .trim();

            const trackingText = line.items
              .filter((entry) => entry.x >= trackingMinX && entry.x <= trackingMaxX)
              .sort((a, b) => a.x - b.x)
              .map((entry) => entry.text)
              .join(' ')
              .trim();

            if (numberText || trackingText) {
              results.push({ rowNumber: numberText, trackingNumber: trackingText });
            }
          }
        }

        return results;
      },
      { bytes: Array.from(pdfBytes), worker: workerUrl }
    );
  } finally {
    await browser.close();
  }
}

function findTrackingNumbers(text: string, customRegex?: RegExp) {
  const matches = new Map<string, Set<string>>();

  const patterns = customRegex
    ? [{ name: 'custom', regex: customRegex }]
    : DEFAULT_PATTERNS;

  for (const { name, regex } of patterns) {
    const seen = new Set<string>();
    const found = text.match(regex) ?? [];
    for (const value of found) {
      seen.add(value);
    }
    matches.set(name, seen);
  }

  return matches;
}

async function main() {
  const [pdfPath] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const args = parseArgs(process.argv.slice(2));
  const output = (args.get('output') || 'list') as OutputFormat;
  const outFile = args.get('out');
  const defaultOutFile = output === 'json' && !outFile ? 'tracker.json' : undefined;

  if (!pdfPath) {
    console.error(
      'Usage: npx tsx scripts/scan-pdf-tracking.ts <path-to-pdf> [--regex=YOUR_REGEX] [--output=list|csv|json] [--out=OUTPUT_PATH]'
    );
    process.exit(1);
  }

  const resolvedPath = path.resolve(pdfPath);
  const pdfBuffer = await fs.readFile(resolvedPath);

  const rows = await extractTrackingColumnWithPlaywright(new Uint8Array(pdfBuffer));
  const deduped = Array.from(
    new Set(rows.map((row) => row.trackingNumber.trim()).filter(Boolean))
  );

  if (output === 'json') {
    const jsonPayload = JSON.stringify(rows.filter((row) => row.trackingNumber), null, 2);
    const target = outFile || defaultOutFile;
    if (target) {
      await fs.writeFile(path.resolve(target), `${jsonPayload}\n`, 'utf8');
      console.log(`Wrote ${target}`);
      return;
    }
    console.log(jsonPayload);
    return;
  }

  if (output === 'csv') {
    console.log('row,tracking_number');
    rows.forEach((row) => {
      console.log(`${JSON.stringify(row.rowNumber)},${JSON.stringify(row.trackingNumber)}`);
    });
    return;
  }

  const regexArg = args.get('regex');
  const customRegex = regexArg ? new RegExp(regexArg, 'g') : undefined;
  const matches = findTrackingNumbers(deduped.join('\n'), customRegex);

  console.log(`PDF: ${resolvedPath}`);
  console.log(`Tracking values: ${deduped.length}`);

  let total = 0;
  for (const [name, values] of matches.entries()) {
    const list = Array.from(values).sort();
    total += list.length;
    console.log(`\n${name} (${list.length})`);
    for (const value of list) {
      console.log(`  - ${value}`);
    }
  }

  if (total === 0) {
    console.log('\nNo tracking numbers found in the tracking column.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
