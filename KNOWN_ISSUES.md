# Known Issues

## Icon Size Inconsistency (26 files)

**Status**: Requires manual intervention due to Windows file locking

**Affected Files** (26 icons in WebP format instead of PNG, sized 348x348 or 348x174 instead of 128x128):

- arc_motion_core.png, arc_powercell.png, arpeggio.png, battery.png
- blaze_grenade.png, breathtaking_snow_globe.png, burletta.png, combat_i.png
- compensator_i.png, crumpled_plastic_bottle.png, dog_collar.png, extended_light_mag_i.png
- flame_spray.png, leaper_pulse_unit.png, light_impact_grenade.png, light_shield.png
- moss.png, remote_raider_flare.png, resin.png, silencer_i.png
- stable_stock_i.png, steel_spring.png, stitcher.png, tactical_i.png
- venator.png, vulcano.png

**Root Cause**:
These files are downloaded in WebP format from the source and need to be converted to PNG and resized to 128x128. However, Windows file locking prevents the automated conversion process from completing.

**Solutions**:

### Option 1: Manual Fix (Recommended)
1. Close all applications (VSCode, Windows Explorer previews, etc.)
2. Run: `node manual-fix-icons.cjs` (see scripts directory)
3. If still locked, restart your machine and try again

### Option 2: CI/CD Fix
These files will be automatically fixed during deployment where file locking isn't an issue.

### Option 3: Delete and Re-download
```bash
# Delete the problematic files
rm public/assets/icons/{arc_motion_core,arc_powercell,arpeggio,battery,blaze_grenade,breathtaking_snow_globe,burletta,combat_i,compensator_i,crumpled_plastic_bottle,dog_collar,extended_light_mag_i,flame_spray,leaper_pulse_unit,light_impact_grenade,light_shield,moss,remote_raider_flare,resin,silencer_i,stable_stock_i,steel_spring,stitcher,tactical_i,venator,vulcano}.png

# Clear resize marker
rm public/assets/icons/.resized

# Re-download
npm run fetch-data
```

**Testing**:
Run `npx tsx scripts/test-icon-sizes.ts` to verify all icons are 128x128 PNG format.

**Impact**:
- 91.3% of icons (272/298) are correctly sized and formatted
- The 26 outlier icons still function but are larger than optimal
- This will slightly increase initial page load time for affected icons
