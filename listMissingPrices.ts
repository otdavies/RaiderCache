import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Item {
  id: string;
  name: Record<string, string>;
  value: number;
  type: string;
  rarity?: string;
}

const itemsPath = path.join(__dirname, 'public', 'data', 'items.json');
const items: Item[] = JSON.parse(fs.readFileSync(itemsPath, 'utf-8'));

const missingPriceItems = items.filter(item => !item.value || item.value === 0);

console.log('All items with missing prices:\n');
missingPriceItems.forEach(item => {
  console.log(`${item.name.en || item.name['en-US'] || 'Unknown'} (${item.id})`);
  console.log(`  Type: ${item.type}, Rarity: ${item.rarity || 'N/A'}`);
  console.log('');
});
