import type { BlockNode, PageSlice, TableInfo } from "./types.js";

function isRenderable(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;

  const styles = window.getComputedStyle(element);

  return styles.display !== "none" && styles.visibility !== "hidden";
}

export function collectBlockTree(
  root: HTMLElement,
  shouldAvoidBreak: (element: Element) => boolean,
): BlockNode[] {
  const rootTop = root.getBoundingClientRect().top;

  function build(element: Element): BlockNode | null {
    if (!isRenderable(element)) return null;

    const rect = element.getBoundingClientRect();
    if (rect.height <= 0) return null;

    const node = {
      top: rect.top - rootTop,
      bottom: rect.bottom - rootTop,
    };

    if (
      shouldAvoidBreak(element) ||
      element.tagName === "TR"
    ) {
      return { ...node, children: [], splittable: false };
    }

    const children = Array.from(element.children)
      .map(build)
      .filter((child): child is BlockNode => child !== null);

    return { ...node, children, splittable: children.length > 0 };
  }

  return Array.from(root.children)
    .map(build)
    .filter((child): child is BlockNode => child !== null);
}

export function collectTables(root: HTMLElement): TableInfo[] {
  const rootTop = root.getBoundingClientRect().top;
  const tables: TableInfo[] = [];

  root.querySelectorAll("table").forEach((table) => {
    const thead = table.querySelector(":scope > thead");
    if (!thead || !isRenderable(thead)) return;

    const tableRect = table.getBoundingClientRect();
    const theadRect = thead.getBoundingClientRect();
    if (tableRect.height <= 0 || theadRect.height <= 0) return;

    tables.push({
      top: tableRect.top - rootTop,
      bottom: tableRect.bottom - rootTop,
      theadTop: theadRect.top - rootTop,
      theadBottom: theadRect.bottom - rootTop,
    });
  });

  return tables;
}

function findBreak(
  nodes: BlockNode[],
  start: number,
  limit: number,
  minLead: number,
  minTail: number,
): number {
  let best = start;

  for (const node of nodes) {
    if (node.bottom <= start) continue;
    if (node.top >= limit) break;

    if (node.bottom <= limit) {
      best = node.bottom;
      continue;
    }

    if (node.splittable) {
      const inner = findBreak(node.children, start, limit, minLead, minTail);
      const keptHere = inner - node.top;
      const carriedOver = node.bottom - inner;

      if (inner > best && keptHere >= minLead && carriedOver >= minTail) {
        return inner;
      }
    }

    if (node.top > best) best = node.top;
    break;
  }

  return best;
}

function findHeaderReserve(start: number, tables: TableInfo[]) {
  for (const table of tables) {
    const bodyStart = table.theadBottom;
    if (start > bodyStart && start < table.bottom) {
      return {
        heightPx: table.theadBottom - table.theadTop,
        header: { top: table.theadTop, bottom: table.theadBottom },
      };
    }
  }
  return null;
}

export function computePageSlices(
  tree: BlockNode[],
  contentHeightPx: number,
  totalHeightPx: number,
  minSplitLeadRatio: number,
  minSplitTailRatio: number,
  tables: TableInfo[] = [],
): PageSlice[] {
  if (contentHeightPx <= 0 || totalHeightPx <= 0) return [];

  const minLead = contentHeightPx * minSplitLeadRatio;
  const minTail = contentHeightPx * minSplitTailRatio;
  const slices: PageSlice[] = [];
  let start = 0;

  while (start < totalHeightPx) {
    const reserve = findHeaderReserve(start, tables);
    const usableHeight = contentHeightPx - (reserve?.heightPx ?? 0);
    const limit = start + usableHeight;

    if (limit >= totalHeightPx) {
      slices.push({ start, end: totalHeightPx, header: reserve?.header });
      break;
    }

    let end = findBreak(tree, start, limit, minLead, minTail);

    if (end <= start) end = limit;

    slices.push({ start, end, header: reserve?.header });
    start = end;
  }

  return slices;
}
