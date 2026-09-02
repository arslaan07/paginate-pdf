import { useCallback, useState, type RefObject } from "react";
import { paginatePdf } from "./index.js";
import type { PaginatePdfOptions, PaginatePdfStage } from "./types.js";

export interface UsePaginatedPdfOptions extends PaginatePdfOptions {
  contentRef: RefObject<HTMLElement | null>;
  onError?: (error: unknown) => void;
}

export function usePaginatedPdf({
  contentRef,
  onError,
  onProgress,
  ...pdfOptions
}: UsePaginatedPdfOptions) {
  const [isExporting, setIsExporting] = useState(false);
  const [stage, setStage] = useState<PaginatePdfStage | null>(null);

  const exportPdf = useCallback(async () => {
    const element = contentRef.current;
    if (!element || isExporting) return;

    setIsExporting(true);
    setStage(null);

    try {
      await paginatePdf(element, {
        ...pdfOptions,
        onProgress: (nextStage) => {
          setStage(nextStage);
          onProgress?.(nextStage);
        },
      });
    } catch (error) {
      onError?.(error);
    } finally {
      setIsExporting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRef, isExporting, onError, onProgress]);

  return { exportPdf, isExporting, stage };
}
