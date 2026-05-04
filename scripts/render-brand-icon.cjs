const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const pngToIcoModule = require("png-to-ico");
const pngToIco = typeof pngToIcoModule === "function" ? pngToIcoModule : pngToIcoModule.default;

const rootDir = path.resolve(__dirname, "..");
const inputSvg = path.join(rootDir, "src", "assets", "brand-app-icon.svg");
const outDir = path.join(rootDir, "build", "icons");
const outPng = path.join(outDir, "app.png");
const faviconDest = path.join(rootDir, "public", "app-icon.png");

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.dirname(faviconDest), { recursive: true });

  await sharp(inputSvg).resize(256, 256, { fit: "contain" }).png().toFile(outPng);
  fs.copyFileSync(outPng, faviconDest);

  const outIco = path.join(outDir, "app.ico");
  const icoBuffer = await pngToIco(outPng);
  fs.writeFileSync(outIco, icoBuffer);

  console.log(`Rendered icon: ${path.relative(rootDir, outPng)}`);
  console.log(`Rendered icon: ${path.relative(rootDir, outIco)}`);
  console.log(`Copied favicon: ${path.relative(rootDir, faviconDest)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
