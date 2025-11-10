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

console.log(`Total items: ${items.length}`);
console.log(`Items with missing or zero price: ${missingPriceItems.length}`);
console.log(`\nPercentage: ${((missingPriceItems.length / items.length) * 100).toFixed(2)}%`);

// Group by category/type
const byType: Record<string, number> = {};
missingPriceItems.forEach(item => {
  byType[item.type] = (byType[item.type] || 0) + 1;
});

console.log('\nItems with missing prices by type:');
Object.entries(byType)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

console.log('\n\nSample items with missing prices:');
missingPriceItems.slice(0, 20).forEach(item => {
  console.log(`  - ${item.name.en || item.name['en-US'] || 'Unknown'} (${item.id}) - Type: ${item.type}, Rarity: ${item.rarity || 'N/A'}`);
});
