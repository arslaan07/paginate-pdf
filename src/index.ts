import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { collectBlockTree, collectTables, computePageSlices } from "./block-tree.js";
import {
  inlineImageSources,
  resolveCaptureScale,
  resolvePageFormatMm,
  waitForFonts,
  waitForImages,
} from "./capture.js";
import type {
  PageNumberOptions,
  PageSlice,
  PaginatePdfOptions,
  PaginatePdfResult,
} from "./types.js";

const DEFAULT_AVOID_BREAK_ATTRIBUTE = "data-pdf-avoid-break";

function cropToDataUrl(
  source: HTMLCanvasElement,
  range: { start: number; end: number },
  canvasScale: number,
  background: string,
  imageQuality: number,
) {
  const heightPx = Math.max(
    Math.round((range.end - range.start) * canvasScale),
    1,
  );

  const page = document.createElement("canvas");
  page.width = source.width;
  page.height = heightPx;

  const context = page.getContext("2d");
  if (!context) return null;

  context.fillStyle = background;
  context.fillRect(0, 0, page.width, page.height);
  context.drawImage(
    source,
    0,
    Math.round(range.start * canvasScale),
    source.width,
    heightPx,
    0,
    0,
    source.width,
    heightPx,
  );

  return page.toDataURL("image/jpeg", imageQuality);
}

function resolvePageNumberOptions(
  option: boolean | PageNumberOptions | undefined,
): Required<PageNumberOptions> | null {
  if (!option) return null;

  const withDefaults = option === true ? {} : option;

  return {
    format: withDefaults.format ?? ((page, total) => `${page} / ${total}`),
    position: withDefaults.position ?? "bottom-center",
    fontSize: withDefaults.fontSize ?? 8,
    color: withDefaults.color ?? "#828282",
  };
}

function stampPageNumbers(
  pdf: jsPDF,
  totalPages: number,
  marginMm: number,
  pageNumberOptions: Required<PageNumberOptions>,
) {
  if (totalPages < 2) return;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const y = pageHeight - marginMm / 2;

  const x =
    pageNumberOptions.position === "bottom-left"
      ? marginMm
      : pageNumberOptions.position === "bottom-right"
        ? pageWidth - marginMm
        : pageWidth / 2;

  const align =
    pageNumberOptions.position === "bottom-left"
      ? "left"
      : pageNumberOptions.position === "bottom-right"
        ? "right"
        : "center";

  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(pageNumberOptions.fontSize);
    pdf.setTextColor(pageNumberOptions.color);
    pdf.text(pageNumberOptions.format(page, totalPages), x, y, { align });
  }
}

export async function paginatePdf(
  element: HTMLElement,
  options: PaginatePdfOptions = {},
): Promise<PaginatePdfResult> {
  const {
    filename = "document.pdf",
    format = "a4",
    marginMm = 16,
    scale: preferredScale = 2,
    maxCanvasDimension = 16384,
    imageQuality = 0.92,
    background = "#ffffff",
    border,
    pageNumbers,
    metadata,
    repeatTableHeaders = true,
    avoidBreakAttribute = DEFAULT_AVOID_BREAK_ATTRIBUTE,
    minSplitLeadRatio = 0.08,
    minSplitTailRatio = 0.02,
    inlineCrossOriginImages = true,
    waitForFonts: shouldWaitForFonts = true,
    waitForImages: shouldWaitForImages = true,
    save = true,
    onProgress,
    beforeCapture,
    html2canvasOptions = {},
  } = options;

  onProgress?.({ phase: "preparing" });

  await Promise.all([
    shouldWaitForFonts ? waitForFonts() : Promise.resolve(),
    shouldWaitForImages ? waitForImages(element) : Promise.resolve(),
  ]);

  const inlinedImages = inlineCrossOriginImages
    ? await inlineImageSources(element)
    : new Map<string, string>();

  const elementWidth = element.offsetWidth;
  const elementHeight = element.scrollHeight;
  if (!elementWidth || !elementHeight) {
    throw new Error(
      "paginate-pdf: the element has no rendered size — is it attached to the document and visible?",
    );
  }

  const scale = resolveCaptureScale(
    preferredScale,
    elementWidth,
    elementHeight,
    maxCanvasDimension,
  );

  onProgress?.({ phase: "capturing" });

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: background,
    logging: false,
    ...html2canvasOptions,
    onclone: async (clonedDocument: Document, clonedElement: HTMLElement) => {
      clonedElement.querySelectorAll("img").forEach((image) => {
        const inlined = inlinedImages.get(image.getAttribute("src") ?? "");
        if (inlined) image.setAttribute("src", inlined);

        image.removeAttribute("srcset");
        image.removeAttribute("loading");
      });

      await beforeCapture?.(clonedDocument, clonedElement);
    },
  });

  onProgress?.({ phase: "paginating" });

  const [pageWidthMm, pageHeightMm] = resolvePageFormatMm(format);
  const contentWidthMm = pageWidthMm - marginMm * 2;
  const contentHeightMm = pageHeightMm - marginMm * 2;
  const pxToMm = contentWidthMm / elementWidth;
  const contentHeightPx = contentHeightMm / pxToMm;

  const tree = collectBlockTree(element, (candidate) =>
    candidate.hasAttribute(avoidBreakAttribute),
  );
  const tables = repeatTableHeaders ? collectTables(element) : [];
  const slices: PageSlice[] = computePageSlices(
    tree,
    contentHeightPx,
    elementHeight,
    minSplitLeadRatio,
    minSplitTailRatio,
    tables,
  );

  const pdf = new jsPDF({
    unit: "mm",
    format,
    orientation: "portrait",
    compress: true,
  });

  if (metadata) {
    pdf.setProperties({
      title: metadata.title ?? "",
      author: metadata.author ?? "",
      subject: metadata.subject ?? "",
      keywords: metadata.keywords ?? "",
      creator: metadata.creator ?? "paginate-pdf",
    });
  }

  const canvasScale = canvas.width / elementWidth;
  let hasPage = false;

  if (border) {
    pdf.setDrawColor(border.color);
    pdf.setLineWidth(border.widthMm ?? 0.3);
  }

  slices.forEach((slice, index) => {
    onProgress?.({
      phase: "rendering-page",
      page: index + 1,
      totalPages: slices.length,
    });

    if (hasPage) pdf.addPage();
    hasPage = true;

    let bodyStartMm = marginMm;
    const bodyHeightMm = (slice.end - slice.start) * pxToMm;

    if (slice.header) {
      const headerImage = cropToDataUrl(
        canvas,
        { start: slice.header.top, end: slice.header.bottom },
        canvasScale,
        background,
        imageQuality,
      );
      const headerHeightMm =
        (slice.header.bottom - slice.header.top) * pxToMm;

      if (headerImage) {
        pdf.addImage(
          headerImage,
          "JPEG",
          marginMm,
          marginMm,
          contentWidthMm,
          headerHeightMm,
        );
        if (border) {
          pdf.rect(marginMm, marginMm, contentWidthMm, headerHeightMm);
        }
        bodyStartMm = marginMm + headerHeightMm;
      }
    }

    const pageImage = cropToDataUrl(
      canvas,
      slice,
      canvasScale,
      background,
      imageQuality,
    );
    if (!pageImage) return;

    pdf.addImage(
      pageImage,
      "JPEG",
      marginMm,
      bodyStartMm,
      contentWidthMm,
      bodyHeightMm,
    );

    if (border) {
      pdf.rect(marginMm, bodyStartMm, contentWidthMm, bodyHeightMm);
    }
  });

  if (!hasPage) {
    throw new Error("paginate-pdf: nothing was captured — the element may be empty.");
  }

  const resolvedPageNumbers = resolvePageNumberOptions(pageNumbers);
  if (resolvedPageNumbers) {
    stampPageNumbers(pdf, slices.length, marginMm, resolvedPageNumbers);
  }

  onProgress?.({ phase: "done", totalPages: slices.length });

  if (save) pdf.save(filename);

  return {
    pageCount: slices.length,
    blob: () => pdf.output("blob"),
    save: (name?: string) => pdf.save(name ?? filename),
  };
}

export type {
  BorderOptions,
  PageFormat,
  PageNumberOptions,
  PaginatePdfOptions,
  PaginatePdfResult,
  PaginatePdfStage,
  PdfMetadata,
} from "./types.js";
