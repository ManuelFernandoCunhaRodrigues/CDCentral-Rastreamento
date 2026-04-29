"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const assetRoot = path.join(root, "public", "assets", "images", "cdcentral");

const jobs = [
  {
    input: "veiculo-img.png",
    pngWidth: 768,
    webp: [
      { output: "veiculo-img-480.webp", width: 480, quality: 78 },
      { output: "veiculo-img.webp", width: 768, quality: 80 },
    ],
  },
  {
    input: "frota-img.png",
    pngWidth: 768,
    webp: [
      { output: "frota-img-480.webp", width: 480, quality: 78 },
      { output: "frota-img.webp", width: 768, quality: 80 },
    ],
  },
  {
    input: "tela-cdcentral-br-celular.png",
    pngWidth: 527,
    webp: [
      { output: "tela-cdcentral-br-celular-320.webp", width: 320, quality: 78 },
      { output: "tela-cdcentral-br-celular.webp", width: 527, quality: 80 },
    ],
  },
];

const writeViaTempFile = async (buffer, outputPath) => {
  const tempPath = `${outputPath}.tmp`;
  await fs.promises.writeFile(tempPath, buffer);
  await fs.promises.rename(tempPath, outputPath);
};

const formatSize = (bytes) => `${Math.round(bytes / 1024)} KB`;

(async () => {
  for (const job of jobs) {
    const inputPath = path.join(assetRoot, job.input);
    const originalSize = fs.statSync(inputPath).size;

    for (const output of job.webp) {
      const outputPath = path.join(assetRoot, output.output);
      await sharp(inputPath)
        .resize({ width: output.width, withoutEnlargement: true })
        .webp({ quality: output.quality, effort: 6 })
        .toFile(outputPath);

      console.log(`${output.output}: ${formatSize(fs.statSync(outputPath).size)}`);
    }

    const optimizedPng = await sharp(inputPath)
      .resize({ width: job.pngWidth, withoutEnlargement: true })
      .png({
        adaptiveFiltering: true,
        compressionLevel: 9,
        effort: 10,
        palette: true,
        quality: 90,
      })
      .toBuffer();

    await writeViaTempFile(optimizedPng, inputPath);
    const optimizedSize = fs.statSync(inputPath).size;
    console.log(`${job.input}: ${formatSize(originalSize)} -> ${formatSize(optimizedSize)}`);
  }
})();
