// Extract Blue Gate label coordinates from MetaForge's CHFpal15.js
//From the minified code, Blue Gate labels (variable 'c'):

const metaForgeBlueGateLabels = [
  // Region labels
  { lat: 5040, lng: 6760, text: "GATE APPROACH" },
  { lat: 4152.711245589502, lng: 5327.64787521219, text: "THE FOREST" },
  { lat: 3693.925824918524, lng: 8428.712831743645, text: "THE MOUNTAINS" },
  { lat: 6403.559010425374, lng: 7206.832313853291, text: "FARMLANDS" },

  // Loot Zone labels
  { lat: 5232.590180780451, lng: 6805.195662139333, text: "Checkpoint" },
  { lat: 4683.097618880715, lng: 8136.555080848618, text: "Warehouse Complex" },
  { lat: 3974.9247818965955, lng: 5557.164848407716, text: "Raider's Refuge" },
  { lat: 3227.508110117385, lng: 6072.091529203894, text: "Village" },
  { lat: 7131.642497766753, lng: 7489.023474249582, text: "Ancient Fort" },
  { lat: 3432.5391670656627, lng: 9204.45216136716, text: "Pilgrim's Peak" },
];

// These are in game coordinate space
// worldExtent: [0, 0, 16384, 16384]
// tileExtent: [0, 0, 512, 512]

console.log("MetaForge Blue Gate label coordinates:");
console.log("Min lat:", Math.min(...metaForgeBlueGateLabels.map(l => l.lat)));
console.log("Max lat:", Math.max(...metaForgeBlueGateLabels.map(l => l.lat)));
console.log("Min lng:", Math.min(...metaForgeBlueGateLabels.map(l => l.lng)));
console.log("Max lng:", Math.max(...metaForgeBlueGateLabels.map(l => l.lng)));

// Expected transformation
const scaleX = 512 / 16384; // 0.03125
const scaleY = 512 / 16384; // 0.03125

console.log("\nTransformation:");
console.log("scaleX:", scaleX);
console.log("scaleY:", scaleY);

console.log("\nSample pixel coordinates at zoom 0:");
metaForgeBlueGateLabels.slice(0, 3).forEach(label => {
  const pixelX = label.lng * scaleX;
  const pixelY = label.lat * scaleY;
  console.log(`${label.text}: game (${label.lat}, ${label.lng}) -> pixel (${pixelY}, ${pixelX})`);
});
