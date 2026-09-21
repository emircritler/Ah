import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData } from 'canvas';
import agPsd from 'ag-psd';
import aseprite from 'aseprite';

const { readPsd, getCompositeCanvas, getLayerCanvas } = agPsd;
const { parse } = aseprite;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT_DIR, 'assets', 'raw');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'assets');
const COMPOSITE_ATTACK_SOURCE = path.join(ROOT_DIR, 'PNG', 'Sword', 'Without_shadow', 'Sword_attack_without_shadow.png');
const COMPOSITE_ATTACK_OUTPUT = path.join(OUTPUT_DIR, 'sword_attack_atlas.png');
const COMPOSITE_SWORD_SOURCES = [
  ['Sword_Idle_without_shadow.png', 'sword_idle_atlas.png'],
  ['Sword_Walk_without_shadow.png', 'sword_walk_atlas.png'],
  ['Sword_Run_without_shadow.png', 'sword_run_atlas.png']
];
const COMPOSITE_UNARMED_SOURCES = [
  ['Unarmed_Idle_without_shadow.png', 'unarmed_idle_atlas.png'],
  ['Unarmed_Walk_without_shadow.png', 'unarmed_walk_atlas.png'],
  ['Unarmed_Run_without_shadow.png', 'unarmed_run_atlas.png']
];
const ANIMAL_COMPOSITE_SOURCES = [
  ['Fox', 'Fox_Idle.png', 'animal_fox_idle_atlas.png'],
  ['Fox', 'Fox_walk.png', 'animal_fox_walk_atlas.png'],
  ['Fox', 'Fox_Run.png', 'animal_fox_run_atlas.png'],
  ['Fox', 'Fox_Hurt.png', 'animal_fox_hurt_atlas.png'],
  ['Fox', 'Fox_Death.png', 'animal_fox_death_atlas.png'],
  ['Hare', 'Hare_Idle.png', 'animal_hare_idle_atlas.png'],
  ['Hare', 'Hare_Walk.png', 'animal_hare_walk_atlas.png'],
  ['Hare', 'Hare_Run.png', 'animal_hare_run_atlas.png'],
  ['Hare', 'Hare_Hurt.png', 'animal_hare_hurt_atlas.png'],
  ['Hare', 'Hare_Death.png', 'animal_hare_death_atlas.png'],
  ['Deer', 'Deer_Idle.png', 'animal_deer_idle_atlas.png'],
  ['Deer', 'Deer_Walk.png', 'animal_deer_walk_atlas.png'],
  ['Deer', 'Deer_Run.png', 'animal_deer_run_atlas.png'],
  ['Deer', 'Deer_Hurt.png', 'animal_deer_hurt_atlas.png'],
  ['Deer', 'Deer_Death.png', 'animal_deer_death_atlas.png'],
  ['Black_grouse', 'Black_grouse_Idle.png', 'animal_black_grouse_idle_atlas.png'],
  ['Black_grouse', 'Black_grouse_Walk.png', 'animal_black_grouse_walk_atlas.png'],
  ['Black_grouse', 'Black_grouse_Flight.png', 'animal_black_grouse_flight_atlas.png'],
  ['Black_grouse', 'Black_grouse_Hurt.png', 'animal_black_grouse_hurt_atlas.png'],
  ['Black_grouse', 'Black_grouse_Death.png', 'animal_black_grouse_death_atlas.png'],
  ['Boar', 'Boar_Idle.png', 'animal_boar_idle_atlas.png'],
  ['Boar', 'Boar_Walk.png', 'animal_boar_walk_atlas.png'],
  ['Boar', 'Boar_Run.png', 'animal_boar_run_atlas.png'],
  ['Boar', 'Boar_Attack.png', 'animal_boar_attack_atlas.png'],
  ['Boar', 'Boar_Hurt.png', 'animal_boar_hurt_atlas.png'],
  ['Boar', 'Boar_Death.png', 'animal_boar_death_atlas.png']
];

const SUPPORTED_EXTENSIONS = new Set(['.psd', '.ase', '.aseprite']);

function slugifyName(name) {
  return name
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyIfPresent(sourcePath, outputPath) {
  try {
    await fs.copyFile(sourcePath, outputPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function toImageDataFromPixels(pixels, width, height) {
  if (!pixels || !width || !height) {
    return null;
  }

  const buffer = Buffer.isBuffer(pixels)
    ? pixels
    : Uint8Array.from(pixels)
      ? Uint8Array.from(pixels)
      : null;

  if (!buffer) {
    return null;
  }

  return new ImageData(new Uint8ClampedArray(buffer), width, height);
}

async function writePngAndMeta(sheetCanvas, baseName, frameWidth, frameHeight, frameCount) {
  const pngPath = path.join(OUTPUT_DIR, `${baseName}.png`);
  const jsonPath = path.join(OUTPUT_DIR, `${baseName}.json`);

  await ensureDir(OUTPUT_DIR);
  await fs.writeFile(pngPath, sheetCanvas.toBuffer('image/png'));

  const meta = {
    key: baseName,
    image: `${baseName}.png`,
    frameWidth,
    frameHeight,
    frameCount,
    animations: {
      default: {
        frames: Array.from({ length: frameCount }, (_, index) => index),
        frameRate: 12,
        repeat: -1
      }
    }
  };

  await fs.writeFile(jsonPath, JSON.stringify(meta, null, 2));
  return { pngPath, jsonPath, meta };
}

async function createSpriteSheetFromFrames(frames, baseName) {
  if (!frames.length) {
    throw new Error(`No frames available for ${baseName}`);
  }

  const frameWidth = Math.max(...frames.map((frame) => frame.width));
  const frameHeight = Math.max(...frames.map((frame) => frame.height));
  const sheetCanvas = createCanvas(frameWidth * frames.length, frameHeight);
  const context = sheetCanvas.getContext('2d');

  frames.forEach((frameCanvas, index) => {
    context.drawImage(frameCanvas, index * frameWidth, 0);
  });

  await writePngAndMeta(sheetCanvas, baseName, frameWidth, frameHeight, frames.length);
}

async function convertPsdFile(filePath) {
  const fileName = path.basename(filePath, path.extname(filePath));
  const baseName = slugifyName(fileName);
  const buffer = await fs.readFile(filePath);
  const psd = readPsd(buffer);

  const layers = Array.isArray(psd.children)
    ? psd.children
    : Array.isArray(psd.layers)
      ? psd.layers
      : [];

  const frames = [];

  if (layers.length === 0) {
    const composite = getCompositeCanvas(psd);
    if (composite) {
      frames.push(composite);
    }
  } else {
    for (const layer of layers) {
      try {
        const layerCanvas = getLayerCanvas(layer);
        if (!layerCanvas || layerCanvas.width === 0 || layerCanvas.height === 0) {
          continue;
        }
        const canvas = createCanvas(layerCanvas.width, layerCanvas.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(layerCanvas, 0, 0);
        frames.push(canvas);
      } catch (error) {
        console.warn(`Skipping PSD layer for ${fileName}:`, error.message);
      }
    }
  }

  if (frames.length === 0) {
    throw new Error(`No renderable layers found in PSD: ${filePath}`);
  }

  await createSpriteSheetFromFrames(frames, baseName);
  console.log(`Converted PSD -> ${baseName}.png`);
}

async function convertAsepriteFile(filePath) {
  const fileName = path.basename(filePath, path.extname(filePath));
  const baseName = slugifyName(fileName);
  const buffer = await fs.readFile(filePath);
  const data = parse(buffer, { inflate: true, clean: true });

  const frames = [];
  const frameEntries = Array.isArray(data.frames) ? data.frames : [];

  for (const frame of frameEntries) {
    const chunks = Array.isArray(frame.chunks) ? frame.chunks : [];
    const frameWidth = Number(frame.width) || Number(frame.header?.width) || 0;
    const frameHeight = Number(frame.height) || Number(frame.header?.height) || 0;

    const canvas = createCanvas(frameWidth || 64, frameHeight || 64);
    const context = canvas.getContext('2d');

    for (const chunk of chunks) {
      const cel = chunk?.data;
      if (!cel || typeof cel !== 'object') {
        continue;
      }

      const width = Number(cel.width) || Number(cel.w) || 0;
      const height = Number(cel.height) || Number(cel.h) || 0;
      const x = Number(cel.x) || 0;
      const y = Number(cel.y) || 0;
      const pixels = cel.pixels ?? cel.pixelData ?? cel.pixelsCompressed ?? null;

      if (!width || !height || !pixels) {
        continue;
      }

      const imageData = toImageDataFromPixels(pixels, width, height);

      if (imageData) {
        context.putImageData(imageData, x, y);
      }
    }

    if (!canvas.width || !canvas.height) {
      continue;
    }

    frames.push(canvas);
  }

  if (!frames.length) {
    throw new Error(`No frames found in Aseprite file: ${filePath}`);
  }

  await createSpriteSheetFromFrames(frames, baseName);
  console.log(`Converted Aseprite -> ${baseName}.png`);
}

async function processAsset(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.psd') {
    console.warn(`Skipping PSD asset conversion for ${filePath}; project uses Aseprite direction sheets.`);
    return;
  }

  if (ext === '.ase' || ext === '.aseprite') {
    await convertAsepriteFile(filePath);
    return;
  }
}

async function findAssetFiles() {
  const roots = [RAW_DIR, path.join(ROOT_DIR, 'ASEPRITE'), path.join(ROOT_DIR, 'PNG'), path.join(ROOT_DIR, 'PSD')];
  const files = new Map();

  for (const root of roots) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
          const nestedFiles = await findAssetFilesInDir(fullPath);
          for (const file of nestedFiles) {
            files.set(file, file);
          }
        } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          files.set(fullPath, fullPath);
        }
      }
    } catch (error) {
      continue;
    }
  }

  return [...files.keys()].sort();
}

async function findAssetFilesInDir(dirPath) {
  const files = new Map();
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await findAssetFilesInDir(fullPath);
      for (const file of nested) {
        files.set(file, file);
      }
    } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.set(fullPath, fullPath);
    }
  }

  return [...files.keys()];
}

async function main() {
  await ensureDir(RAW_DIR);
  await ensureDir(OUTPUT_DIR);
  await fs.copyFile(COMPOSITE_ATTACK_SOURCE, COMPOSITE_ATTACK_OUTPUT);
  for (const [sourceName, outputName] of COMPOSITE_SWORD_SOURCES) {
    await fs.copyFile(
      path.join(ROOT_DIR, 'PNG', 'Sword', 'Without_shadow', sourceName),
      path.join(OUTPUT_DIR, outputName)
    );
  }
  for (const [sourceName, outputName] of COMPOSITE_UNARMED_SOURCES) {
    await fs.copyFile(
      path.join(ROOT_DIR, 'PNG', 'Unarmed', 'Without_shadow', sourceName),
      path.join(OUTPUT_DIR, outputName)
    );
  }
  for (const [animalName, sourceName, outputName] of ANIMAL_COMPOSITE_SOURCES) {
    await copyIfPresent(
      path.join(RAW_DIR, 'animals', 'PNG', 'Without_shadow', animalName, sourceName),
      path.join(OUTPUT_DIR, outputName)
    );
  }
  await copyIfPresent(
    path.join(RAW_DIR, 'forest', 'Beach Tileset.png'),
    path.join(OUTPUT_DIR, 'forest_tileset.png')
  );

  const files = await findAssetFiles();

  if (files.length === 0) {
    console.log(`No PSD or Aseprite assets found in ${RAW_DIR} or source folders. Nothing to convert.`);
    return;
  }

  for (const file of files) {
    try {
      await processAsset(file);
    } catch (error) {
      console.warn(`Skipping unsupported asset ${file}:`, error.message);
    }
  }
}

main().catch((error) => {
  console.error('Asset conversion failed:', error);
  process.exit(1);
});
