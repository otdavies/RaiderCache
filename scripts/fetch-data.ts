import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import sharp from 'sharp';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main';
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const ICONS_DIR = path.join(PUBLIC_DIR, 'assets', 'icons');
const RESIZED_MARKER = path.join(ICONS_DIR, '.resized');

// Ensure directories exist
[PUBLIC_DIR, DATA_DIR, ICONS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

interface DownloadTask {
  url: string;
  dest: string;
  description: string;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        if (response.headers.location) {
          downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        } else {
          reject(new Error('Redirect without location'));
        }
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function resizeImage(filePath: string): Promise<boolean> {
  const tmpPath = filePath + '.tmp';

  try {
    // Check if file is accessible first
    try {
      fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (accessError) {
      console.warn(`  ⚠️  Cannot access file ${path.basename(filePath)} - may be git-LFS placeholder`);
      return false;
    }

    // Read the original image
    const metadata = await sharp(filePath).metadata();

    if (!metadata.width || !metadata.height) {
      console.warn(`  ⚠️  Cannot read dimensions for ${path.basename(filePath)}`);
      return false;
    }

    // Skip if already very small (under 50px on either dimension)
    if (metadata.width < 50 || metadata.height < 50) {
      return true; // Already small enough
    }

    const newWidth = Math.round(metadata.width / 2);
    const newHeight = Math.round(metadata.height / 2);

    // Normalize and resize with multiple fallback strategies
    try {
      // Strategy 1: High-quality resize with format normalization
      await sharp(filePath)
        .resize(newWidth, newHeight, {
          fit: 'fill',
          kernel: 'lanczos3'
        })
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          palette: false // Use full color
        })
        .toColorspace('srgb') // Normalize colorspace
        .withMetadata({ // Strip most metadata but keep orientation
          orientation: metadata.orientation
        })
        .toFile(tmpPath);
    } catch (resizeError) {
      // Strategy 2: Simpler settings if advanced fails
      try {
        await sharp(filePath)
          .resize(newWidth, newHeight, {
            fit: 'inside'
          })
          .png()
          .toColorspace('srgb')
          .toFile(tmpPath);
      } catch (fallbackError) {
        // Strategy 3: Most basic conversion - just normalize format
        try {
          await sharp(filePath)
            .png()
            .toColorspace('srgb')
            .toFile(tmpPath);
          console.warn(`  ⚠️  Could not resize ${path.basename(filePath)}, normalized format only`);
        } catch (finalError) {
          console.warn(`  ⚠️  All strategies failed for ${path.basename(filePath)}`);
          return false;
        }
      }
    }

    // Verify the resized image is valid
    const resizedStats = fs.statSync(tmpPath);
    if (resizedStats.size === 0) {
      fs.unlinkSync(tmpPath);
      console.warn(`  ⚠️  Resized image is empty: ${path.basename(filePath)}`);
      return false;
    }

    // Verify we can read the resized image
    try {
      const verifyMetadata = await sharp(tmpPath).metadata();
      if (!verifyMetadata.width || !verifyMetadata.height) {
        fs.unlinkSync(tmpPath);
        console.warn(`  ⚠️  Resized image is invalid: ${path.basename(filePath)}`);
        return false;
      }

      // Verify it's PNG format
      if (verifyMetadata.format !== 'png') {
        fs.unlinkSync(tmpPath);
        console.warn(`  ⚠️  Image not converted to PNG: ${path.basename(filePath)}`);
        return false;
      }
    } catch (verifyError) {
      fs.unlinkSync(tmpPath);
      console.warn(`  ⚠️  Resized image verification failed: ${path.basename(filePath)}`);
      return false;
    }

    // Replace original with resized version - retry with delay if locked
    let retries = 3;
    while (retries > 0) {
      try {
        fs.unlinkSync(filePath);
        fs.renameSync(tmpPath, filePath);
        return true;
      } catch (unlinkError: any) {
        if (unlinkError.code === 'EBUSY' && retries > 1) {
          // Wait a bit and retry
          await new Promise(resolve => setTimeout(resolve, 100));
          retries--;
        } else {
          throw unlinkError;
        }
      }
    }

    return false;

  } catch (error) {
    // Clean up tmp file if it exists
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {}
    }
    console.warn(`  ⚠️  Resize error for ${path.basename(filePath)}: ${error}`);
    return false;
  }
}

function loadResizedIcons(): Set<string> {
  if (!fs.existsSync(RESIZED_MARKER)) {
    return new Set();
  }
  try {
    const data = fs.readFileSync(RESIZED_MARKER, 'utf-8');
    return new Set(JSON.parse(data));
  } catch {
    return new Set();
  }
}

function saveResizedIcons(resizedIcons: Set<string>): void {
  fs.writeFileSync(RESIZED_MARKER, JSON.stringify(Array.from(resizedIcons), null, 2));
}

async function fetchJSON<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = '';

      if (response.statusCode === 302 || response.statusCode === 301) {
        if (response.headers.location) {
          fetchJSON<T>(response.headers.location).then(resolve).catch(reject);
        } else {
          reject(new Error('Redirect without location'));
        }
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('🚀 Fetching Arc Raiders data from RaidTheory GitHub...\n');

  const tasks: DownloadTask[] = [
    {
      url: `${GITHUB_RAW_BASE}/items.json`,
      dest: path.join(DATA_DIR, 'items.json'),
      description: 'Items database'
    },
    {
      url: `${GITHUB_RAW_BASE}/hideoutModules.json`,
      dest: path.join(DATA_DIR, 'hideoutModules.json'),
      description: 'Hideout modules'
    },
    {
      url: `${GITHUB_RAW_BASE}/quests.json`,
      dest: path.join(DATA_DIR, 'quests.json'),
      description: 'Quests'
    },
    {
      url: `${GITHUB_RAW_BASE}/projects.json`,
      dest: path.join(DATA_DIR, 'projects.json'),
      description: 'Projects'
    }
  ];

  // Download JSON files
  for (const task of tasks) {
    try {
      console.log(`📥 Downloading ${task.description}...`);
      await downloadFile(task.url, task.dest);
      console.log(`✅ ${task.description} downloaded successfully`);
    } catch (error) {
      console.error(`❌ Failed to download ${task.description}:`, error);
    }
  }

  // Download icons
  console.log('\n📥 Downloading item icons...');
  try {
    const itemsData = await fetchJSON<any[]>(`${GITHUB_RAW_BASE}/items.json`);
    const resizedIcons = loadResizedIcons();

    let downloadedIcons = 0;
    let skippedIcons = 0;
    let resizedCount = 0;
    let resizeFailedCount = 0;

    for (const item of itemsData) {
      if (item.imageFilename) {
        let iconUrl: string;
        let filename: string;

        // Handle both URL and relative path formats
        if (item.imageFilename.startsWith('http')) {
          iconUrl = item.imageFilename;
          filename = path.basename(new URL(item.imageFilename).pathname);
        } else {
          iconUrl = `${GITHUB_RAW_BASE}/images/items/${item.imageFilename}`;
          filename = item.imageFilename;
        }

        const iconPath = path.join(ICONS_DIR, filename);

        try {
          // Download if doesn't exist
          if (!fs.existsSync(iconPath)) {
            await downloadFile(iconUrl, iconPath);
            downloadedIcons++;
          } else {
            skippedIcons++;
          }

          // Resize if not already resized
          if (!resizedIcons.has(filename) && fs.existsSync(iconPath)) {
            const resizeSuccess = await resizeImage(iconPath);
            if (resizeSuccess) {
              resizedIcons.add(filename);
              resizedCount++;
            } else {
              resizeFailedCount++;
            }
          }

          // Log progress every 10 icons
          if (downloadedIcons % 10 === 0) {
            console.log(`  Downloaded ${downloadedIcons} icons...`);
          }
        } catch (error) {
          console.warn(`  ⚠️  Failed to download icon: ${filename}`);
        }
      }
    }

    // Save resized icons tracking
    saveResizedIcons(resizedIcons);

    console.log(`✅ Downloaded ${downloadedIcons} new icons (${skippedIcons} already existed)`);
    if (resizedCount > 0) {
      console.log(`📐 Resized ${resizedCount} icons to 50% of original size`);
    }
    if (resizeFailedCount > 0) {
      console.log(`⚠️  ${resizeFailedCount} icons failed to resize (kept original)`);
    }
  } catch (error) {
    console.error('❌ Failed to download icons:', error);
  }

  // Create metadata file
  const metadata = {
    lastUpdated: new Date().toISOString(),
    source: 'https://github.com/RaidTheory/arcraiders-data',
    version: '1.0.0'
  };

  fs.writeFileSync(
    path.join(DATA_DIR, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log('\n✨ Data fetch complete!');
  console.log(`📊 Last updated: ${metadata.lastUpdated}`);
}

main().catch(console.error);
