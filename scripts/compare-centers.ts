// Compare our calculated center vs MetaForge's configured center for Blue Gate

export {}; // Make this a module to avoid global scope conflicts

const worldExtent = [0, 0, 16384, 16384];

// MetaForge's configured center
const metaForgeCenter = [4700, 7500];

// Our calculated center based on worldExtent
const calculatedCenter = [
  (worldExtent[1] + worldExtent[3]) / 2,  // centerLat
  (worldExtent[0] + worldExtent[2]) / 2   // centerLng
];

console.log("Blue Gate Centers:");
console.log("MetaForge center [lat, lng]:", metaForgeCenter);
console.log("Our calculated center [lat, lng]:", calculatedCenter);
console.log("Difference [lat, lng]:", [
  metaForgeCenter[0] - calculatedCenter[0],
  metaForgeCenter[1] - calculatedCenter[1]
]);

// Check marker average from our data
const sampleMarkers = [
  { lat: 4811.154539193269, lng: 9554.42682739263 },
  { lat: 5724.029393705102, lng: 8721.455039154876 },
  { lat: 5040, lng: 6760 }, // GATE APPROACH label
  { lat: 4152.711245589502, lng: 5327.64787521219 }, // THE FOREST
];

const avgLat = sampleMarkers.reduce((sum, m) => sum + m.lat, 0) / sampleMarkers.length;
const avgLng = sampleMarkers.reduce((sum, m) => sum + m.lng, 0) / sampleMarkers.length;

console.log("\nSample marker average [lat, lng]:", [avgLat, avgLng]);
console.log("Closer to MetaForge's center:", metaForgeCenter);
