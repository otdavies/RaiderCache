import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import sharp from 'sharp';

const METAFORGE_API_BASE = 'https://metaforge.app/api/arc-raiders';
const SUPABASE_URL = 'https://unhbvkszwhczbjxgetgk.supabase.co/rest/v1';
// MetaForge's public Supabase anonymous key - this is intentionally public and client-accessible
// It's visible in their website source code and designed for read-only public API access
// If they rotate this key, we'll need to extract the new one from https://metaforge.app
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuaGJ2a3N6d2hjemJqeGdldGdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ5NjgwMjUsImV4cCI6MjA2MDU0NDAyNX0.gckCmxnlpwwJOGmc5ebLYDnaWaxr5PW31eCrSPR5aRQ';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const STATIC_DATA_DIR = path.join(DATA_DIR, 'static');
const ICONS_DIR = path.join(PUBLIC_DIR, 'assets', 'icons');
const MAPS_DIR = path.join(PUBLIC_DIR, 'assets', 'maps');
const TILES_DIR = path.join(MAPS_DIR, 'tiles');
const RESIZED_MARKER = path.join(ICONS_DIR, '.resized');

// Ensure directories exist
[PUBLIC_DIR, DATA_DIR, STATIC_DATA_DIR, ICONS_DIR, MAPS_DIR, TILES_DIR].forEach(dir => {
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

interface SupabaseComponent {
  id: string;
  item_id: string;
  component_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

interface MapMarker {
  id: string;
  subcategory: string;
  lat: number;
  lng: number;
  map: string;
  category: string;
  instance_name?: string;
  created_at: string;
  updated_at: string;
}

interface MapData {
  map: string;
  markers: MapMarker[];
  stats: {
    totalMarkers: number;
    byCategory: Record<string, number>;
    bySubcategory: Record<string, number>;
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

async function cleanupTempFile(tmpPath: string, maxRetries: number = 3): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.promises.unlink(tmpPath);
      return; // Success
    } catch (error: any) {
      // On Windows, files may be briefly locked by Sharp
      if (error.code === 'EBUSY' || error.code === 'EPERM') {
        if (i < maxRetries - 1) {
          // Wait a bit for file handles to release
          await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
          continue;
        }
      }
      // If not a locking issue or final retry, ignore cleanup failure
      // Temp files aren't critical and will be cleaned up on next run
    }
  }
}

async function convertWebPToPNG(webpUrl: string, outputPath: string): Promise<boolean> {
  const tmpWebP = outputPath + '.tmp.webp';

  try {
    // Clean up any existing temp file before downloading
    if (fs.existsSync(tmpWebP)) {
      await cleanupTempFile(tmpWebP);

      // Verify cleanup succeeded - if file still exists, skip this icon
      if (fs.existsSync(tmpWebP)) {
        console.warn(`  ⚠️  Skipping ${path.basename(outputPath)} - temp file locked`);
        return false;
      }
    }

    // Download WebP
    await downloadFile(webpUrl, tmpWebP);

    // Convert to PNG with resize (maintain aspect ratio, min height 128)
    await sharp(tmpWebP)
      .resize({
        height: 128,
        fit: 'inside',
        withoutEnlargement: false,
        kernel: 'lanczos3'
      })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true
      })
      .toColorspace('srgb')
      .toFile(outputPath);

    // Verify the output
    const metadata = await sharp(outputPath).metadata();
    if (!metadata.width || !metadata.height || metadata.format !== 'png') {
      console.warn(`  ⚠️  Invalid PNG output for ${path.basename(outputPath)}`);
      await cleanupTempFile(tmpWebP);
      return false;
    }

    // Clean up temp file with retry logic for Windows file locking
    await cleanupTempFile(tmpWebP);

    return true;
  } catch (error) {
    console.warn(`  ⚠️  WebP conversion failed for ${path.basename(outputPath)}: ${error}`);

    // Clean up any temp files
    if (fs.existsSync(tmpWebP)) {
      await cleanupTempFile(tmpWebP);
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

async function fetchSupabase<T>(table: string, params: string = ''): Promise<T> {
  const url = `${SUPABASE_URL}/${table}${params ? '?' + params : ''}`;

  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    };

    https.get(url, options, (response) => {
      let data = '';

      if (response.statusCode !== 200) {
        reject(new Error(`Supabase HTTP ${response.statusCode}`));
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

async function fetchAllCraftingComponents(): Promise<Map<string, Record<string, number>>> {
  console.log('📥 Fetching crafting recipes from MetaForge Supabase...');

  try {
    const components = await fetchSupabase<SupabaseComponent[]>('arc_item_components', 'select=*');

    // Group by item_id
    const craftingMap = new Map<string, Record<string, number>>();

    for (const component of components) {
      if (!craftingMap.has(component.item_id)) {
        craftingMap.set(component.item_id, {});
      }
      craftingMap.get(component.item_id)![component.component_id] = component.quantity;
    }

    console.log(`✅ Loaded crafting recipes for ${craftingMap.size} items`);
    return craftingMap;
  } catch (error) {
    console.warn(`⚠️  Failed to fetch crafting components: ${error}`);
    return new Map();
  }
}

async function fetchAllRecycleComponents(): Promise<Map<string, Record<string, number>>> {
  console.log('📥 Fetching recycle data from MetaForge Supabase...');

  try {
    const components = await fetchSupabase<SupabaseComponent[]>('arc_item_recycle_components', 'select=*');

    // Group by item_id
    const recycleMap = new Map<string, Record<string, number>>();

    for (const component of components) {
      if (!recycleMap.has(component.item_id)) {
        recycleMap.set(component.item_id, {});
      }
      recycleMap.get(component.item_id)![component.component_id] = component.quantity;
    }

    console.log(`✅ Loaded recycle data for ${recycleMap.size} items`);
    return recycleMap;
  } catch (error) {
    console.warn(`⚠️  Failed to fetch recycle components: ${error}`);
    return new Map();
  }
}

async function fetchAllMapData(): Promise<MapData[]> {
  console.log('📥 Fetching map marker data from MetaForge Supabase...');

  // Discover available maps from the database
  console.log('  🔍 Auto-discovering available maps...');
  const allMarkers = await fetchSupabase<MapMarker[]>('arc_map_data', 'select=map');
  const uniqueMaps = [...new Set(allMarkers.map(m => m.map))].sort();
  console.log(`  ✅ Found ${uniqueMaps.length} maps: ${uniqueMaps.join(', ')}`);

  const mapDataArray: MapData[] = [];

  for (const mapName of uniqueMaps) {
    try {
      console.log(`  Fetching markers for ${mapName}...`);

      const markers = await fetchSupabase<MapMarker[]>(
        'arc_map_data',
        `map=eq.${mapName}&select=*`
      );

      // Calculate stats
      const byCategory: Record<string, number> = {};
      const bySubcategory: Record<string, number> = {};

      for (const marker of markers) {
        byCategory[marker.category] = (byCategory[marker.category] || 0) + 1;
        bySubcategory[marker.subcategory] = (bySubcategory[marker.subcategory] || 0) + 1;
      }

      const mapData: MapData = {
        map: mapName,
        markers,
        stats: {
          totalMarkers: markers.length,
          byCategory,
          bySubcategory
        }
      };

      mapDataArray.push(mapData);
      console.log(`  ✅ ${mapName}: ${markers.length} markers`);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`  ❌ Failed to fetch map data for ${mapName}:`, error);
    }
  }

  const totalMarkers = mapDataArray.reduce((sum, m) => sum + m.stats.totalMarkers, 0);
  console.log(`✅ Total map markers fetched: ${totalMarkers}`);
  return mapDataArray;
}

async function fetchMapImages(mapNames: string[]): Promise<number> {
  console.log('📥 Downloading map images from MetaForge CDN...');

  let downloadedCount = 0;
  let skippedCount = 0;

  for (const mapName of mapNames) {
    const mapUrl = `https://cdn.metaforge.app/arc-raiders/ui/${mapName}.webp`;
    const destPath = path.join(MAPS_DIR, `${mapName}.webp`);

    try {
      // Always redownload to check for updates
      if (fs.existsSync(destPath)) {
        console.log(`  🔄 Re-downloading ${mapName}.webp to check for updates...`);
        fs.unlinkSync(destPath); // Delete old version
      }

      await downloadFile(mapUrl, destPath);
      console.log(`  ✅ Downloaded ${mapName}.webp`);
      downloadedCount++;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`  ❌ Failed to download ${mapName}.webp:`, error);
    }
  }

  console.log(`✅ Map images: ${downloadedCount} downloaded, ${skippedCount} already existed`);
  return downloadedCount;
}

async function testTileUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    https.request(url, { method: 'HEAD' }, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false)).end();
  });
}

async function discoverMapTilePattern(mapName: string): Promise<{ baseUrl: string; separator: string } | null> {
  console.log(`  🔍 Discovering tile pattern for ${mapName}...`);

  // Generate name variations
  const nameWithUnderscore = mapName.replace(/-/g, '_');
  const nameVariations = [mapName];
  if (nameWithUnderscore !== mapName) {
    nameVariations.push(nameWithUnderscore);
  }

  // Generate historical dates (last 6 months of possible dates)
  const historicalDates: string[] = [];
  for (let monthsAgo = 0; monthsAgo < 6; monthsAgo++) {
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo);
    historicalDates.push(date.toISOString().slice(0, 10).replace(/-/g, ''));
  }

  const patterns = [];

  // For each name variation, try all patterns
  for (const name of nameVariations) {
    patterns.push(
      // Current known patterns
      { url: `https://cdn.metaforge.app/arc-raiders/maps/${name}-new/0/0_0.webp`, baseUrl: `https://cdn.metaforge.app/arc-raiders/maps/${name}-new`, separator: '_', label: `${name}-new` },
      { url: `https://cdn.metaforge.app/arc-raiders/maps/${name}/v2/0/0/0.webp`, baseUrl: `https://cdn.metaforge.app/arc-raiders/maps/${name}/v2`, separator: '/', label: `${name}/v2` },
      { url: `https://cdn.metaforge.app/arc-raiders/maps/${name}/20251030/0/0/0.webp`, baseUrl: `https://cdn.metaforge.app/arc-raiders/maps/${name}/20251030`, separator: '/', label: `${name}/20251030` },

      // Try version numbers 1-10
      ...Array.from({ length: 10 }, (_, i) => ({
        url: `https://cdn.metaforge.app/arc-raiders/maps/${name}/v${i + 1}/0/0/0.webp`,
        baseUrl: `https://cdn.metaforge.app/arc-raiders/maps/${name}/v${i + 1}`,
        separator: '/',
        label: `${name}/v${i + 1}`
      })),

      // Try historical dates
      ...historicalDates.map(date => ({
        url: `https://cdn.metaforge.app/arc-raiders/maps/${name}/${date}/0/0/0.webp`,
        baseUrl: `https://cdn.metaforge.app/arc-raiders/maps/${name}/${date}`,
        separator: '/',
        label: `${name}/${date}`
      })),

      // Base patterns without version/date
      { url: `https://cdn.metaforge.app/arc-raiders/maps/${name}/0/0_0.webp`, baseUrl: `https://cdn.metaforge.app/arc-raiders/maps/${name}`, separator: '_', label: `${name}/base_` },
      { url: `https://cdn.metaforge.app/arc-raiders/maps/${name}/0/0/0.webp`, baseUrl: `https://cdn.metaforge.app/arc-raiders/maps/${name}`, separator: '/', label: `${name}/base/` }
    );
  }

  console.log(`  Testing ${patterns.length} URL patterns...`);
  let testedCount = 0;

  for (const pattern of patterns) {
    testedCount++;
    const exists = await testTileUrl(pattern.url);
    if (exists) {
      console.log(`  ✅ Found pattern: ${pattern.baseUrl} (separator: '${pattern.separator}') after testing ${testedCount}/${patterns.length} patterns`);
      return { baseUrl: pattern.baseUrl, separator: pattern.separator };
    }
    // Show progress every 5 patterns
    if (testedCount % 5 === 0) {
      console.log(`  Tested ${testedCount}/${patterns.length} patterns...`);
    }
    await new Promise(resolve => setTimeout(resolve, 50)); // Rate limiting
  }

  console.warn(`  ⚠️  Tiles not available for ${mapName} (tested ${patterns.length} URL patterns)`);
  console.warn(`  This map may be newly added and tiles haven't been uploaded to the CDN yet.`);
  return null;
}

async function downloadMapTiles(mapNames: string[]): Promise<number> {
  console.log('📥 Downloading map tiles from MetaForge CDN...');
  console.log('  🔄 Re-downloading all tiles to check for updates...');

  const maxZoom = 4;

  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const mapName of mapNames) {
    console.log(`\n  📍 Processing ${mapName}...`);

    // Discover the correct tile pattern dynamically
    const pattern = await discoverMapTilePattern(mapName);

    if (!pattern) {
      console.warn(`  ⚠️  Skipping ${mapName} - no valid tile pattern found`);
      totalFailed++;
      continue;
    }

    const config = { name: mapName, ...pattern, maxZoom };
    const mapTilesDir = path.join(TILES_DIR, config.name);

    if (!fs.existsSync(mapTilesDir)) {
      fs.mkdirSync(mapTilesDir, { recursive: true });
    }

    let mapDownloaded = 0;
    let mapSkipped = 0;

    // Download tiles for each zoom level
    for (let z = 0; z <= config.maxZoom; z++) {
      const zoomDir = path.join(mapTilesDir, z.toString());
      if (!fs.existsSync(zoomDir)) {
        fs.mkdirSync(zoomDir, { recursive: true });
      }

      // For zoom level z, we have 2^z tiles in each dimension
      const maxTileIndex = Math.pow(2, z);

      for (let x = 0; x < maxTileIndex; x++) {
        for (let y = 0; y < maxTileIndex; y++) {
          // Always save tiles in flat structure: {x}_{y}.webp
          const tileFilename = `${x}_${y}.webp`;
          const tilePath = path.join(zoomDir, tileFilename);

          // Construct tile URL based on MetaForge's serving pattern
          const tileUrl = config.separator === '_'
            ? `${config.baseUrl}/${z}/${x}_${y}.webp`
            : `${config.baseUrl}/${z}/${x}/${y}.webp`;

          try {
            // Test if tile exists (HEAD request)
            const response = await new Promise<{ statusCode?: number }>((resolve) => {
              https.request(tileUrl, { method: 'HEAD' }, (res) => {
                resolve({ statusCode: res.statusCode });
              }).on('error', () => resolve({})).end();
            });

            if (response.statusCode !== 200) {
              // Tile doesn't exist, skip
              continue;
            }

            // Download the tile (always redownload to check for updates)
            await downloadFile(tileUrl, tilePath);
            mapDownloaded++;

            // Rate limiting - be respectful to CDN
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            // Silently skip missing tiles
          }
        }
      }
    }

    console.log(`  ✅ ${config.name}: ${mapDownloaded} tiles downloaded, ${mapSkipped} already existed`);
    totalDownloaded += mapDownloaded;
    totalSkipped += mapSkipped;
  }

  if (totalFailed > 0) {
    console.warn(`\n⚠️  Map tiles complete: ${totalDownloaded} downloaded, ${totalSkipped} already existed, ${totalFailed} maps failed`);
  } else {
    console.log(`\n✅ Map tiles complete: ${totalDownloaded} downloaded, ${totalSkipped} already existed`);
  }
  return totalDownloaded;
}

/**
 * Calculate map extents from downloaded tiles
 */
async function calculateMapExtents(): Promise<void> {
  console.log('\n📐 Calculating map extents from tiles...');

  const mapExtents: Record<string, {
    worldExtent: [number, number, number, number];
    tileSize: number;
    center: [number, number];
    tilesWide: number;
    tilesHigh: number;
  }> = {};

  const tileSizes: Record<string, number> = {
    'dam': 256,
    'spaceport': 512,
    'buried-city': 512,
    'blue-gate': 512
  };

  const mapDirs = fs.readdirSync(TILES_DIR).filter(f =>
    fs.statSync(path.join(TILES_DIR, f)).isDirectory()
  );

  for (const mapName of mapDirs) {
    const mapPath = path.join(TILES_DIR, mapName);

    // Find max zoom level
    const zoomLevels = fs.readdirSync(mapPath)
      .filter(f => fs.statSync(path.join(mapPath, f)).isDirectory())
      .map(f => parseInt(f))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    if (zoomLevels.length === 0) continue;

    const maxZoom = zoomLevels[zoomLevels.length - 1];
    const maxZoomPath = path.join(mapPath, maxZoom.toString());

    // Read all tiles at max zoom
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

    if (tiles.length === 0) continue;

    // Calculate extents
    const minX = Math.min(...tiles.map(t => t.x));
    const maxX = Math.max(...tiles.map(t => t.x));
    const minY = Math.min(...tiles.map(t => t.y));
    const maxY = Math.max(...tiles.map(t => t.y));

    const tilesWide = maxX - minX + 1;
    const tilesHigh = maxY - minY + 1;
    const tileSize = tileSizes[mapName] || 512;

    const widthPx = tilesWide * tileSize;
    const heightPx = tilesHigh * tileSize;

    // WorldExtent is always 2x the actual tile dimensions
    const worldWidth = widthPx * 2;
    const worldHeight = heightPx * 2;

    mapExtents[mapName] = {
      worldExtent: [0, 0, worldWidth, worldHeight],
      tileSize,
      center: [worldWidth / 2, worldHeight / 2],
      tilesWide,
      tilesHigh
    };

    console.log(`  ✅ ${mapName}: ${widthPx}×${heightPx}px → worldExtent: ${worldWidth}×${worldHeight} (${tilesWide}×${tilesHigh} tiles @ ${tileSize}px)`);
  }

  // Save to a config file for reference
  const configPath = path.join(DATA_DIR, 'map-extents.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify(mapExtents, null, 2)
  );

  console.log(`\n✅ Map extents saved to ${configPath}`);
}

function mapMetaForgeItemToOurFormat(
  metaforgeItem: MetaForgeItem,
  craftingMap: Map<string, Record<string, number>>,
  recycleMap: Map<string, Record<string, number>>
): any {
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
    foundIn: metaforgeItem.loot_area
      ? metaforgeItem.loot_area.split(',').map(s => s.trim()).filter(s => s)
      : [],
    craftBench: metaforgeItem.workbench || undefined,
    updatedAt: metaforgeItem.updated_at || new Date().toISOString(),
    // Crafting and recycling data from Supabase
    recipe: craftingMap.get(metaforgeItem.id) || undefined,
    recyclesInto: recycleMap.get(metaforgeItem.id) || undefined,
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

  // Fetch items from MetaForge API
  const metaforgeItems = await fetchAllItems();

  // Fetch crafting and recycling data from Supabase (with rate limiting)
  console.log('\n📥 Fetching crafting and recycling data from Supabase...');
  await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
  const [craftingMap, recycleMap] = await Promise.all([
    fetchAllCraftingComponents(),
    fetchAllRecycleComponents()
  ]);

  // Map items with crafting/recycling data
  const mappedItems = metaforgeItems.map(item =>
    mapMetaForgeItemToOurFormat(item, craftingMap, recycleMap)
  );

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

  // Fetch map data from Supabase
  console.log('\n📥 Fetching map data from Supabase...');
  await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
  const mapData = await fetchAllMapData();

  // Save map data
  console.log('\n💾 Saving map data...');
  fs.writeFileSync(
    path.join(DATA_DIR, 'maps.json'),
    JSON.stringify(mapData, null, 2)
  );
  const totalMapMarkers = mapData.reduce((sum, m) => sum + m.stats.totalMarkers, 0);
  console.log(`✅ Saved map data with ${totalMapMarkers} markers across ${mapData.length} maps`);

  // Extract discovered map names
  const discoveredMaps = mapData.map(m => m.map);

  // Download map images
  console.log('\n📥 Downloading map images...');
  await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
  await fetchMapImages(discoveredMaps);

  // Download map tiles
  console.log('\n📥 Downloading map tiles...');
  await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
  await downloadMapTiles(discoveredMaps);

  // Calculate map extents from downloaded tiles
  await calculateMapExtents();

  // Download and convert icons
  console.log('\n📥 Downloading and converting item icons from WebP to PNG...');

  // Clean up any leftover temporary files from previous runs
  const tempFiles = fs.readdirSync(ICONS_DIR).filter(f => f.endsWith('.tmp.webp'));
  if (tempFiles.length > 0) {
    console.log(`  🧹 Cleaning up ${tempFiles.length} leftover temporary files...`);
    for (const tempFile of tempFiles) {
      await cleanupTempFile(path.join(ICONS_DIR, tempFile));
    }
  }

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
    source: 'https://metaforge.app/arc-raiders (items, quests, maps)',
    staticSource: 'Local static files (hideout modules & projects)',
    version: '2.1.0',
    itemCount: mappedItems.length,
    questCount: mappedQuests.length,
    mapCount: mapData.length,
    mapMarkerCount: totalMapMarkers,
    maps: mapData.map(m => ({
      name: m.map,
      markerCount: m.stats.totalMarkers,
      categories: Object.keys(m.stats.byCategory).length
    }))
  };

  fs.writeFileSync(
    path.join(DATA_DIR, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log('\n✨ Data fetch complete!');
  console.log(`📊 Last updated: ${metadata.lastUpdated}`);
  console.log(`📦 Total items: ${metadata.itemCount}`);
  console.log(`🎯 Total quests: ${metadata.questCount}`);
  console.log(`🗺️  Total maps: ${metadata.mapCount}`);
  console.log(`📍 Total map markers: ${metadata.mapMarkerCount}`);
  console.log(`\n⚠️  Note: Hideout modules and projects are stored in public/data/static/ and are not updated by this script.`);
}

main().catch(console.error);
