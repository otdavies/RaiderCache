/**
 * Mapping of item IDs to ARC enemy types that drop them
 */

export interface EnemyDropInfo {
  enemy: string;
  displayName: string;
  tier?: 'Standard' | 'Elite';
}

/**
 * Map item IDs to their ARC enemy sources
 */
export const ENEMY_DROPS: Record<string, EnemyDropInfo> = {
  // Wasp enemy drops
  'wasp-driver': { enemy: 'wasp', displayName: 'Wasp' },
  'damaged-wasp-driver': { enemy: 'wasp', displayName: 'Wasp' },

  // Hornet enemy drops
  'hornet-driver': { enemy: 'hornet', displayName: 'Hornet' },
  'danaged-hornet-driver': { enemy: 'hornet', displayName: 'Hornet' },

  // Sentinel enemy drops
  'sentinel-part': { enemy: 'sentinel', displayName: 'Sentinel' },
  'sentinel-firing-core': { enemy: 'sentinel', displayName: 'Sentinel' },

  // Tick enemy drops
  'tick-pod': { enemy: 'tick', displayName: 'Tick' },
  'damaged-tick-pod': { enemy: 'tick', displayName: 'Tick' },

  // Fireball enemy drops
  'fireball-burner': { enemy: 'fireball', displayName: 'Fireball' },
  'damaged-fireball-burner': { enemy: 'fireball', displayName: 'Fireball' },

  // Bastion enemy drops
  'bastion-part': { enemy: 'bastion', displayName: 'Bastion' },
  'bastion-cell': { enemy: 'bastion', displayName: 'Bastion' },

  // Bombardier enemy drops
  'bombardier-cell': { enemy: 'bombardier', displayName: 'Bombardier' },

  // Surveyor enemy drops
  'surveyor-vault': { enemy: 'surveyor', displayName: 'Surveyor' },

  // Snitch enemy drops
  'snitch-scanner': { enemy: 'snitch', displayName: 'Snitch' },

  // Rocketeer enemy drops
  'rocketeer-part': { enemy: 'rocketeer', displayName: 'Rocketeer' },
  'rocketeer-driver': { enemy: 'rocketeer', displayName: 'Rocketeer' },
  'damaged-rocketeer-part': { enemy: 'rocketeer', displayName: 'Rocketeer' },

  // Bison enemy drops
  'bison-driver': { enemy: 'bison', displayName: 'Bison' },

  // Leaper enemy drops
  'leaper-pulse-unit': { enemy: 'leaper', displayName: 'Leaper' },

  // Pop enemy drops
  'pop-trigger': { enemy: 'pop', displayName: 'Pop' },

  // ARC Motion Core
  'arc-motion-core': { enemy: 'arc', displayName: 'ARC Enemies' },
  'damaged-arc-motion-core': { enemy: 'arc', displayName: 'ARC Enemies' },

  // ARC Powercells
  'arc-powercell': { enemy: 'arc', displayName: 'ARC Enemies' },
  'damaged-arc-powercell': { enemy: 'arc', displayName: 'ARC Enemies' },
  'advanced-arc-powercell': { enemy: 'arc', displayName: 'Elite ARC Enemies', tier: 'Elite' },
};

/**
 * Get enemy drop information for an item
 */
export function getEnemyDropInfo(itemId: string): EnemyDropInfo | null {
  return ENEMY_DROPS[itemId] || null;
}

/**
 * Check if an item is an ARC enemy drop
 */
export function isEnemyDrop(itemId: string): boolean {
  return itemId in ENEMY_DROPS;
}
