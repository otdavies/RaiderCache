import type { Item } from '../types/Item';
import type { MapMarker } from './mapLoader';

/**
 * Determine which marker subcategories are relevant for a given item
 */
export function getRelevantMarkerSubcategories(item: Item): string[] {
  const subcategories: Set<string> = new Set();

  // Nature items → nature gather points
  if (item.type === 'Nature' || item.foundIn?.includes('Nature')) {
    subcategories.add('mushroom');
    subcategories.add('prickly-pear');
    subcategories.add('great-mullein');
    subcategories.add('apricot');
    subcategories.add('agave');
  }

  // Weapons → weapon cases
  if (item.type === 'Weapon' || item.type.toLowerCase().includes('weapon')) {
    subcategories.add('weapon_case');
  }

  // Medical items → med crates
  if (item.type === 'Medical' || item.type.toLowerCase().includes('medical')) {
    subcategories.add('med_crate');
  }

  // Ammo → ammo crates
  if (item.type === 'Ammo' || item.type.toLowerCase().includes('ammo')) {
    subcategories.add('ammo_crate');
  }

  // Utility items → utility crates
  if (item.type === 'Utility' || item.type.toLowerCase().includes('utility')) {
    subcategories.add('utility_crate');
  }

  // ARC zone → ARC enemy spawns and ARC containers
  if (item.foundIn?.includes('ARC')) {
    // ARC enemies
    subcategories.add('tick');
    subcategories.add('wasp');
    subcategories.add('sentinel');
    subcategories.add('bastion');
    subcategories.add('turret');
    subcategories.add('pop');
    subcategories.add('fireball');
    subcategories.add('rocketeer');
    subcategories.add('snitch');
    subcategories.add('hornet');
    subcategories.add('bison');
    subcategories.add('rollbot');
    subcategories.add('bombardier');
    subcategories.add('queen');
    // ARC containers
    subcategories.add('arc_husk');
    subcategories.add('arc_courier');
    subcategories.add('arc_probe');
    subcategories.add('baron_husk');
  }

  // Raider zone → raider caches
  if (item.foundIn?.includes('Raider')) {
    subcategories.add('raider_cache');
  }

  // Security zone → security containers
  if (item.foundIn?.includes('Security')) {
    subcategories.add('security_breach');
    subcategories.add('locker');
  }

  // If we have specific subcategories, return them
  if (subcategories.size > 0) {
    return Array.from(subcategories);
  }

  // Default fallback: show all general loot containers
  return [
    'base_container',
    'breachable_container',
    'basket',
    'locker',
    'car',
    'utility_crate',
    'bag',
    'box'
  ];
}

/**
 * Determine which maps are relevant for a given item
 * Returns all maps by default
 */
export function getRelevantMaps(item: Item): string[] {
  // Hideout vendor items don't have map locations
  if (item.foundIn?.includes('Exodus') || item.foundIn?.includes('Hideout')) {
    return [];
  }

  // Default: show all raid maps
  return ['dam', 'buried-city', 'spaceport', 'blue-gate'];
}

/**
 * Filter markers to show only those relevant to the item
 */
export function filterMarkersForItem(item: Item, markers: MapMarker[]): MapMarker[] {
  const relevantSubcategories = getRelevantMarkerSubcategories(item);

  return markers.filter(marker =>
    relevantSubcategories.includes(marker.subcategory)
  );
}

/**
 * Get a human-readable description of where to find the item
 */
export function getItemLocationDescription(item: Item): string {
  if (!item.foundIn || item.foundIn.length === 0) {
    return 'Search for loot containers';
  }

  if (item.foundIn.includes('ARC')) {
    return 'Hunt ARC enemies or search ARC containers';
  }

  if (item.foundIn.includes('Raider')) {
    return 'Search Raider camps and caches';
  }

  if (item.foundIn.includes('Nature')) {
    return 'Gather from nature resource nodes';
  }

  const zones = item.foundIn.filter(z => z !== 'Exodus' && z !== 'Hideout');
  if (zones.length > 0) {
    return `Search ${zones.join(', ')} zones`;
  }

  return 'Search for loot containers';
}

/**
 * Format marker subcategory name for display
 */
export function formatSubcategoryName(subcategory: string): string {
  // Handle special cases
  const specialNames: Record<string, string> = {
    'arc_husk': 'ARC Husk',
    'arc_courier': 'ARC Courier',
    'arc_probe': 'ARC Probe',
    'baron_husk': 'Baron Husk',
    'med_crate': 'Medical Crate',
    'prickly-pear': 'Prickly Pear',
    'great-mullein': 'Great Mullein'
  };

  if (specialNames[subcategory]) {
    return specialNames[subcategory];
  }

  // Default: capitalize and replace underscores/hyphens with spaces
  return subcategory
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
