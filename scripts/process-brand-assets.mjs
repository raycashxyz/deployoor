#!/usr/bin/env node
/**
 * Process brand source folders into standard web formats.
 * Run: pnpm brand:assets
 */
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "assets/brand/source");
const publicDir = join(root, "apps/docs/public");
const distDir = join(root, "assets/brand/dist");

const FOLDERS = {
  favicon: "Favicon",
  logo: "Logo",
  og: "OG Image",
  x: "X post",
};

async function exists(path) {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

async function listMedia(dir) {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => join(dir, e.name))
    .filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f));
}

function pickByName(files, pattern) {
  const re = new RegExp(pattern, "i");
  return files.find((f) => re.test(basename(f))) ?? null;
}

async function pickLargestRaster(files) {
  const rasters = files.filter((f) => !f.toLowerCase().endsWith(".svg"));
  if (rasters.length === 0) return null;

  let best = rasters[0];
  let bestArea = 0;
  for (const file of rasters) {
    const meta = await sharp(file).metadata();
    const area = (meta.width ?? 0) * (meta.height ?? 0);
    if (area > bestArea) {
      bestArea = area;
      best = file;
    }
  }
  return best;
}

async function copyText(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
}

async function copyPng(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  const ext = extname(src).toLowerCase();
  if (ext === ".png") {
    await copyFile(src, dest);
  } else {
    await sharp(src).png().toFile(dest);
  }
}

async function rasterizeSvg(svgPath, size = 512) {
  return sharp(svgPath).resize(size, size).png().toBuffer();
}

async function writePngSizes(buffer) {
  const sizes = [16, 32, 180, 192, 512];
  const out = {};
  for (const size of sizes) {
    out[size] = await sharp(buffer)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  await writeFile(join(publicDir, "favicon-16x16.png"), out[16]);
  await writeFile(join(publicDir, "favicon-32x32.png"), out[32]);
  await writeFile(join(publicDir, "apple-touch-icon.png"), out[180]);
  await writeFile(join(publicDir, "icon-192.png"), out[192]);
  await writeFile(join(publicDir, "icon-512.png"), out[512]);

  const ico = await pngToIco([out[16], out[32]]);
  await writeFile(join(publicDir, "favicon.ico"), ico);
}

async function processFavicons(files) {
  const lightSvg = pickByName(files, "21\\.svg|light");
  const darkSvg = pickByName(files, "20\\.svg|dark");
  const lightPng = pickByName(files, "light\\.png");
  const darkPng = pickByName(files, "dark\\.png");

  const primarySvg = lightSvg ?? darkSvg ?? files.find((f) => f.endsWith(".svg"));
  if (primarySvg) {
    await copyText(primarySvg, join(publicDir, "favicon.svg"));
    await writePngSizes(await rasterizeSvg(primarySvg));
  } else if (lightPng ?? darkPng) {
    await writePngSizes(await sharp(lightPng ?? darkPng).png().toBuffer());
  }

  if (darkSvg) await copyText(darkSvg, join(publicDir, "favicon-dark.svg"));
  if (lightSvg && lightSvg !== primarySvg) await copyText(lightSvg, join(publicDir, "favicon-light.svg"));
}

async function makeDarkWordmark(src, dest) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const lum = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    if (lum > 200) {
      pixels[i + 3] = 0;
    } else {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = 255;
    }
  }
  await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(dest);
}

async function processLogos(files) {
  const primary = pickByName(files, "primary");
  const wordmark = pickByName(files, "word");
  const symbol = pickByName(files, "symbol|mark");

  const logoLight = primary ?? wordmark ?? (await pickLargestRaster(files));

  if (!logoLight) return;

  await copyPng(logoLight, join(publicDir, "logo-light.png"));
  await copyPng(logoLight, join(distDir, "logo-light.png"));

  if (wordmark) {
    await makeDarkWordmark(wordmark, join(publicDir, "logo-dark.png"));
    await makeDarkWordmark(wordmark, join(distDir, "logo-dark.png"));
  } else {
    await copyPng(logoLight, join(publicDir, "logo-dark.png"));
    await copyPng(logoLight, join(distDir, "logo-dark.png"));
  }

  if (symbol) {
    await copyPng(symbol, join(publicDir, "logo-symbol.png"));
  }
}

async function resizeOg(src, dest, width, height) {
  await mkdir(dirname(dest), { recursive: true });
  await sharp(src).resize(width, height, { fit: "cover" }).png().toFile(dest);
}

async function writeManifest() {
  const manifest = {
    name: "deployoor",
    short_name: "deployoor",
    description: "Quality-of-life for smart contract teams.",
    start_url: "/",
    display: "standalone",
    background_color: "#BEF4BE",
    theme_color: "#111513",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
  await writeFile(join(publicDir, "site.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  await mkdir(publicDir, { recursive: true });
  await mkdir(distDir, { recursive: true });

  const faviconFiles = await listMedia(join(sourceRoot, FOLDERS.favicon));
  const logoFiles = await listMedia(join(sourceRoot, FOLDERS.logo));
  const ogFiles = await listMedia(join(sourceRoot, FOLDERS.og));
  const xFiles = await listMedia(join(sourceRoot, FOLDERS.x));

  if (faviconFiles.length === 0) {
    console.error(
      "\nNo favicon assets in assets/brand/source/Favicon/\nSee assets/brand/README.md\n",
    );
    process.exit(1);
  }

  console.log("Favicon files:", faviconFiles.map((f) => basename(f)).join(", "));
  await processFavicons(faviconFiles);
  await processLogos(logoFiles);

  const ogLight = pickByName(ogFiles, "light") ?? (await pickLargestRaster(ogFiles));
  const ogDark = pickByName(ogFiles, "dark") ?? ogLight;
  const xCard = (await pickLargestRaster(xFiles)) ?? ogLight;

  if (ogLight) {
    console.log("OG (light):", basename(ogLight));
    await resizeOg(ogLight, join(publicDir, "og.png"), 1200, 630);
    await copyText(join(publicDir, "og.png"), join(distDir, "og.png"));
  }
  if (ogDark && ogDark !== ogLight) {
    console.log("OG (dark):", basename(ogDark));
    await resizeOg(ogDark, join(publicDir, "og-dark.png"), 1200, 630);
  }
  if (xCard) {
    console.log("X card:", basename(xCard));
    await resizeOg(xCard, join(publicDir, "x-card.png"), 1200, 675);
    await copyText(join(publicDir, "x-card.png"), join(distDir, "x-card.png"));
  }

  await writeManifest();
  console.log("\nDone → apps/docs/public/ (+ assets/brand/dist/)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
