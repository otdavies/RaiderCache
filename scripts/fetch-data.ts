import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import sharp from 'sharp';

const METAFORGE_API_BASE = 'https://metaforge.app/api/arc-raiders';
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const STATIC_DATA_DIR = path.join(DATA_DIR, 'static');
const ICONS_DIR = path.join(PUBLIC_DIR, 'assets', 'icons');
const RESIZED_MARKER = path.join(ICONS_DIR, '.resized');

// Ensure directories exist
[PUBLIC_DIR, DATA_DIR, STATIC_DATA_DIR, ICONS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

interface MetaForgeItem {
  id: string;
  name: string;
  description?: string;
  item_type: string;
  rarity: string;
  value: number;
  stat_block: {
    weight?: number;
    stackSize?: number;
    [key: string]: any;
  };
  icon?: string;
  loot_area?: string | null;
  workbench?: string;
  updated_at?: string;
  [key: string]: any;
}

interface MetaForgeQuest {
  id: string;
  name: string;
  objectives?: string[];
  required_items?: any[];
  rewards?: any;
  trader?: string;
  xp?: number;
  [key: string]: any;
}

interface MetaForgePaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
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

async function convertWebPToPNG(webpUrl: string, outputPath: string): Promise<boolean> {
  const tmpWebP = outputPath + '.tmp.webp';

  try {
    // Download WebP
    await downloadFile(webpUrl, tmpWebP);

    // Convert to PNG with resize
    await sharp(tmpWebP)
      .resize(128, 128, {
        fit: 'fill',
        kernel: 'lanczos3'
      })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true
      })
      .toColorspace('srgb')
      .toFile(outputPath);

    // Clean up temp file
    fs.unlinkSync(tmpWebP);

    // Verify the output
    const metadata = await sharp(outputPath).metadata();
    if (!metadata.width || !metadata.height || metadata.format !== 'png') {
      console.warn(`  ⚠️  Invalid PNG output for ${path.basename(outputPath)}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`  ⚠️  WebP conversion failed for ${path.basename(outputPath)}: ${error}`);

    // Clean up any temp files
    if (fs.existsSync(tmpWebP)) {
      try {
        fs.unlinkSync(tmpWebP);
      } catch {}
    }

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

async function fetchAllItems(): Promise<MetaForgeItem[]> {
  console.log('📥 Fetching items from MetaForge API (with pagination)...');

  const allItems: MetaForgeItem[] = [];
  let currentPage = 1;
  let hasNextPage = true;
  const limit = 100; // Fetch 100 items per page

  while (hasNextPage) {
    try {
      const url = `${METAFORGE_API_BASE}/items?page=${currentPage}&limit=${limit}`;
      console.log(`  Fetching page ${currentPage}...`);

      const response = await fetchJSON<MetaForgePaginatedResponse<MetaForgeItem>>(url);
      allItems.push(...response.data);

      hasNextPage = response.pagination.hasNextPage;
      currentPage++;

      console.log(`  ✅ Page ${currentPage - 1}: ${response.data.length} items (Total so far: ${allItems.length}/${response.pagination.total})`);

      // Rate limiting: wait 500ms between requests to be respectful
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`  ❌ Failed to fetch page ${currentPage}:`, error);
      hasNextPage = false;
    }
  }

  console.log(`✅ Total items fetched: ${allItems.length}`);
  return allItems;
}

async function fetchAllQuests(): Promise<MetaForgeQuest[]> {
  console.log('📥 Fetching quests from MetaForge API...');

  const allQuests: MetaForgeQuest[] = [];
  let currentPage = 1;
  let hasNextPage = true;
  const limit = 100;

  while (hasNextPage) {
    try {
      const url = `${METAFORGE_API_BASE}/quests?page=${currentPage}&limit=${limit}`;
      const response = await fetchJSON<MetaForgePaginatedResponse<MetaForgeQuest>>(url);
      allQuests.push(...response.data);

      hasNextPage = response.pagination.hasNextPage;
      currentPage++;

      console.log(`  ✅ Page ${currentPage - 1}: ${response.data.length} quests (Total so far: ${allQuests.length})`);

      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`  ❌ Failed to fetch quests page ${currentPage}:`, error);
      hasNextPage = false;
    }
  }

  console.log(`✅ Total quests fetched: ${allQuests.length}`);
  return allQuests;
}

function mapMetaForgeItemToOurFormat(metaforgeItem: MetaForgeItem): any {
  // Map MetaForge item structure to our Item interface
  return {
    id: metaforgeItem.id,
    name: metaforgeItem.name, // Now just a string (English only)
    description: metaforgeItem.description || '',
    type: metaforgeItem.item_type || 'Unknown',
    rarity: metaforgeItem.rarity ? metaforgeItem.rarity.toLowerCase() : 'common',
    value: metaforgeItem.value || 0,
    weightKg: metaforgeItem.stat_block?.weight || 0,
    stackSize: metaforgeItem.stat_block?.stackSize || 1,
    imageFilename: metaforgeItem.id + '.png', // We'll convert WebP to PNG
    foundIn: metaforgeItem.loot_area ? [metaforgeItem.loot_area] : [],
    craftBench: metaforgeItem.workbench || undefined,
    updatedAt: metaforgeItem.updated_at || new Date().toISOString(),
    // Note: MetaForge doesn't provide recipe, recyclesInto, upgradeCost, etc.
    // These fields will be missing unless we supplement from another source
  };
}

function mapMetaForgeQuestToOurFormat(metaforgeQuest: MetaForgeQuest): any {
  return {
    id: metaforgeQuest.id,
    name: metaforgeQuest.name,
    objectives: metaforgeQuest.objectives || [],
    requirements: metaforgeQuest.required_items || [],
    rewards: metaforgeQuest.rewards || {},
    trader: metaforgeQuest.trader,
    xp: metaforgeQuest.xp || 0,
  };
}

async function main() {
  console.log('🚀 Fetching Arc Raiders data from MetaForge API...\n');

  // Fetch items from MetaForge
  const metaforgeItems = await fetchAllItems();
  const mappedItems = metaforgeItems.map(mapMetaForgeItemToOurFormat);

  // Save items.json
  console.log('\n💾 Saving items.json...');
  fs.writeFileSync(
    path.join(DATA_DIR, 'items.json'),
    JSON.stringify(mappedItems, null, 2)
  );
  console.log(`✅ Saved ${mappedItems.length} items to items.json`);

  // Fetch quests from MetaForge
  const metaforgeQuests = await fetchAllQuests();
  const mappedQuests = metaforgeQuests.map(mapMetaForgeQuestToOurFormat);

  // Save quests.json
  console.log('\n💾 Saving quests.json...');
  fs.writeFileSync(
    path.join(DATA_DIR, 'quests.json'),
    JSON.stringify(mappedQuests, null, 2)
  );
  console.log(`✅ Saved ${mappedQuests.length} quests to quests.json`);

  // Download and convert icons
  console.log('\n📥 Downloading and converting item icons from WebP to PNG...');
  const resizedIcons = loadResizedIcons();

  let downloadedIcons = 0;
  let skippedIcons = 0;
  let conversionFailedCount = 0;

  for (const item of metaforgeItems) {
    if (item.icon) {
      const filename = item.id + '.png';
      const iconPath = path.join(ICONS_DIR, filename);

      try {
        // Skip if already exists and processed
        if (fs.existsSync(iconPath) && resizedIcons.has(filename)) {
          skippedIcons++;
          continue;
        }

        // Convert WebP to PNG
        const success = await convertWebPToPNG(item.icon, iconPath);
        if (success) {
          resizedIcons.add(filename);
          downloadedIcons++;

          // Log progress every 20 icons
          if (downloadedIcons % 20 === 0) {
            console.log(`  Converted ${downloadedIcons} icons...`);
          }
        } else {
          conversionFailedCount++;
        }

      } catch (error) {
        console.warn(`  ⚠️  Failed to process icon: ${filename}`);
        conversionFailedCount++;
      }
    }
  }

  // Save resized icons tracking
  saveResizedIcons(resizedIcons);

  console.log(`✅ Converted ${downloadedIcons} new icons (${skippedIcons} already existed)`);
  if (conversionFailedCount > 0) {
    console.log(`⚠️  ${conversionFailedCount} icons failed to convert (will use fallback)`);
  }

  // Create metadata file
  const metadata = {
    lastUpdated: new Date().toISOString(),
    source: 'https://metaforge.app/arc-raiders (items & quests)',
    staticSource: 'Local static files (hideout modules & projects)',
    version: '2.0.0',
    itemCount: mappedItems.length,
    questCount: mappedQuests.length
  };

  fs.writeFileSync(
    path.join(DATA_DIR, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log('\n✨ Data fetch complete!');
  console.log(`📊 Last updated: ${metadata.lastUpdated}`);
  console.log(`📦 Total items: ${metadata.itemCount}`);
  console.log(`🎯 Total quests: ${metadata.questCount}`);
  console.log(`\n⚠️  Note: Hideout modules and projects are stored in public/data/static/ and are not updated by this script.`);
}

main().catch(console.error);
