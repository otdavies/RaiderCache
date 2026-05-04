import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import sharp from 'sharp';

// https://github.com/RaidTheory/arcraiders-data/ is a great source of data.

const RAIDTHEORY_PROJECTS_URL = 'https://raw.githubusercontent.com/RaidTheory/arcraiders-data/refs/heads/main/projects.json';
const RAIDTHEORY_HIDEOUT_CONTENTS_URL = 'https://api.github.com/repos/RaidTheory/arcraiders-data/contents/hideout';
const RAIDTHEORY_QUESTS_CONTENTS_URL = 'https://api.github.com/repos/RaidTheory/arcraiders-data/contents/quests';
const RAIDTHEORY_ITEMS_CONTENTS_URL = 'https://api.github.com/repos/RaidTheory/arcraiders-data/contents/items';
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
const GITHUB_FETCH_TIMEOUT_MS = 15000;
const GITHUB_FETCH_RETRIES = 3;
const SKIP_MAP_FETCHES = process.argv.includes('--skip-maps');

// Ensure directories exist
[PUBLIC_DIR, DATA_DIR, STATIC_DATA_DIR, ICONS_DIR, MAPS_DIR, TILES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

interface RaidTheoryItem {
  id: string;
  name?: string | Record<string, string>;
  description?: string | Record<string, string>;
  type?: string;
  rarity?: string;
  value?: number;
  weightKg?: number;
  stackSize?: number;
  imageFilename?: string;
  foundIn?: string | string[];
  craftBench?: string;
  updatedAt?: string;
  recipe?: Record<string, number>;
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;
  crafting?: Record<string, number>;
  upgradeCost?: Record<string, number>;
  effects?: Array<{ label?: string; value?: string | number }>;
}

interface RaidTheoryQuest {
  id: string;
  name?: string | Record<string, string>;
  description?: string | Record<string, string>;
  objectives?: Array<string | Record<string, string>>;
  requiredItemIds?: Array<{ itemId?: string; item_id?: string; quantity?: number }>;
  rewardItemIds?: Array<{ itemId?: string; item_id?: string; quantity?: number }>;
  grantedItemIds?: Array<{ itemId?: string; item_id?: string; quantity?: number }>;
  otherRequirements?: Array<string | { type?: string; value?: number | string }>;
  trader?: string;
  xp?: number;
  updatedAt?: string;
  previousQuestIds?: string[];
  nextQuestIds?: string[];
}

interface ProjectRequirement {
  item_id: string;
  quantity: number;
}

interface ProjectPhase {
  phase: number;
  name?: string;
  requirementItemIds?: ProjectRequirement[];
}

interface ProjectData {
  id: string;
  name: string;
  description?: string;
  requirements?: ProjectRequirement[];
  phases?: ProjectPhase[];
  unlocks?: string[];
}

interface HideoutRequirement {
  item_id: string;
  quantity: number;
}

interface HideoutOtherRequirement {
  type: string;
  value: number;
}

interface HideoutLevel {
  level: number;
  requirementItemIds: HideoutRequirement[];
  otherRequirements?: HideoutOtherRequirement[];
  description?: string;
}

interface HideoutModuleData {
  id: string;
  name: string;
  maxLevel: number;
  levels: HideoutLevel[];
}

interface GitHubContentEntry {
  name: string;
  type: 'file' | 'dir';
  download_url: string | null;
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

function loadExistingMapData(): MapData[] {
  const mapsPath = path.join(DATA_DIR, 'maps.json');
  if (!fs.existsSync(mapsPath)) {
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(mapsPath, 'utf-8')) as unknown;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw as MapData[];
  } catch (error) {
    console.warn(`⚠️  Could not read existing maps.json: ${error}`);
    return [];
  }
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

async function fetchJSONWithTimeout<T>(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      let data = '';

      if (response.statusCode === 302 || response.statusCode === 301) {
        if (response.headers.location) {
          fetchJSONWithTimeout<T>(response.headers.location, timeoutMs).then(resolve).catch(reject);
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
        } catch (error) {
          reject(error);
        }
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });

    request.on('error', reject);
  });
}

function normalizeProjectRequirement(req: any): ProjectRequirement | null {
  const itemId = req?.item_id ?? req?.itemId;
  const quantityValue = req?.quantity;

  if (typeof itemId !== 'string' || itemId.length === 0) {
    return null;
  }

  // RaidTheory project data uses snake_case IDs while our item dataset uses kebab-case IDs.
  const normalizedItemId = normalizeItemId(itemId);
  if (!normalizedItemId) {
    return null;
  }

  const quantity = Number(quantityValue);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return {
    item_id: normalizedItemId,
    quantity
  };
}

function normalizeHideoutRequirement(req: any): HideoutRequirement | null {
  const itemId = req?.item_id ?? req?.itemId;
  if (typeof itemId !== 'string' || itemId.length === 0) {
    return null;
  }

  const normalizedItemId = normalizeItemId(itemId);
  if (!normalizedItemId) {
    return null;
  }

  const quantity = Number(req?.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return {
    item_id: normalizedItemId,
    quantity
  };
}

function normalizeHideoutOtherRequirements(value: unknown): HideoutOtherRequirement[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const mapped = value
    .map((entry: any) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const type = typeof entry.type === 'string' ? entry.type : null;
      const numericValue = Number(entry.value);
      if (!type || !Number.isFinite(numericValue)) {
        return null;
      }
      return { type, value: numericValue };
    })
    .filter((entry): entry is HideoutOtherRequirement => entry !== null);

  return mapped.length > 0 ? mapped : undefined;
}

function normalizePhaseName(value: any): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    if (typeof value.en === 'string') {
      return value.en;
    }
    const firstString = Object.values(value).find(v => typeof v === 'string');
    if (typeof firstString === 'string') {
      return firstString;
    }
  }
  return undefined;
}

function normalizeItemId(value: string): string {
  return value.trim().replace(/_/g, '-');
}

function normalizeItemRecord(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, qty]) => {
      const itemId = normalizeItemId(key);
      const quantity = Number(qty);
      if (!itemId || !Number.isFinite(quantity) || quantity <= 0) {
        return null;
      }
      return [itemId, quantity] as const;
    })
    .filter((entry): entry is readonly [string, number] => entry !== null);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

const WEAPON_TYPES = new Set(['Assault Rifle', 'Battle Rifle', 'Sniper Rifle', 'Hand Cannon', 'SMG', 'Pistol', 'Shotgun', 'LMG', 'Special' /* Only Aphelion and Hullcracker rifles have type special */]);

function normalizeItemType(type?: string): string {
  if (!type) return 'Unknown';
  return WEAPON_TYPES.has(type) ? 'weapon' : type;
}

function mapRaidTheoryItemToOurFormat(
  item: RaidTheoryItem,
  craftingMap: Map<string, Record<string, number>>,
  recycleMap: Map<string, Record<string, number>>
): any {
  const normalizedId = normalizeItemId(item.id);
  const foundIn = Array.isArray(item.foundIn)
    ? item.foundIn
    : typeof item.foundIn === 'string'
      ? item.foundIn.split(',').map(v => v.trim()).filter(Boolean)
      : [];

  return {
    id: normalizedId,
    name: normalizePhaseName(item.name) || normalizedId,
    description: normalizePhaseName(item.description) || '',
    type: normalizeItemType(item.type),
    rarity: item.rarity ? item.rarity.toLowerCase() : 'common',
    value: Number.isFinite(Number(item.value)) ? Number(item.value) : 0,
    weightKg: Number.isFinite(Number(item.weightKg)) ? Number(item.weightKg) : 0,
    stackSize: Number.isFinite(Number(item.stackSize)) && Number(item.stackSize) > 0 ? Number(item.stackSize) : 1,
    imageFilename: item.imageFilename,
    foundIn,
    craftBench: item.craftBench || undefined,
    updatedAt: item.updatedAt || new Date().toISOString(),
    recipe: normalizeItemRecord(item.recipe) || craftingMap.get(normalizedId) || undefined,
    recyclesInto: normalizeItemRecord(item.recyclesInto) || recycleMap.get(normalizedId) || undefined,
    salvagesInto: normalizeItemRecord(item.salvagesInto),
    crafting: normalizeItemRecord(item.crafting),
    upgradeCost: normalizeItemRecord(item.upgradeCost),
    effects: Array.isArray(item.effects)
      ? item.effects
        .map(effect => ({
          label: normalizePhaseName(effect?.label) || '',
          value: effect?.value ?? ''
        }))
        .filter(effect => effect.label && effect.value !== '')
      : undefined
  };
}

function normalizeModuleName(value: any): string {
  return normalizePhaseName(value) || 'Unknown Module';
}

function mapRaidTheoryProjectToOurFormat(project: any, index: number): ProjectData {
  const mappedPhases: ProjectPhase[] = Array.isArray(project?.phases)
    ? project.phases.map((phase: any, phaseIndex: number) => {
      const requirements = Array.isArray(phase?.requirementItemIds)
        ? phase.requirementItemIds
          .map(normalizeProjectRequirement)
          .filter((req: ProjectRequirement | null): req is ProjectRequirement => req !== null)
        : [];

      return {
        phase: Number.isFinite(Number(phase?.phase)) ? Number(phase.phase) : phaseIndex + 1,
        name: normalizePhaseName(phase?.name),
        requirementItemIds: requirements
      };
    })
    : [];

  const mappedRequirements: ProjectRequirement[] = Array.isArray(project?.requirements)
    ? project.requirements
      .map(normalizeProjectRequirement)
      .filter((req: ProjectRequirement | null): req is ProjectRequirement => req !== null)
    : [];

  const description = typeof project?.description === 'string'
    ? project.description
    : normalizePhaseName(project?.description);

  return {
    id: typeof project?.id === 'string' && project.id.length > 0 ? project.id : `project-${index + 1}`,
    name: normalizePhaseName(project?.name) || `Project ${index + 1}`,
    description,
    requirements: mappedRequirements.length > 0 ? mappedRequirements : undefined,
    phases: mappedPhases.length > 0 ? mappedPhases : undefined,
    unlocks: Array.isArray(project?.unlocks)
      ? project.unlocks.filter((u: unknown): u is string => typeof u === 'string')
      : undefined
  };
}

function mapRaidTheoryHideoutToOurFormat(module: any, index: number): HideoutModuleData {
  const mappedLevels: HideoutLevel[] = Array.isArray(module?.levels)
    ? module.levels.map((level: any, levelIndex: number) => {
      const requirementItemIds: HideoutRequirement[] = Array.isArray(level?.requirementItemIds)
        ? level.requirementItemIds
          .map(normalizeHideoutRequirement)
          .filter((req: HideoutRequirement | null): req is HideoutRequirement => req !== null)
        : [];

      const description = normalizePhaseName(level?.description);
      const otherRequirements = normalizeHideoutOtherRequirements(level?.otherRequirements);

      return {
        level: Number.isFinite(Number(level?.level)) ? Number(level.level) : levelIndex + 1,
        requirementItemIds,
        otherRequirements,
        description
      };
    })
    : [];

  return {
    id: typeof module?.id === 'string' && module.id.length > 0 ? module.id : `hideout-${index + 1}`,
    name: normalizeModuleName(module?.name),
    maxLevel: Number.isFinite(Number(module?.maxLevel)) ? Number(module.maxLevel) : mappedLevels.length,
    levels: mappedLevels
  };
}

function isLikelyValidProjectsPayload(payload: unknown): payload is any[] {
  if (!Array.isArray(payload) || payload.length === 0) {
    return false;
  }

  return payload.some(project => {
    const hasId = typeof project?.id === 'string' && project.id.length > 0;
    const hasName = typeof project?.name === 'string' || (project?.name && typeof project.name === 'object');
    const hasPhases = Array.isArray(project?.phases);
    return hasId && (hasName || hasPhases);
  });
}

// Extract expedition number from a project id such as expedition_project, expedition_project_s1, expedition_project_s4
function expeditionNumber(id: string): number {
  const match = id.match(/^expedition_project(?:_s(\d+))?$/);
  if (!match) return -1;
  return match[1] !== undefined ? Number(match[1]) : 0;
}

function keepOnlyHighestExpedition(projects: ProjectData[]): ProjectData[] {
  const expeditions = projects.filter(p => expeditionNumber(p.id) >= 0);
  if (expeditions.length === 0) return projects;
  const maxNum = Math.max(...expeditions.map(p => expeditionNumber(p.id)));
  const highest = expeditions.find(p => expeditionNumber(p.id) === maxNum)!;
  return projects.filter(p => expeditionNumber(p.id) < 0 || p.id === highest.id);
}

async function fetchRaidTheoryProjects(): Promise<ProjectData[]> {
  console.log('📥 Fetching projects from RaidTheory...');

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= GITHUB_FETCH_RETRIES; attempt++) {
    try {
      console.log(`  Attempt ${attempt}/${GITHUB_FETCH_RETRIES}...`);
      const payload = await fetchJSONWithTimeout<unknown>(RAIDTHEORY_PROJECTS_URL, GITHUB_FETCH_TIMEOUT_MS);

      if (!isLikelyValidProjectsPayload(payload)) {
        throw new Error('Invalid projects payload shape');
      }

      const mappedProjects = payload.map(mapRaidTheoryProjectToOurFormat);
      const filteredProjects = keepOnlyHighestExpedition(mappedProjects);
      console.log(`✅ Fetched ${filteredProjects.length} projects from RaidTheory (kept highest expedition only)`);
      return filteredProjects;
    } catch (error) {
      lastError = error;
      console.warn(`  ⚠️  Attempt ${attempt} failed: ${error}`);
      if (attempt < GITHUB_FETCH_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  throw new Error(`Failed to fetch RaidTheory projects after ${GITHUB_FETCH_RETRIES} attempts: ${lastError}`);
}

async function fetchRaidTheoryHideoutModules(): Promise<HideoutModuleData[]> {
  console.log('📥 Fetching hideout modules from RaidTheory...');

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= GITHUB_FETCH_RETRIES; attempt++) {
    try {
      console.log(`  Attempt ${attempt}/${GITHUB_FETCH_RETRIES}...`);
      const entries = await fetchJSONWithTimeout<GitHubContentEntry[]>(
        RAIDTHEORY_HIDEOUT_CONTENTS_URL,
        GITHUB_FETCH_TIMEOUT_MS,
        {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'RaiderCache-Fetcher'
        }
      );

      const hideoutFiles = entries
        .filter(entry => entry.type === 'file' && entry.name.endsWith('.json') && !!entry.download_url)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (hideoutFiles.length === 0) {
        throw new Error('No hideout JSON files found in RaidTheory repository');
      }

      const rawModules = await Promise.all(
        hideoutFiles.map(async (file) => {
          const moduleJson = await fetchJSONWithTimeout<any>(
            file.download_url as string,
            GITHUB_FETCH_TIMEOUT_MS
          );
          return moduleJson;
        })
      );

      const mappedModules = rawModules.map(mapRaidTheoryHideoutToOurFormat);
      console.log(`✅ Fetched and combined ${mappedModules.length} hideout modules from RaidTheory`);
      return mappedModules;
    } catch (error) {
      lastError = error;
      console.warn(`  ⚠️  Attempt ${attempt} failed: ${error}`);
      if (attempt < GITHUB_FETCH_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  throw new Error(`Failed to fetch RaidTheory hideout modules after ${GITHUB_FETCH_RETRIES} attempts: ${lastError}`);
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

async function fetchRaidTheoryItems(
  craftingMap: Map<string, Record<string, number>>,
  recycleMap: Map<string, Record<string, number>>
): Promise<any[]> {
  console.log('📥 Fetching items from RaidTheory...');

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= GITHUB_FETCH_RETRIES; attempt++) {
    try {
      console.log(`  Attempt ${attempt}/${GITHUB_FETCH_RETRIES}...`);
      const entries = await fetchJSONWithTimeout<GitHubContentEntry[]>(
        RAIDTHEORY_ITEMS_CONTENTS_URL,
        GITHUB_FETCH_TIMEOUT_MS,
        {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'RaiderCache-Fetcher'
        }
      );

      const itemFiles = entries
        .filter(entry => entry.type === 'file' && entry.name.endsWith('.json') && !!entry.download_url)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (itemFiles.length === 0) {
        throw new Error('No item JSON files found in RaidTheory repository');
      }

      const rawItems = await Promise.all(
        itemFiles.map(async (file) => fetchJSONWithTimeout<RaidTheoryItem>(
          file.download_url as string,
          GITHUB_FETCH_TIMEOUT_MS
        ))
      );

      const mappedItems = rawItems
        .filter((item): item is RaidTheoryItem => !!item && typeof item.id === 'string' && item.id.length > 0)
        .map(item => mapRaidTheoryItemToOurFormat(item, craftingMap, recycleMap));

      console.log(`✅ Fetched ${mappedItems.length} items from RaidTheory`);
      return mappedItems;
    } catch (error) {
      lastError = error;
      console.warn(`  ⚠️  Attempt ${attempt} failed: ${error}`);
      if (attempt < GITHUB_FETCH_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  throw new Error(`Failed to fetch RaidTheory items after ${GITHUB_FETCH_RETRIES} attempts: ${lastError}`);
}

function normalizeQuestItemRef(req: { itemId?: string; item_id?: string; quantity?: number } | null | undefined) {
  if (!req) {
    return null;
  }

  const rawItemId = req.itemId ?? req.item_id;
  if (typeof rawItemId !== 'string' || rawItemId.length === 0) {
    return null;
  }

  // RaidTheory quest item IDs use snake_case while our item data uses kebab-case.
  const item_id = normalizeItemId(rawItemId);
  if (!item_id) {
    return null;
  }

  const quantity = Number(req.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return { item_id, quantity };
}

function mapRaidTheoryQuestToOurFormat(raidTheoryQuest: RaidTheoryQuest, index: number) {
  const normalizedRequirements = [
    ...(Array.isArray(raidTheoryQuest.requiredItemIds)
      ? raidTheoryQuest.requiredItemIds
        .map(normalizeQuestItemRef)
        .filter((req): req is { item_id: string; quantity: number } => req !== null)
      : []),
    ...(Array.isArray(raidTheoryQuest.otherRequirements)
      ? raidTheoryQuest.otherRequirements
        .map((entry) => {
          if (typeof entry === 'string') {
            const trimmed = entry.trim();
            return trimmed ? { type: 'other', value: trimmed } : null;
          }

          if (entry && typeof entry === 'object' && typeof entry.type === 'string') {
            return entry.value === undefined
              ? { type: entry.type }
              : { type: entry.type, value: entry.value };
          }

          return null;
        })
        .filter((req): req is { type: string; value?: number | string } => req !== null)
      : [])
  ];

  const objectives = Array.isArray(raidTheoryQuest.objectives)
    ? raidTheoryQuest.objectives
      .map((objective) => normalizePhaseName(objective))
      .filter((objective): objective is string => typeof objective === 'string' && objective.length > 0)
    : [];

  const rewards = [
    ...(Array.isArray(raidTheoryQuest.rewardItemIds)
      ? raidTheoryQuest.rewardItemIds
        .map(normalizeQuestItemRef)
        .filter((reward): reward is { item_id: string; quantity: number } => reward !== null)
      : []),
    ...(Array.isArray(raidTheoryQuest.grantedItemIds)
      ? raidTheoryQuest.grantedItemIds
        .map(normalizeQuestItemRef)
        .filter((reward): reward is { item_id: string; quantity: number } => reward !== null)
      : [])
  ];

  return {
    id: raidTheoryQuest.id,
    name: normalizePhaseName(raidTheoryQuest.name) || raidTheoryQuest.id,
    description: normalizePhaseName(raidTheoryQuest.description),
    objectives,
    requirements: normalizedRequirements,
    rewards,
    rewardItemIds: rewards,
    trader: typeof raidTheoryQuest.trader === 'string' && raidTheoryQuest.trader.length > 0
      ? raidTheoryQuest.trader
      : 'Unknown',
    xp: Number.isFinite(Number(raidTheoryQuest.xp)) ? Number(raidTheoryQuest.xp) : 0,
    sortOrder: index,
    updatedAt: raidTheoryQuest.updatedAt,
    previousQuestIds: Array.isArray(raidTheoryQuest.previousQuestIds) ? raidTheoryQuest.previousQuestIds : [],
    nextQuestIds: Array.isArray(raidTheoryQuest.nextQuestIds) ? raidTheoryQuest.nextQuestIds : []
  };
}

async function fetchRaidTheoryQuests(): Promise<any[]> {
  console.log('📥 Fetching quests from RaidTheory...');

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= GITHUB_FETCH_RETRIES; attempt++) {
    try {
      console.log(`  Attempt ${attempt}/${GITHUB_FETCH_RETRIES}...`);
      const entries = await fetchJSONWithTimeout<GitHubContentEntry[]>(
        RAIDTHEORY_QUESTS_CONTENTS_URL,
        GITHUB_FETCH_TIMEOUT_MS,
        {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'RaiderCache-Fetcher'
        }
      );

      const questFiles = entries
        .filter(entry => entry.type === 'file' && entry.name.endsWith('.json') && !!entry.download_url)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (questFiles.length === 0) {
        throw new Error('No quest JSON files found in RaidTheory repository');
      }

      const rawQuests = await Promise.all(
        questFiles.map(async (file) => fetchJSONWithTimeout<RaidTheoryQuest>(
          file.download_url as string,
          GITHUB_FETCH_TIMEOUT_MS
        ))
      );

      const questsWithRequiredItemIds = rawQuests.filter(
        (quest) => Array.isArray(quest.requiredItemIds) && quest.requiredItemIds.length > 0
      );

      const mappedQuests = questsWithRequiredItemIds
        .map((quest, index) => mapRaidTheoryQuestToOurFormat(quest, index));

      console.log(`✅ Fetched ${mappedQuests.length} quests from RaidTheory`);
      return mappedQuests;
    } catch (error) {
      lastError = error;
      console.warn(`  ⚠️  Attempt ${attempt} failed: ${error}`);
      if (attempt < GITHUB_FETCH_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  throw new Error(`Failed to fetch RaidTheory quests after ${GITHUB_FETCH_RETRIES} attempts: ${lastError}`);
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

  // Discover available maps from the database with pagination
  // Supabase has a max limit per request, so we need to paginate
  console.log('  🔍 Auto-discovering available maps (with pagination)...');

  const allMapNames = new Set<string>();
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  try {
    while (hasMore) {
      const markers = await fetchSupabase<MapMarker[]>(
        'arc_map_data',
        `select=map&limit=${pageSize}&offset=${offset}`
      );

      console.log(`  📊 Retrieved ${markers.length} records (offset ${offset})...`);

      for (const marker of markers) {
        if (marker.map) {
          allMapNames.add(marker.map);
        }
      }

      if (markers.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }

      // Rate limiting between pages
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    console.warn(`⚠️  Failed to discover maps from Supabase: ${error}`);
    console.warn('⚠️  Continuing with empty map data (0 maps).');
    return [];
  }

  const uniqueMaps = [...allMapNames].sort();
  console.log(`  ✅ Found ${uniqueMaps.length} unique maps: ${uniqueMaps.join(', ')}`);

  if (uniqueMaps.length === 0) {
    console.warn('⚠️  No maps found in Supabase map data. Returning 0 maps.');
    return [];
  }

  const mapDataArray: MapData[] = [];

  for (const mapName of uniqueMaps) {
    try {
      console.log(`  Fetching markers for ${mapName}...`);

      // Paginate to get all markers for this map
      const allMarkers: MapMarker[] = [];
      let mapOffset = 0;
      let mapHasMore = true;

      while (mapHasMore) {
        const markers = await fetchSupabase<MapMarker[]>(
          'arc_map_data',
          `map=eq.${mapName}&select=*&limit=${pageSize}&offset=${mapOffset}`
        );

        allMarkers.push(...markers);

        if (markers.length < pageSize) {
          mapHasMore = false;
        } else {
          mapOffset += pageSize;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Calculate stats
      const byCategory: Record<string, number> = {};
      const bySubcategory: Record<string, number> = {};

      for (const marker of allMarkers) {
        byCategory[marker.category] = (byCategory[marker.category] || 0) + 1;
        bySubcategory[marker.subcategory] = (bySubcategory[marker.subcategory] || 0) + 1;
      }

      const mapData: MapData = {
        map: mapName,
        markers: allMarkers,
        stats: {
          totalMarkers: allMarkers.length,
          byCategory,
          bySubcategory
        }
      };

      mapDataArray.push(mapData);
      console.log(`  ✅ ${mapName}: ${allMarkers.length} markers`);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
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
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`  ❌ Failed to download ${mapName}.webp:`, error);
    }
  }

  console.log(`✅ Map images: ${downloadedCount} downloaded, ${skippedCount} already existed`);
  return downloadedCount;
}

async function testUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    https.request(url, { method: 'HEAD' }, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false)).end();
  });
}

/**
 * Generate all reasonable name variations for a map name
 * e.g., "buried-city" -> ["buried-city", "buried_city", "buriedcity", "Buried-City", etc.]
 */
function generateNameVariations(name: string): string[] {
  const variations = new Set<string>();
  const normalized = name.toLowerCase().trim();

  // Original and lowercase
  variations.add(name);
  variations.add(normalized);

  // Hyphen/underscore/space variations
  const withHyphens = normalized.replace(/[_\s]/g, '-');
  const withUnderscores = normalized.replace(/[-\s]/g, '_');
  const withoutSeparators = normalized.replace(/[-_\s]/g, '');

  variations.add(withHyphens);
  variations.add(withUnderscores);
  variations.add(withoutSeparators);

  // Also try kebab-case from underscore (stella_montis -> stella-montis)
  if (normalized.includes('_')) {
    variations.add(normalized.replace(/_/g, '-'));
  }
  if (normalized.includes('-')) {
    variations.add(normalized.replace(/-/g, '_'));
  }

  return [...variations];
}

/**
 * Load previously discovered maps from cache file
 * This provides continuity across runs - once a map is found, we remember it
 */
function loadDiscoveredMapsCache(): string[] {
  const cachePath = path.join(DATA_DIR, '.map-discovery-cache.json');
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      console.log(`  📦 Loaded ${data.maps?.length || 0} maps from discovery cache`);
      return data.maps || [];
    }
  } catch (error) {
    console.warn('  ⚠️  Could not load map discovery cache:', error);
  }
  return [];
}

/**
 * Save discovered maps to cache file for future runs
 */
function saveDiscoveredMapsCache(maps: string[]): void {
  const cachePath = path.join(DATA_DIR, '.map-discovery-cache.json');
  try {
    fs.writeFileSync(cachePath, JSON.stringify({
      maps,
      lastUpdated: new Date().toISOString()
    }, null, 2));
    console.log(`  💾 Saved ${maps.length} maps to discovery cache`);
  } catch (error) {
    console.warn('  ⚠️  Could not save map discovery cache:', error);
  }
}

/**
 * Discover available maps by probing the CDN for map images
 * Uses multiple strategies:
 * 1. Variations of Supabase map names
 * 2. Previously discovered maps (from cache)
 * 3. Common word patterns found in existing names
 */
async function discoverMapsFromCDN(supabaseMaps: string[]): Promise<string[]> {
  console.log('  🔍 Probing CDN to discover available maps...');

  const discoveredMaps = new Set<string>();
  const cdnBaseUrl = 'https://cdn.metaforge.app/arc-raiders/ui';

  // Load previously discovered maps from cache
  const cachedMaps = loadDiscoveredMapsCache();

  // Generate candidate map names from multiple sources
  const candidates = new Set<string>();

  // 1. Add variations of all Supabase maps
  for (const mapName of supabaseMaps) {
    for (const variation of generateNameVariations(mapName)) {
      candidates.add(variation);
    }
  }

  // 2. Add variations of all cached maps (in case Supabase lost some)
  for (const mapName of cachedMaps) {
    for (const variation of generateNameVariations(mapName)) {
      candidates.add(variation);
    }
  }

  // 3. Extract word components from known names and try new combinations
  const wordComponents = new Set<string>();
  for (const mapName of [...supabaseMaps, ...cachedMaps]) {
    const words = mapName.toLowerCase().split(/[-_\s]/);
    words.forEach(w => {
      if (w.length > 2) wordComponents.add(w);
    });
  }

  // 4. Add common location/map vocabulary words for bootstrapping discovery
  // This isn't hardcoding map names - it's providing common words that MIGHT appear in map names
  // If these don't exist on CDN, they simply won't be found
  const locationVocabulary = [
    // Common terrain/structure words
    'dam', 'port', 'station', 'base', 'camp', 'outpost', 'facility', 'bunker',
    'tower', 'bridge', 'tunnel', 'mine', 'factory', 'warehouse', 'depot',
    // Common location descriptors
    'north', 'south', 'east', 'west', 'central', 'old', 'new', 'upper', 'lower',
    // Space/sci-fi themed
    'space', 'stellar', 'stella', 'luna', 'solar', 'orbital', 'launch', 'landing',
    // Nature/geography
    'mountain', 'montis', 'valley', 'canyon', 'desert', 'forest', 'lake', 'river',
    'coast', 'beach', 'cliff', 'hill', 'ridge', 'peak', 'crater',
    // Urban
    'city', 'town', 'village', 'district', 'zone', 'sector', 'hub', 'plaza',
    // Condition descriptors
    'buried', 'hidden', 'lost', 'ancient', 'ruined', 'abandoned', 'crashed',
    // Colors (common in game map names)
    'red', 'blue', 'green', 'black', 'white', 'grey', 'gray', 'golden', 'silver',
    // Arc Raiders specific terms that might appear
    'raider', 'arc', 'gate', 'haven', 'refuge', 'frontier'
  ];

  // Add vocabulary words to word components
  locationVocabulary.forEach(w => wordComponents.add(w));

  // Try single words as map names (e.g., "dam", "spaceport")
  for (const word of wordComponents) {
    candidates.add(word);
    // Also try with common suffixes/prefixes
    candidates.add(`${word}-new`);
    candidates.add(`new-${word}`);
    candidates.add(`the-${word}`);
  }

  // Try compound words (no separator)
  for (const w1 of ['space', 'star', 'moon', 'sun', 'sky', 'air', 'sea']) {
    for (const w2 of ['port', 'base', 'station', 'dock', 'hub']) {
      candidates.add(`${w1}${w2}`);
    }
  }

  // Try two-word combinations with common separators (limit to avoid explosion)
  const priorityWords = ['buried', 'blue', 'stella', 'dam', 'space', 'port', 'city', 'gate', 'montis', 'old', 'new'];
  for (const w1 of priorityWords) {
    for (const w2 of priorityWords) {
      if (w1 !== w2) {
        candidates.add(`${w1}-${w2}`);
        candidates.add(`${w1}_${w2}`);
      }
    }
  }

  console.log(`  Testing ${candidates.size} map name candidates on CDN...`);

  // Test each candidate against the CDN (in parallel batches for speed)
  const candidatesArray = [...candidates];
  const batchSize = 5;

  for (let i = 0; i < candidatesArray.length; i += batchSize) {
    const batch = candidatesArray.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async candidate => {
        const imageUrl = `${cdnBaseUrl}/${candidate}.webp`;
        const exists = await testUrl(imageUrl);
        return { candidate, exists };
      })
    );

    for (const { candidate, exists } of results) {
      if (exists) {
        discoveredMaps.add(candidate);
        console.log(`  ✅ Found map on CDN: ${candidate}`);
      }
    }

    // Show progress
    if ((i + batchSize) % 25 === 0 || i + batchSize >= candidatesArray.length) {
      console.log(`  Tested ${Math.min(i + batchSize, candidatesArray.length)}/${candidatesArray.length} candidates...`);
    }

    // Rate limiting between batches
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Save discovered maps to cache for next run
  const allDiscovered = [...discoveredMaps];
  saveDiscoveredMapsCache(allDiscovered);

  console.log(`  📍 CDN probe complete: found ${discoveredMaps.size} maps`);
  return allDiscovered;
}

async function discoverMapTilePattern(mapName: string): Promise<{ baseUrl: string; separator: string } | null> {
  console.log(`  🔍 Discovering tile pattern for ${mapName}...`);

  // Generate all name variations (hyphen, underscore, no separator, etc.)
  const nameVariations = generateNameVariations(mapName);

  // Generate dates for the last 30 days (daily, not monthly)
  const recentDates: string[] = [];
  for (let daysAgo = 0; daysAgo < 30; daysAgo++) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    recentDates.push(date.toISOString().slice(0, 10).replace(/-/g, ''));
  }

  const patterns: Array<{ url: string; baseUrl: string; separator: string; label: string }> = [];

  // For each name variation, try all patterns
  for (const name of nameVariations) {
    // Try recent daily dates first (most likely to work)
    patterns.push(
      ...recentDates.map(date => ({
        url: `https://cdn.metaforge.app/arc-raiders/maps/${name}/${date}/0/0/0.webp`,
        baseUrl: `https://cdn.metaforge.app/arc-raiders/maps/${name}/${date}`,
        separator: '/',
        label: `${name}/${date}`
      }))
    );

    // Then try other known patterns
    patterns.push(
      { url: `https://cdn.metaforge.app/arc-raiders/maps/${name}-new/0/0_0.webp`, baseUrl: `https://cdn.metaforge.app/arc-raiders/maps/${name}-new`, separator: '_', label: `${name}-new` },
      { url: `https://cdn.metaforge.app/arc-raiders/maps/${name}/v2/0/0/0.webp`, baseUrl: `https://cdn.metaforge.app/arc-raiders/maps/${name}/v2`, separator: '/', label: `${name}/v2` },

      // Try version numbers 1-10
      ...Array.from({ length: 10 }, (_, i) => ({
        url: `https://cdn.metaforge.app/arc-raiders/maps/${name}/v${i + 1}/0/0/0.webp`,
        baseUrl: `https://cdn.metaforge.app/arc-raiders/maps/${name}/v${i + 1}`,
        separator: '/',
        label: `${name}/v${i + 1}`
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
    const exists = await testUrl(pattern.url);
    if (exists) {
      console.log(`  ✅ Found pattern: ${pattern.baseUrl} (separator: '${pattern.separator}') after testing ${testedCount}/${patterns.length} patterns`);
      return { baseUrl: pattern.baseUrl, separator: pattern.separator };
    }
    // Show progress every 20 patterns
    if (testedCount % 20 === 0) {
      console.log(`  Tested ${testedCount}/${patterns.length} patterns...`);
    }
    await new Promise(resolve => setTimeout(resolve, 30)); // Rate limiting
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
    'blue-gate': 512,
    'stella-montis': 512
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

async function main() {
  console.log('🚀 Fetching Arc Raiders data...\n');
  if (SKIP_MAP_FETCHES) {
    console.log('⏭️  Map fetching disabled via --skip-maps');
  }

  // Fetch crafting and recycling data from Supabase (with rate limiting)
  console.log('\n📥 Fetching crafting and recycling data from Supabase...');
  await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
  const [craftingMap, recycleMap] = await Promise.all([
    fetchAllCraftingComponents(),
    fetchAllRecycleComponents()
  ]);

  // Fetch and map items from RaidTheory (fallback to Supabase recipe/recycle maps when absent)
  const mappedItems = await fetchRaidTheoryItems(craftingMap, recycleMap);

  // Save items.json
  console.log('\n💾 Saving items.json...');
  fs.writeFileSync(
    path.join(DATA_DIR, 'items.json'),
    JSON.stringify(mappedItems, null, 2)
  );
  console.log(`✅ Saved ${mappedItems.length} items to items.json`);

  // Fetch quests from RaidTheory
  const mappedQuests = await fetchRaidTheoryQuests();

  // Save quests.json
  console.log('\n💾 Saving quests.json...');
  fs.writeFileSync(
    path.join(DATA_DIR, 'quests.json'),
    JSON.stringify(mappedQuests, null, 2)
  );
  console.log(`✅ Saved ${mappedQuests.length} quests to quests.json`);

  let mappedProjects: ProjectData[] = [];
  let projectSource = RAIDTHEORY_PROJECTS_URL;
  try {
    mappedProjects = await fetchRaidTheoryProjects();
  } catch (error) {
    console.warn(`⚠️  RaidTheory projects fetch failed: ${error}`);
  }

  console.log('\n💾 Saving projects.json...');
  fs.writeFileSync(
    path.join(DATA_DIR, 'projects.json'),
    JSON.stringify(mappedProjects, null, 2)
  );
  console.log(`✅ Saved ${mappedProjects.length} projects to projects.json`);

  // Fetch and combine hideout modules from all RaidTheory hideout JSON files
  const mappedHideoutModules = await fetchRaidTheoryHideoutModules();

  console.log('\n💾 Saving hideoutModules.json...');
  fs.writeFileSync(
    path.join(DATA_DIR, 'hideoutModules.json'),
    JSON.stringify(mappedHideoutModules, null, 2)
  );
  console.log(`✅ Saved ${mappedHideoutModules.length} hideout modules to hideoutModules.json`);

  let mapData: MapData[] = [];
  let totalMapMarkers = 0;

  if (!SKIP_MAP_FETCHES) {
    // Fetch map data from Supabase
    console.log('\n📥 Fetching map data from Supabase...');
    await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
    mapData = await fetchAllMapData();
    if (mapData.length === 0) {
      console.warn('⚠️  No map data returned; continuing with empty map dataset.');
    }

    // Save map data
    console.log('\n💾 Saving map data...');
    fs.writeFileSync(
      path.join(DATA_DIR, 'maps.json'),
      JSON.stringify(mapData, null, 2)
    );
    totalMapMarkers = mapData.reduce((sum, m) => sum + m.stats.totalMarkers, 0);
    console.log(`✅ Saved map data with ${totalMapMarkers} markers across ${mapData.length} maps`);

    // Get map names from Supabase markers
    const supabaseMaps = mapData.map(m => m.map);
    console.log(`📍 Maps from Supabase markers: ${supabaseMaps.join(', ') || '(none)'}`);

    // Discover actual available maps by probing the CDN
    // This is resilient to name changes - we check what actually exists
    const cdnMaps = await discoverMapsFromCDN(supabaseMaps);
    console.log(`📍 Maps found on CDN: ${cdnMaps.join(', ') || '(none)'}`);

    // Use CDN-discovered maps as the source of truth (they're what we can actually download)
    // Fall back to Supabase names if CDN discovery fails completely
    const allMaps = cdnMaps.length > 0 ? cdnMaps : supabaseMaps;
    console.log(`📍 Maps to process: ${allMaps.join(', ')}`);
    if (allMaps.length === 0) {
      console.warn('⚠️  No maps available for image/tile download. Skipping map asset fetch.');
    }

    // Download map images
    console.log('\n📥 Downloading map images...');
    await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
    if (allMaps.length > 0) {
      await fetchMapImages(allMaps);
    }

    // Download map tiles for ALL maps (not just discovered ones)
    console.log('\n📥 Downloading map tiles...');
    await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
    if (allMaps.length > 0) {
      await downloadMapTiles(allMaps);
    }

    // Calculate map extents from downloaded tiles
    await calculateMapExtents();
  } else {
    console.log('\n⏭️  Skipping all map-related fetches and downloads.');
    mapData = loadExistingMapData();
    totalMapMarkers = mapData.reduce((sum, m) => sum + m.stats.totalMarkers, 0);
    if (mapData.length > 0) {
      console.log(`📍 Reusing existing map data from maps.json (${mapData.length} maps, ${totalMapMarkers} markers).`);
    } else {
      console.warn('⚠️  No existing maps.json found to reuse while skipping maps.');
    }
  }

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

  for (const item of mappedItems) {
    if (typeof item.imageFilename === 'string' && item.imageFilename.startsWith('http')) {
      const iconUrl = item.imageFilename;
      const filenameFromUrl = iconUrl.split('/').pop();
      const filename = (filenameFromUrl && filenameFromUrl.endsWith('.png'))
        ? filenameFromUrl
        : `${item.id}.png`;
      const iconPath = path.join(ICONS_DIR, filename);

      try {
        // Skip if already exists and processed
        if (fs.existsSync(iconPath) && resizedIcons.has(filename)) {
          skippedIcons++;
          continue;
        }

        // Convert source image to normalized PNG
        const success = await convertWebPToPNG(iconUrl, iconPath);
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
    source: 'https://api.github.com/repos/RaidTheory/arcraiders-data/contents/items (items), https://api.github.com/repos/RaidTheory/arcraiders-data/contents/quests (quests), https://metaforge.app/arc-raiders (maps), https://raw.githubusercontent.com/RaidTheory/arcraiders-data/refs/heads/main/projects.json (projects), https://api.github.com/repos/RaidTheory/arcraiders-data/contents/hideout (hideout modules)',
    staticSource: 'Local static files (projects fallback only)',
    version: '2.2.0',
    itemCount: mappedItems.length,
    questCount: mappedQuests.length,
    projectCount: mappedProjects.length,
    projectSource,
    hideoutModuleCount: mappedHideoutModules.length,
    hideoutSource: RAIDTHEORY_HIDEOUT_CONTENTS_URL,
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
  console.log(`🏗️  Total projects: ${metadata.projectCount}`);
  console.log(`📌 Project source: ${metadata.projectSource}`);
  console.log(`🛠️  Total hideout modules: ${metadata.hideoutModuleCount}`);
  console.log(`📌 Hideout source: ${metadata.hideoutSource}`);
  console.log(`🗺️  Total maps: ${metadata.mapCount}`);
  console.log(`📍 Total map markers: ${metadata.mapMarkerCount}`);

  // Force exit - Sharp's thread pool can keep Node alive
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
