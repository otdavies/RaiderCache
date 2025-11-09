import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main';
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const ICONS_DIR = path.join(PUBLIC_DIR, 'assets', 'icons');

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

    let downloadedIcons = 0;
    let skippedIcons = 0;

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

        // Skip if already exists
        if (fs.existsSync(iconPath)) {
          skippedIcons++;
          continue;
        }

        try {
          await downloadFile(iconUrl, iconPath);
          downloadedIcons++;

          // Log progress every 10 icons
          if (downloadedIcons % 10 === 0) {
            console.log(`  Downloaded ${downloadedIcons} icons...`);
          }
        } catch (error) {
          console.warn(`  ⚠️  Failed to download icon: ${filename}`);
        }
      }
    }

    console.log(`✅ Downloaded ${downloadedIcons} new icons (${skippedIcons} already existed)`);
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
