export type PageFormat = "a4" | "letter" | "legal" | [number, number];

export interface BorderOptions {
  color: string;
  widthMm?: number;
}

export interface PageNumberOptions {
  format?: (page: number, total: number) => string;
  position?: "bottom-left" | "bottom-center" | "bottom-right";
  fontSize?: number;
  color?: string;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
}

export type PaginatePdfStage =
  | { phase: "preparing" }
  | { phase: "capturing" }
  | { phase: "paginating" }
  | { phase: "rendering-page"; page: number; totalPages: number }
  | { phase: "done"; totalPages: number };

export interface PaginatePdfOptions {
  filename?: string;
  format?: PageFormat;
  marginMm?: number;
  scale?: number;
  maxCanvasDimension?: number;
  imageQuality?: number;
  background?: string;
  border?: BorderOptions;
  pageNumbers?: boolean | PageNumberOptions;
  metadata?: PdfMetadata;
  repeatTableHeaders?: boolean;
  avoidBreakAttribute?: string;
  minSplitLeadRatio?: number;
  minSplitTailRatio?: number;
  inlineCrossOriginImages?: boolean;
  waitForFonts?: boolean;
  waitForImages?: boolean;
  save?: boolean;
  onProgress?: (stage: PaginatePdfStage) => void;
  beforeCapture?: (
    clonedDocument: Document,
    clonedElement: HTMLElement,
  ) => void | Promise<void>;
  html2canvasOptions?: Record<string, unknown>;
}

export interface PaginatePdfResult {
  pageCount: number;
  blob(): Blob;
  save(filename?: string): void;
}

export interface BlockNode {
  top: number;
  bottom: number;
  children: BlockNode[];
  splittable: boolean;
}

export interface TableInfo {
  top: number;
  bottom: number;
  theadTop: number;
  theadBottom: number;
}

export interface PageSlice {
  start: number;
  end: number;
  header?: { top: number; bottom: number };
}
