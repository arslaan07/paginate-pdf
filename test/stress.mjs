import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import * as esbuild from "esbuild";
import { generateFixture } from "./fixtures.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SAMPLE_COUNT = Number(process.argv[2] ?? 50);
const OUT_DIR = path.join(__dirname, "samples");

const MIME = { ".js": "application/javascript", ".html": "text/html", ".map": "application/json" };

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const filePath = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
      if (!filePath.startsWith(ROOT)) throw new Error("forbidden");
      const body = await readFile(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function bundleHarness() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, "harness-entry.js")],
    outfile: path.join(__dirname, "harness.bundle.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
  });
}

async function main() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  await bundleHarness();
  const server = await startServer();
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });

  page.on("pageerror", (err) => console.error("[pageerror]", err));

  await page.goto(`${baseUrl}/test/harness.html`);
  await page.waitForFunction(() => window.__harnessReady === true);

  const results = [];
  const SAMPLE_PDF_SEEDS = new Set([1, 2, 3]);

  for (let seed = 1; seed <= SAMPLE_COUNT; seed += 1) {
    const fixture = generateFixture(seed);
    const includePdfBytes = SAMPLE_PDF_SEEDS.has(seed);

    const result = await page.evaluate(
      ([html, opts]) => window.runFixture(html, opts),
      [fixture.html, { includePdfBytes }],
    );

    if (result.pdfBase64) {
      const buffer = Buffer.from(result.pdfBase64, "base64");
      await writeFile(path.join(OUT_DIR, `sample-seed-${seed}.pdf`), buffer);
      delete result.pdfBase64;
    }

    results.push({ seed, blocks: fixture.blockCount, hasTable: fixture.hasTable, ...result });

    const status = result.error
      ? "ERROR"
      : result.straddleCount > 0
        ? "STRADDLE"
        : "ok";
    console.log(
      `seed ${String(seed).padStart(2)}  blocks=${String(fixture.blockCount).padStart(2)}` +
        `  table=${fixture.hasTable ? "y" : "n"}` +
        `  pages=${result.pdfPageCount ?? "-"}` +
        `  headerRepeats=${result.headerRepeats ?? "-"}` +
        `  straddles=${result.straddleCount ?? "-"}` +
        `  bytes=${result.blobBytes ?? "-"}` +
        `  [${status}]`,
    );
  }

  await browser.close();
  server.close();

  const errors = results.filter((r) => r.error);
  const straddled = results.filter((r) => r.straddleCount > 0);
  const totalPages = results.reduce((sum, r) => sum + (r.pdfPageCount ?? 0), 0);
  const totalHeaderRepeats = results.reduce((sum, r) => sum + (r.headerRepeats ?? 0), 0);
  const tablesTested = results.filter((r) => r.hasTable).length;

  console.log("\n--- summary ---");
  console.log(`fixtures run:        ${results.length}`);
  console.log(`errors:              ${errors.length}`);
  console.log(`straddling elements: ${straddled.length}`);
  console.log(`fixtures with tables:${tablesTested}`);
  console.log(`table header repeats:${totalHeaderRepeats}`);
  console.log(`total pages generated: ${totalPages}`);
  console.log(`sample PDFs saved to:  ${OUT_DIR}`);

  await writeFile(
    path.join(OUT_DIR, "report.json"),
    JSON.stringify(results, null, 2),
  );

  if (errors.length > 0) {
    console.log("\nERRORS:");
    for (const r of errors) console.log(`  seed ${r.seed}:`, r.error.split("\n")[0]);
  }
  if (straddled.length > 0) {
    console.log("\nSTRADDLES:");
    for (const r of straddled) {
      console.log(`  seed ${r.seed}:`, JSON.stringify(r.straddleSamples));
    }
  }

  process.exit(errors.length > 0 || straddled.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
