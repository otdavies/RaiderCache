// Test if our CRS transformation matches MetaForge's for Blue Gate

export {}; // Make this a module to avoid global scope conflicts

// MetaForge's Ma function (extracted from Cty1u74R.js)
function Ma(worldMin: {x: number, y: number}, worldMax: {x: number, y: number}, tileMin: {x: number, y: number}, tileMax: {x: number, y: number}) {
  const scaleX = (tileMax.x - tileMin.x) / (worldMax.x - worldMin.x);
  const offsetX = tileMin.x - scaleX * worldMin.x;
  const scaleY = (tileMax.y - tileMin.y) / (worldMax.y - worldMin.y);
  const offsetY = tileMin.y - scaleY * worldMin.y;
  return { scaleX, offsetX, scaleY, offsetY };
}

// Blue Gate configuration
const worldExtent = [0, 0, 16384, 16384];
const tileExtent = [0, 0, 512, 512];

const worldMin = { x: worldExtent[0], y: worldExtent[1] };
const worldMax = { x: worldExtent[2], y: worldExtent[3] };
const tileMin = { x: tileExtent[0], y: tileExtent[1] };
const tileMax = { x: tileExtent[2], y: tileExtent[3] };

// Calculate transformation
const transform = Ma(worldMin, worldMax, tileMin, tileMax);

console.log('Blue Gate CRS Transformation:');
console.log(transform);

// Test with a known marker coordinate from MetaForge
// Example: GATE APPROACH label at game coords (5040, 6760)
const testMarker = { lat: 5040, lng: 6760 };

// Apply Leaflet's transformation formula: pixelCoord = scaleX * gameCoord + offsetX
const pixelLat = transform.scaleY * testMarker.lat + transform.offsetY;
const pixelLng = transform.scaleX * testMarker.lng + transform.offsetX;

console.log('\nTest marker (GATE APPROACH):');
console.log('Game coordinates:', testMarker);
console.log('Pixel coordinates at zoom 0:', { lat: pixelLat, lng: pixelLng });

// Test several markers from Supabase
const testMarkers = [
  { name: 'Marker 1', lat: 4811.154539193269, lng: 9554.42682739263 },
  { name: 'Marker 2', lat: 5724.029393705102, lng: 8721.455039154876 },
  { name: 'THE FOREST label', lat: 4152.711245589502, lng: 5327.64787521219 },
];

console.log('\nAdditional test markers:');
testMarkers.forEach(marker => {
  const pLat = transform.scaleY * marker.lat + transform.offsetY;
  const pLng = transform.scaleX * marker.lng + transform.offsetX;
  console.log(`${marker.name}: game (${marker.lat}, ${marker.lng}) -> pixel (${pLat.toFixed(2)}, ${pLng.toFixed(2)})`);
});

// Expected values at zoom 0 for a 512x512 tile coordinate space
console.log('\nExpected pixel range at zoom 0:');
console.log('Entire map: 0 to 512');
console.log('Markers should be roughly in range 100-300 for this map');
