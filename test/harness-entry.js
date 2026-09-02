import { paginatePdf } from "../src/index.ts";
import { collectBlockTree, collectTables, computePageSlices } from "../src/testing.ts";

const MARGIN_MM = 16;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MIN_SPLIT_LEAD_RATIO = 0.08;
const MIN_SPLIT_TAIL_RATIO = 0.02;

function isAtomic(element) {
  return (
    element.hasAttribute("data-pdf-avoid-break") ||
    element.tagName === "TR" ||
    element.children.length === 0
  );
}

function findStraddles(root, slices) {
  const rootTop = root.getBoundingClientRect().top;
  const boundaries = slices.slice(0, -1).map((s) => s.end);
  const straddles = [];

  root.querySelectorAll("*").forEach((el) => {
    if (!isAtomic(el)) return;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return;
    const top = rect.top - rootTop;
    const bottom = rect.bottom - rootTop;

    for (const boundary of boundaries) {
      if (top < boundary - 0.5 && bottom > boundary + 0.5) {
        straddles.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || "").trim().slice(0, 40),
          top: Math.round(top),
          bottom: Math.round(bottom),
          boundary: Math.round(boundary),
        });
        break;
      }
    }
  });

  return straddles;
}

window.runFixture = async function runFixture(html, { includePdfBytes = false } = {}) {
  const host = document.getElementById("fixture-host");
  host.innerHTML = html;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const root = document.getElementById("root");
  if (!root) return { error: "fixture root not found" };

  try {
    const contentWidthMm = PAGE_WIDTH_MM - MARGIN_MM * 2;
    const contentHeightMm = PAGE_HEIGHT_MM - MARGIN_MM * 2;
    const pxToMm = contentWidthMm / root.offsetWidth;
    const contentHeightPx = contentHeightMm / pxToMm;

    const tree = collectBlockTree(root, (el) => el.hasAttribute("data-pdf-avoid-break"));
    const tables = collectTables(root);
    const slices = computePageSlices(
      tree,
      contentHeightPx,
      root.scrollHeight,
      MIN_SPLIT_LEAD_RATIO,
      MIN_SPLIT_TAIL_RATIO,
      tables,
    );

    const straddles = findStraddles(root, slices);
    const headerRepeats = slices.filter((s) => s.header).length;

    const result = await paginatePdf(root, { save: false });
    const blob = result.blob();
    const magic = await blob.slice(0, 5).text();

    let pdfBase64 = null;
    if (includePdfBytes) {
      const buffer = await blob.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      pdfBase64 = btoa(binary);
    }

    return {
      algorithmPageCount: slices.length,
      pdfPageCount: result.pageCount,
      straddleCount: straddles.length,
      straddleSamples: straddles.slice(0, 5),
      headerRepeats,
      tableCount: tables.length,
      blobBytes: blob.size,
      validPdfMagic: magic === "%PDF-",
      pdfBase64,
    };
  } catch (error) {
    return { error: String(error && error.stack ? error.stack : error) };
  }
};

window.__harnessReady = true;
