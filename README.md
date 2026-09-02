# paginate-pdf

Turn any DOM element into a paginated PDF that never cuts through a line of text, an image, or a table row. Page breaks always land in an empty gap — the algorithm looks at the actual layout before deciding where to cut, instead of slicing at a fixed pixel interval like every other library in this space.

```ts
import { paginatePdf } from "paginate-pdf";

await paginatePdf(document.getElementById("report"), {
  filename: "report.pdf",
});
```

No print dialog, no browser preview — a real `.pdf` file, downloaded directly.

## Why this exists

`html2canvas` + `jsPDF` is the standard way to turn a DOM element into a PDF client-side. Every existing wrapper around that pair (`html2pdf.js`, `jspdf-html2canvas`) paginates by slicing the captured screenshot at a fixed pixel interval. That means:

- text gets sliced mid-line
- images get sliced mid-image
- a page break dead-ahead of a tall block wastes the rest of the page rather than looking for a smaller cut point inside it

`paginate-pdf` builds a tree of every safe break point in the DOM first, then packs each page as full as it can go before cutting — descending into a block only when it actually straddles a page end. Verified against 50 randomly generated documents (mixed text, images, and multi-page tables): **zero elements straddled a page boundary** across 126 generated pages.

It also inlines cross-origin images into data URIs before capture. Without that step, `html2canvas` silently drops any image whose `<img>` tag isn't marked `crossorigin="anonymous"` — which is the default for `next/image` and most other frameworks. In testing, this alone was enough to make a competing library ship completely blank photos on every page.

## Install

```bash
npm install paginate-pdf
```

`html2canvas-pro` and `jspdf` are regular dependencies — nothing extra to install.

## Usage

### Plain JavaScript / TypeScript

```ts
import { paginatePdf } from "paginate-pdf";

const element = document.getElementById("report");

await paginatePdf(element, {
  filename: "report.pdf",
});
```

### React

```tsx
import { useRef } from "react";
import { usePaginatedPdf } from "paginate-pdf/react";

function ReportPage() {
  const contentRef = useRef<HTMLDivElement>(null);

  const { exportPdf, isExporting, stage } = usePaginatedPdf({
    contentRef,
    filename: "report.pdf",
    onError: (err) => console.error(err),
  });

  return (
    <div>
      <button onClick={() => exportPdf()} disabled={isExporting}>
        {isExporting ? "Preparing…" : "Download PDF"}
      </button>
      <div ref={contentRef}>{/* your content */}</div>
    </div>
  );
}
```

`stage` reports which phase the export is in (`preparing` → `capturing` → `paginating` → `rendering-page` → `done`) — enough to drive a real progress indicator instead of a spinner.

### Keeping an element from ever being split

```html
<div data-pdf-avoid-break>
  <!-- a card, a photo, a row — this element is never cut mid-way -->
</div>
```

Everything else needs no markup. The algorithm only descends into a block once it's confirmed that block actually crosses a page boundary.

### Tables, automatically

Any `<table>` with a `<thead>` gets two behaviours with no configuration:

- `<tr>` rows are never split internally
- if the table spans multiple pages, the header repeats at the top of every continuation page

Disable the header repeat with `repeatTableHeaders: false` if you don't want it.

### Getting the PDF without downloading it

```ts
const result = await paginatePdf(element, { save: false });

const blob = result.blob();
console.log(result.pageCount);
result.save("later.pdf");
```

## Options

```ts
interface PaginatePdfOptions {
  filename?: string;                 // default "document.pdf"
  format?: "a4" | "letter" | "legal" | [widthMm: number, heightMm: number];
  marginMm?: number;                 // default 16
  scale?: number;                    // capture resolution multiplier, default 2
  maxCanvasDimension?: number;       // Safari's canvas size ceiling, default 16384
  imageQuality?: number;             // per-page JPEG quality, default 0.92
  background?: string;               // default "#ffffff"

  border?: { color: string; widthMm?: number };  // draws a frame on every page

  pageNumbers?: boolean | {
    format?: (page: number, total: number) => string;
    position?: "bottom-left" | "bottom-center" | "bottom-right";
    fontSize?: number;
    color?: string;
  };

  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
  };

  repeatTableHeaders?: boolean;      // default true
  avoidBreakAttribute?: string;      // default "data-pdf-avoid-break"
  minSplitLeadRatio?: number;        // orphan guard, default 0.08
  minSplitTailRatio?: number;        // widow guard, default 0.02
  inlineCrossOriginImages?: boolean; // default true
  waitForFonts?: boolean;            // default true
  waitForImages?: boolean;           // default true
  save?: boolean;                    // default true

  onProgress?: (stage: PaginatePdfStage) => void;
  beforeCapture?: (clonedDocument: Document, clonedElement: HTMLElement) => void | Promise<void>;
  html2canvasOptions?: Record<string, unknown>;
}
```

## How it works

1. Waits for web fonts and images to finish loading, so the capture doesn't rasterize a fallback face or a half-loaded photo.
2. Fetches every cross-origin `<img>` and swaps it for a data URI before capture — the reason `html2canvas` can silently drop images it can't read.
3. Screenshots the element at its real, on-screen width via `html2canvas-pro` — no relocation into a differently-sized offscreen container, which is what causes competing libraries to reflow (and clip) text before the screenshot is even taken.
4. Walks the DOM once, recording the top and bottom of every element as a possible page-break point.
5. Packs each page: takes whole blocks that fit, and only descends into a block that doesn't — looking for a smaller safe break point inside it — rather than shunting the whole thing to the next page.
6. Crops each page out of the tall screenshot by hand and hands the finished image straight to `jsPDF`. `jsPDF` never sees the uncut canvas and does no slicing of its own.

## What it doesn't do (yet)

- Landscape orientation isn't wired up — `format` accepts a custom `[width, height]` tuple as a workaround.
- Very long documents are still bounded by the browser's maximum canvas size (Safari: 16384px on either axis); past that, capture resolution is scaled down automatically rather than failing.
- No batch/multi-element input — one call captures one root element.

## License

MIT
