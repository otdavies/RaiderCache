import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

const ICONS_DIR = path.join(process.cwd(), 'public', 'assets', 'icons');
const EXPECTED_WIDTH = 128;
const EXPECTED_HEIGHT = 128;

interface IconInfo {
  filename: string;
  width: number;
  height: number;
  format: string;
  size: number;
}

async function testAllIcons(): Promise<void> {
  console.log('🔍 Testing all icon sizes...\n');

  const iconFiles = fs.readdirSync(ICONS_DIR)
    .filter(f => f.endsWith('.png'))
    .sort();

  console.log(`Found ${iconFiles.length} PNG icons\n`);

  const allIcons: IconInfo[] = [];
  const outliers: IconInfo[] = [];
  const errors: { filename: string; error: string }[] = [];

  for (const filename of iconFiles) {
    const filePath = path.join(ICONS_DIR, filename);

    try {
      const metadata = await sharp(filePath).metadata();
      const stats = fs.statSync(filePath);

      const iconInfo: IconInfo = {
        filename,
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format || 'unknown',
        size: stats.size
      };

      allIcons.push(iconInfo);

      // Check if it's an outlier
      if (iconInfo.width !== EXPECTED_WIDTH || iconInfo.height !== EXPECTED_HEIGHT) {
        outliers.push(iconInfo);
      }

      // Check format
      if (iconInfo.format !== 'png') {
        console.warn(`⚠️  ${filename}: Incorrect format (${iconInfo.format})`);
      }
    } catch (error: any) {
      errors.push({ filename, error: error.message });
    }
  }

  // Report results
  console.log('📊 Results Summary:');
  console.log(`Total icons: ${allIcons.length}`);
  console.log(`Expected size: ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`);
  console.log(`Correct size: ${allIcons.length - outliers.length}`);
  console.log(`Outliers: ${outliers.length}`);
  console.log(`Errors: ${errors.length}\n`);

  // Show outliers
  if (outliers.length > 0) {
    console.log('🚨 OUTLIERS FOUND:\n');
    outliers.forEach(icon => {
      const sizeMB = (icon.size / 1024).toFixed(1);
      console.log(`  ${icon.filename}`);
      console.log(`    Size: ${icon.width}x${icon.height} (Expected: ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT})`);
      console.log(`    Format: ${icon.format}`);
      console.log(`    File size: ${sizeMB}KB\n`);
    });
  }

  // Show errors
  if (errors.length > 0) {
    console.log('❌ ERRORS:\n');
    errors.forEach(({ filename, error }) => {
      console.log(`  ${filename}: ${error}`);
    });
    console.log();
  }

  // Size distribution
  const sizeDistribution = new Map<string, number>();
  allIcons.forEach(icon => {
    const sizeKey = `${icon.width}x${icon.height}`;
    sizeDistribution.set(sizeKey, (sizeDistribution.get(sizeKey) || 0) + 1);
  });

  console.log('📐 Size Distribution:');
  Array.from(sizeDistribution.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([size, count]) => {
      const percentage = ((count / allIcons.length) * 100).toFixed(1);
      console.log(`  ${size}: ${count} icons (${percentage}%)`);
    });

  // Exit with error code if outliers found
  if (outliers.length > 0 || errors.length > 0) {
    console.log('\n❌ Test FAILED: Found outliers or errors');
    process.exit(1);
  } else {
    console.log('\n✅ Test PASSED: All icons are the correct size');
    process.exit(0);
  }
}

testAllIcons().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
