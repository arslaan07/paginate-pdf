import type { PageFormat } from "./types.js";

const PAGE_FORMATS_MM: Record<Exclude<PageFormat, [number, number]>, [number, number]> = {
  a4: [210, 297],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
};

export function resolvePageFormatMm(format: PageFormat): [number, number] {
  return Array.isArray(format) ? format : PAGE_FORMATS_MM[format];
}

export async function waitForFonts() {
  if (typeof document === "undefined" || !document.fonts) return;

  try {
    await document.fonts.ready;
  } catch {
    /* empty */
  }
}

export async function waitForImages(root: HTMLElement) {
  const pending = Array.from(root.querySelectorAll("img")).map(
    async (image) => {
      if (image.complete && image.naturalWidth > 0) return;

      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    },
  );

  await Promise.all(pending);
}

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function inlineImageSources(root: HTMLElement) {
  const sources = Array.from(root.querySelectorAll("img"))
    .map((image) => image.getAttribute("src"))
    .filter((source): source is string => Boolean(source))
    .filter((source) => !source.startsWith("data:"));

  const uniqueSources = Array.from(new Set(sources));

  const entries = await Promise.all(
    uniqueSources.map(async (source) => {
      try {
        const response = await fetch(source, {
          mode: "cors",
          credentials: "omit",
        });
        if (!response.ok) return null;

        return [source, await readAsDataUrl(await response.blob())] as const;
      } catch {
        return null;
      }
    }),
  );

  return new Map(
    entries.filter((entry): entry is [string, string] => entry !== null),
  );
}

export function resolveCaptureScale(
  preferredScale: number,
  widthPx: number,
  heightPx: number,
  maxCanvasDimension: number,
) {
  const scale = Math.min(
    preferredScale,
    maxCanvasDimension / Math.max(widthPx, 1),
    maxCanvasDimension / Math.max(heightPx, 1),
  );

  return Math.max(scale, 1);
}
