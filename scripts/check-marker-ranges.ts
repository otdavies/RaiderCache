import * as fs from 'fs';
import * as path from 'path';

const mapsDataPath = path.join(process.cwd(), 'public/data/maps.json');
const mapsData = JSON.parse(fs.readFileSync(mapsDataPath, 'utf8'));

for (const mapData of mapsData) {
  if (mapData.markers.length === 0) continue;

  const lats = mapData.markers.map((m: any) => m.lat);
  const lngs = mapData.markers.map((m: any) => m.lng);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  console.log(`=== ${mapData.map.toUpperCase()} ===`);
  console.log(`Markers: ${mapData.markers.length}`);
  console.log(`Lat range: ${minLat} to ${maxLat} (span: ${maxLat - minLat})`);
  console.log(`Lng range: ${minLng} to ${maxLng} (span: ${maxLng - minLng})`);
  console.log(`Center of markers: [${((minLat + maxLat) / 2).toFixed(0)}, ${((minLng + maxLng) / 2).toFixed(0)}]`);
  console.log('');
}
