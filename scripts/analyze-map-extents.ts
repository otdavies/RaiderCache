import * as fs from 'fs';
import * as path from 'path';

const mapsDir = path.join(process.cwd(), 'public/assets/maps/tiles');
const maps = ['blue-gate', 'spaceport', 'buried-city', 'dam'];

interface MapExtents {
  map: string;
  maxZoom: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  tilesWide: number;
  tilesHigh: number;
  tileSize: number;
  widthPx: number;
  heightPx: number;
  totalTiles: number;
}

// Known tile sizes from metaforge config
const tileSizes: Record<string, number> = {
  'dam': 256,
  'spaceport': 512,
  'buried-city': 512,
  'blue-gate': 512
};

for (const mapName of maps) {
  const mapPath = path.join(mapsDir, mapName);

  if (!fs.existsSync(mapPath)) {
    console.log(`=== ${mapName} ===`);
    console.log('Map directory not found\n');
    continue;
  }

  // Find max zoom level
  const zoomLevels = fs.readdirSync(mapPath)
    .filter(f => fs.statSync(path.join(mapPath, f)).isDirectory())
    .map(f => parseInt(f))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  if (zoomLevels.length === 0) {
    console.log(`=== ${mapName} ===`);
    console.log('No zoom levels found\n');
    continue;
  }

  const maxZoom = zoomLevels[zoomLevels.length - 1];
  const maxZoomPath = path.join(mapPath, maxZoom.toString());

  // Read all tiles
  const tiles = fs.readdirSync(maxZoomPath)
    .filter(f => f.endsWith('.webp'))
    .map(f => {
      const match = f.match(/^(\d+)_(\d+)\.webp$/);
      if (match) {
        return { x: parseInt(match[1]), y: parseInt(match[2]) };
      }
      return null;
    })
    .filter(t => t !== null) as { x: number; y: number }[];

  if (tiles.length === 0) {
    console.log(`=== ${mapName} ===`);
    console.log('No tiles found\n');
    continue;
  }

  // Calculate extents
  const minX = Math.min(...tiles.map(t => t.x));
  const maxX = Math.max(...tiles.map(t => t.x));
  const minY = Math.min(...tiles.map(t => t.y));
  const maxY = Math.max(...tiles.map(t => t.y));

  const tilesWide = maxX - minX + 1;
  const tilesHigh = maxY - minY + 1;
  const tileSize = tileSizes[mapName] || 256;

  const extents: MapExtents = {
    map: mapName,
    maxZoom,
    minX,
    maxX,
    minY,
    maxY,
    tilesWide,
    tilesHigh,
    tileSize,
    widthPx: tilesWide * tileSize,
    heightPx: tilesHigh * tileSize,
    totalTiles: tiles.length
  };

  console.log(`=== ${mapName.toUpperCase()} ===`);
  console.log(`Max zoom level: ${extents.maxZoom}`);
  console.log(`Tile size: ${extents.tileSize}px`);
  console.log(`X range: ${extents.minX} to ${extents.maxX} (${extents.tilesWide} tiles)`);
  console.log(`Y range: ${extents.minY} to ${extents.maxY} (${extents.tilesHigh} tiles)`);
  console.log(`Map dimensions: ${extents.widthPx}px × ${extents.heightPx}px`);
  console.log(`Total tiles at max zoom: ${extents.totalTiles}`);
  console.log(`World extents: [[0, 0], [${extents.widthPx}, ${extents.heightPx}]]`);
  console.log('');
}
