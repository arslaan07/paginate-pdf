const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  "kashmir", "gulmarg", "houseboat", "gondola", "pahalgam", "valley", "meadow",
  "trek", "glacier", "saffron", "shikara", "heritage", "itinerary", "transfer",
  "hotel", "cabin", "sunset", "river", "market", "garden", "trail", "peak",
  "cottage", "resort", "sightseeing", "excursion", "reserve", "cuisine",
];

function paragraph(random, minWords, maxWords) {
  const count = minWords + Math.floor(random() * (maxWords - minWords));
  const words = Array.from(
    { length: count },
    () => WORDS[Math.floor(random() * WORDS.length)],
  );
  return words.join(" ") + ".";
}

function card(random, index, { forceAvoidBreak = false } = {}) {
  const avoidBreak = forceAvoidBreak || random() < 0.25;
  const hasImage = random() < 0.6;
  const paraCount = 1 + Math.floor(random() * 3);
  const paras = Array.from({ length: paraCount }, () =>
    `<p>${paragraph(random, 10, 40)}</p>`,
  ).join("");
  const imageHeight = 80 + Math.floor(random() * 220);

  return `
    <div class="card"${avoidBreak ? " data-pdf-avoid-break" : ""}>
      <h3>Day ${index + 1}</h3>
      ${hasImage ? `<img src="${TINY_PNG}" style="width:100%;height:${imageHeight}px;object-fit:cover;display:block;border-radius:6px" />` : ""}
      ${paras}
    </div>
  `;
}

function table(random, index) {
  const rows = 5 + Math.floor(random() * 45);
  const cols = 2 + Math.floor(random() * 3);
  const headerCells = Array.from(
    { length: cols },
    (_, c) => `<th>Column ${c + 1}</th>`,
  ).join("");
  const bodyRows = Array.from({ length: rows }, (_, r) => {
    const cells = Array.from(
      { length: cols },
      () => `<td>${paragraph(random, 2, 6)}</td>`,
    ).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  return `
    <div class="table-block">
      <h3>Table ${index + 1}</h3>
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

export function generateFixture(seed) {
  const random = mulberry32(seed);
  const blockCount = 4 + Math.floor(random() * 10);
  const includeTable = random() < 0.4;
  const tableAt = includeTable ? Math.floor(random() * blockCount) : -1;

  const blocks = [];
  let cardIndex = 0;
  let tableIndex = 0;

  for (let i = 0; i < blockCount; i += 1) {
    if (i === tableAt) {
      blocks.push(table(random, tableIndex));
      tableIndex += 1;
    } else {
      blocks.push(card(random, cardIndex));
      cardIndex += 1;
    }
  }

  const html = `
    <style>
      * { box-sizing: border-box; font-family: -apple-system, sans-serif; }
      body { margin: 0; background: #f5f5f5; }
      .root { width: 900px; padding: 24px; background: #fff; }
      .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
      .card h3 { margin: 0 0 8px; }
      .card p { margin: 4px 0; color: #444; font-size: 13px; line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 12px; text-align: left; }
      thead { background: #eee; }
    </style>
    <div class="root" id="root">
      ${blocks.join("\n")}
    </div>
  `;

  return {
    seed,
    html,
    blockCount,
    hasTable: includeTable,
  };
}
