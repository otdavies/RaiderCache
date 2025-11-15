import * as fs from 'fs';
import * as path from 'path';

const TILES_DIR = path.join(process.cwd(), 'public', 'assets', 'maps', 'tiles');

// Maps that need reorganization (from nested to flat structure)
const mapsToReorganize = ['spaceport', 'buried-city', 'blue-gate'];

for (const mapName of mapsToReorganize) {
  console.log(`\n📁 Reorganizing ${mapName}...`);
  const mapDir = path.join(TILES_DIR, mapName);

  if (!fs.existsSync(mapDir)) {
    console.log(`  ⚠️  ${mapName} directory not found, skipping`);
    continue;
  }

  let movedCount = 0;
  let removedDirs = 0;

  // Process each zoom level
  const zoomLevels = fs.readdirSync(mapDir).filter(f => {
    const stat = fs.statSync(path.join(mapDir, f));
    return stat.isDirectory() && !isNaN(parseInt(f));
  });

  for (const zoomLevel of zoomLevels) {
    const zoomDir = path.join(mapDir, zoomLevel);

    // Get all x subdirectories
    const xDirs = fs.readdirSync(zoomDir).filter(f => {
      const stat = fs.statSync(path.join(zoomDir, f));
      return stat.isDirectory() && !isNaN(parseInt(f));
    });

    // Move files from nested structure to flat structure
    for (const xDir of xDirs) {
      const xDirPath = path.join(zoomDir, xDir);
      const yFiles = fs.readdirSync(xDirPath).filter(f => f.endsWith('.webp'));

      for (const yFile of yFiles) {
        const y = yFile.replace('.webp', '');
        const oldPath = path.join(xDirPath, yFile);
        const newFilename = `${xDir}_${y}.webp`;
        const newPath = path.join(zoomDir, newFilename);

        // Move file
        fs.renameSync(oldPath, newPath);
        movedCount++;
      }

      // Remove empty x directory
      fs.rmdirSync(xDirPath);
      removedDirs++;
    }
  }

  console.log(`  ✅ ${mapName}: Moved ${movedCount} files, removed ${removedDirs} directories`);
}

console.log('\n✨ Tile reorganization complete!');
