import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

async function checkTileDimensions() {
  const tiles = [
    { map: 'dam', path: 'public/assets/maps/tiles/dam/3/3_2.webp', expected: 256 },
    { map: 'spaceport', path: 'public/assets/maps/tiles/spaceport/3/1_1.webp', expected: 512 },
    { map: 'buried-city', path: 'public/assets/maps/tiles/buried-city/3/3_2.webp', expected: 512 },
    { map: 'blue-gate', path: 'public/assets/maps/tiles/blue-gate/3/3_2.webp', expected: 512 }
  ];

  console.log('Checking actual tile dimensions vs configured values:\n');

  for (const tile of tiles) {
    if (!fs.existsSync(tile.path)) {
      console.log(`${tile.map}: FILE NOT FOUND at ${tile.path}`);
      console.log('  Looking for alternative tiles...');

      // Try to find any tile in the map's directory
      const mapDir = path.dirname(path.dirname(tile.path));
      if (fs.existsSync(mapDir)) {
        const zoomDirs = fs.readdirSync(mapDir).filter(d => !isNaN(Number(d)));
        for (const zoomDir of zoomDirs) {
          const zoomPath = path.join(mapDir, zoomDir);
          const files = fs.readdirSync(zoomPath).filter(f => f.endsWith('.webp'));
          if (files.length > 0) {
            const altPath = path.join(zoomPath, files[0]);
            console.log(`  Found alternative: ${altPath}`);
            const metadata = await sharp(altPath).metadata();
            console.log(`  Actual: ${metadata.width}x${metadata.height}`);
            console.log(`  Expected: ${tile.expected}x${tile.expected}`);
            console.log(`  Match: ${metadata.width === tile.expected && metadata.height === tile.expected ? '✓' : '✗'}`);
            if (metadata.width !== tile.expected || metadata.height !== tile.expected) {
              const scaleRatio = metadata.width! / tile.expected;
              console.log(`  Scale ratio: ${scaleRatio.toFixed(4)} (actual/expected)`);
            }
            break;
          }
        }
      }
      console.log('');
      continue;
    }

    const metadata = await sharp(tile.path).metadata();
    console.log(`${tile.map}:`);
    console.log(`  Path: ${tile.path}`);
    console.log(`  Actual: ${metadata.width}x${metadata.height}`);
    console.log(`  Expected: ${tile.expected}x${tile.expected}`);
    console.log(`  Match: ${metadata.width === tile.expected && metadata.height === tile.expected ? '✓' : '✗'}`);
    if (metadata.width !== tile.expected || metadata.height !== tile.expected) {
      const scaleRatio = metadata.width! / tile.expected;
      console.log(`  Scale ratio: ${scaleRatio.toFixed(4)} (actual/expected)`);
    }
    console.log('');
  }
}

checkTileDimensions().catch(console.error);
