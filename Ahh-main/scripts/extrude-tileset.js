import fs from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage } from 'canvas';

const [, , inputPath, outputPath, tileSizeArg = '32', marginArg = '1'] = process.argv;
const tileSize = Number(tileSizeArg);
const margin = Number(marginArg);

if (!inputPath || !outputPath || !Number.isInteger(tileSize) || tileSize <= 0 || !Number.isInteger(margin) || margin < 1) {
  console.error('Usage: node scripts/extrude-tileset.js <input.png> <output.png> [tileSize=32] [margin=1]');
  process.exit(1);
}

const image = await loadImage(inputPath);
if (image.width % tileSize !== 0 || image.height % tileSize !== 0) {
  throw new Error(`Image dimensions ${image.width}x${image.height} are not divisible by tile size ${tileSize}`);
}

const columns = image.width / tileSize;
const rows = image.height / tileSize;
const outputTileSize = tileSize + margin * 2;
const canvas = createCanvas(columns * outputTileSize, rows * outputTileSize);
const context = canvas.getContext('2d');
context.imageSmoothingEnabled = false;

for (let row = 0; row < rows; row += 1) {
  for (let column = 0; column < columns; column += 1) {
    const sourceX = column * tileSize;
    const sourceY = row * tileSize;
    const outputX = column * outputTileSize;
    const outputY = row * outputTileSize;
    const innerX = outputX + margin;
    const innerY = outputY + margin;

    context.drawImage(image, sourceX, sourceY, tileSize, tileSize, innerX, innerY, tileSize, tileSize);

    context.drawImage(image, sourceX, sourceY, 1, tileSize, outputX, innerY, margin, tileSize);
    context.drawImage(image, sourceX + tileSize - 1, sourceY, 1, tileSize, innerX + tileSize, innerY, margin, tileSize);
    context.drawImage(image, sourceX, sourceY, tileSize, 1, innerX, outputY, tileSize, margin);
    context.drawImage(image, sourceX, sourceY + tileSize - 1, tileSize, 1, innerX, innerY + tileSize, tileSize, margin);

    context.drawImage(image, sourceX, sourceY, 1, 1, outputX, outputY, margin, margin);
    context.drawImage(image, sourceX + tileSize - 1, sourceY, 1, 1, innerX + tileSize, outputY, margin, margin);
    context.drawImage(image, sourceX, sourceY + tileSize - 1, 1, 1, outputX, innerY + tileSize, margin, margin);
    context.drawImage(image, sourceX + tileSize - 1, sourceY + tileSize - 1, 1, 1, innerX + tileSize, innerY + tileSize, margin, margin);
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, canvas.toBuffer('image/png'));
console.log(`Extruded ${columns}x${rows} tiles: ${inputPath} -> ${outputPath}`);
console.log(`Tile size: ${tileSize}px, margin: ${margin}px, output: ${canvas.width}x${canvas.height}px`);
