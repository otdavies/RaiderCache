import * as https from 'https';

const SUPABASE_URL = 'https://unhbvkszwhczbjxgetgk.supabase.co/rest/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuaGJ2a3N6d2hjemJqeGdldGdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ5NjgwMjUsImV4cCI6MjA2MDU0NDAyNX0.gckCmxnlpwwJOGmc5ebLYDnaWaxr5PW31eCrSPR5aRQ';

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

async function main() {
  console.log('Fetching Blue Gate markers from MetaForge Supabase...\n');

  // Query for blue-gate markers - limit to 10 for comparison
  const blueGateMarkers = await fetchSupabase<any[]>('arc_map_data', 'map=eq.blue-gate&limit=10');

  console.log('Response:', JSON.stringify(blueGateMarkers, null, 2).substring(0, 500));

  if (!Array.isArray(blueGateMarkers)) {
    console.error('Response is not an array');
    return;
  }

  console.log(`\nFound ${blueGateMarkers.length} Blue Gate markers\n`);

  // Display first few markers with their coordinates
  blueGateMarkers.slice(0, 5).forEach((marker: any, i: number) => {
    console.log(`Marker ${i + 1}:`);
    console.log(`  Subcategory: ${marker.subcategory}`);
    console.log(`  Lat: ${marker.lat}`);
    console.log(`  Lng: ${marker.lng}`);
    console.log(`  Category: ${marker.category}`);
    console.log('');
  });

  // Check coordinate ranges
  const lats = blueGateMarkers.map((m: any) => m.lat);
  const lngs = blueGateMarkers.map((m: any) => m.lng);

  console.log('Coordinate ranges:');
  console.log(`  Lat: ${Math.min(...lats)} to ${Math.max(...lats)}`);
  console.log(`  Lng: ${Math.min(...lngs)} to ${Math.max(...lngs)}`);
}

main().catch(console.error);
