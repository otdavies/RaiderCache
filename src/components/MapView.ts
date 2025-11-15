import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Item } from '../types/Item';
import { mapLoader, type MapData, type MapMarker, MAP_BOUNDS } from '../utils/mapLoader';
import {
  filterMarkersForItem,
  getRelevantMaps,
  getItemLocationDescription,
  formatSubcategoryName
} from '../utils/itemMarkerMapper';

export interface MapViewConfig {
  item: Item;
  onClose: () => void;
}

export class MapView {
  private config: MapViewConfig;
  private activeMap: string = 'dam';
  private mapData: MapData[] = [];
  private container: HTMLElement | null = null;
  private leafletMaps: Map<string, L.Map> = new Map();
  private debugAdjustments: Record<string, { worldExtent: number[], center: [number, number] }> = {};
  private adjustmentStep: number = 100;
  // DEBUG: Set to true to enable alignment controls for debugging map positioning
  private enableAlignmentControls: boolean = false;

  constructor(config: MapViewConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    // Load map data
    this.mapData = await mapLoader.load();

    // Determine which map to show first
    const relevantMaps = getRelevantMaps(this.config.item);
    if (relevantMaps.length > 0) {
      // Find map with most markers
      const mapMarkerCounts = relevantMaps.map(mapName => {
        const mapData = this.mapData.find(m => m.map === mapName);
        if (!mapData) return { map: mapName, count: 0 };

        const filteredMarkers = filterMarkersForItem(this.config.item, mapData.markers);
        return { map: mapName, count: filteredMarkers.length };
      });

      // Sort by marker count descending
      mapMarkerCounts.sort((a, b) => b.count - a.count);

      // Set active map to one with most markers
      if (mapMarkerCounts[0].count > 0) {
        this.activeMap = mapMarkerCounts[0].map;
      }
    }
  }

  render(container: HTMLElement): void {
    this.container = container;
    const { item } = this.config;
    const relevantMaps = getRelevantMaps(item);

    if (relevantMaps.length === 0) {
      container.innerHTML = `
        <div class="map-view map-view--empty">
          <div class="map-view__header">
            <h2>${item.name} - Locations</h2>
            <button class="modal-close" data-action="close">×</button>
          </div>
          <div class="map-view__empty-state">
            <p>This item is not available on raid maps.</p>
            ${item.foundIn?.includes('Exodus') ? '<p>Purchase from the Exodus vendor in your Hideout.</p>' : ''}
          </div>
        </div>
      `;
      this.attachEventListeners();
      return;
    }

    // Build map data with filtered markers
    const mapsWithMarkers = relevantMaps.map(mapName => {
      const mapData = this.mapData.find(m => m.map === mapName);
      if (!mapData) return null;

      const filteredMarkers = filterMarkersForItem(item, mapData.markers);

      return {
        mapName,
        markers: filteredMarkers,
        isActive: mapName === this.activeMap
      };
    }).filter((m): m is NonNullable<typeof m> => m !== null);

    const totalMarkers = mapsWithMarkers.reduce((sum, m) => sum + m.markers.length, 0);

    container.innerHTML = `
      <div class="map-view">
        <div class="map-view__header">
          <div class="map-view__title">
            <h2>${item.name}</h2>
            <span class="map-view__marker-count">${totalMarkers} location${totalMarkers !== 1 ? 's' : ''}</span>
          </div>
          <button class="modal-close" data-action="close">×</button>
        </div>

        ${this.renderMapTabs(mapsWithMarkers)}

        <div class="map-view__content">
          ${mapsWithMarkers.map(m => this.renderMapCanvas(m)).join('')}
        </div>

        ${this.renderAlignmentControls(this.activeMap)}

        ${this.renderLegend(mapsWithMarkers.find(m => m.isActive))}

        <div class="map-view__footer">
          <p>${getItemLocationDescription(item)}</p>
        </div>
      </div>
    `;

    this.attachEventListeners();

    // Initialize Leaflet maps after DOM is ready
    setTimeout(() => {
      mapsWithMarkers.forEach(mapData => {
        this.initializeLeafletMap(mapData);
      });
    }, 0);
  }

  private renderMapTabs(maps: Array<{ mapName: string; markers: MapMarker[]; isActive: boolean }>): string {
    return `
      <div class="map-view__tabs">
        ${maps.map(m => `
          <button
            class="map-view__tab ${m.isActive ? 'active' : ''}"
            data-map="${m.mapName}"
            ${m.markers.length === 0 ? 'disabled' : ''}>
            ${this.formatMapName(m.mapName)}
            <span class="map-view__tab-count">${m.markers.length}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  private renderMapCanvas(mapData: { mapName: string; markers: MapMarker[]; isActive: boolean }): string {
    return `
      <div class="map-canvas ${mapData.isActive ? 'active' : ''}" data-map="${mapData.mapName}">
        <div id="map-${mapData.mapName}" class="leaflet-map-container"></div>
      </div>
    `;
  }

  private getTileLayerUrl(mapName: string): string {
    // Use locally hosted tiles (downloaded from MetaForge during fetch-data)
    // All maps use standardized flat structure: {z}/{x}_{y}.webp
    const baseUrl = import.meta.env.BASE_URL || '/';
    return `${baseUrl}assets/maps/tiles/${mapName}/{z}/{x}_{y}.webp`;
  }

  private getMapConfig(mapName: string) {
    // MetaForge coordinate space - most maps use 32:1 ratio (tileSize * 32)
    // Blue Gate uses custom 10240×10240
    const configs: Record<string, {
      worldExtent: number[],  // MetaForge coordinate space
      tileSize: number,
      initialZoom: number,
      center: [number, number],
      actualBounds?: [number, number, number, number]  // Actual tile bounds in pixels
    }> = {
      'dam': {
        worldExtent: [0, 0, 8192, 8192],  // 256 * 32
        tileSize: 256,
        initialZoom: 3,
        center: [2653, 3956],  // Center of actual markers
        actualBounds: [0, 0, 4096, 4096]  // 16×16 tiles @ 256px
      },
      'spaceport': {
        worldExtent: [0, 0, 16384, 16384],  // 512 * 32
        tileSize: 512,
        initialZoom: 2.5,
        center: [2398, 3864],  // Center of actual markers
        actualBounds: [0, 0, 4608, 3072]  // 9×6 tiles @ 512px
      },
      'buried-city': {
        worldExtent: [0, 0, 16384, 16384],  // 512 * 32
        tileSize: 512,
        initialZoom: 2,
        center: [4938, 7175],  // Center of actual markers
        actualBounds: [0, 0, 7680, 5120]  // 15×10 tiles @ 512px
      },
      'blue-gate': {
        worldExtent: [1861, 361, 21309, 19809],
        tileSize: 512,
        initialZoom: 2,
        center: [5208, 7110],  // Center of actual markers
        actualBounds: [0, 0, 5120, 4096]  // 10×8 tiles @ 512px
      }
    };

    // Return configured map or sensible defaults for new maps
    if (configs[mapName]) {
      const baseConfig = configs[mapName];
      // Apply debug adjustments if they exist
      if (this.debugAdjustments[mapName]) {
        return {
          ...baseConfig,
          worldExtent: this.debugAdjustments[mapName].worldExtent,
          center: this.debugAdjustments[mapName].center
        };
      }
      return baseConfig;
    }

    // Default config for new maps (most maps use 512px tiles)
    const bounds = MAP_BOUNDS[mapName];
    const worldExtent = [0, 0, 16384, 16384];
    const center: [number, number] = bounds
      ? [(bounds.lat[0] + bounds.lat[1]) / 2, (bounds.lng[0] + bounds.lng[1]) / 2]
      : [8192, 8192];

    console.log(`Using default config for new map: ${mapName}`, { worldExtent, center });

    return {
      worldExtent,
      tileSize: 512,
      initialZoom: 2.75,
      center
    };
  }

  private createCustomCRS(mapName: string): L.CRS {
    const config = this.getMapConfig(mapName);
    const worldExtent = config.worldExtent;
    const tileExtent = [0, 0, config.tileSize, config.tileSize];

    // Calculate transformation parameters (from MetaForge's Ma function)
    const worldMin = { x: worldExtent[0], y: worldExtent[1] };
    const worldMax = { x: worldExtent[2], y: worldExtent[3] };
    const tileMin = { x: tileExtent[0], y: tileExtent[1] };
    const tileMax = { x: tileExtent[2], y: tileExtent[3] };

    // scaleX/scaleY: How much to multiply game coords to get pixel coords at zoom 0
    const scaleX = (tileMax.x - tileMin.x) / (worldMax.x - worldMin.x);
    const offsetX = tileMin.x - scaleX * worldMin.x;
    const scaleY = (tileMax.y - tileMin.y) / (worldMax.y - worldMin.y);
    const offsetY = tileMin.y - scaleY * worldMin.y;

    console.log(`[${mapName}] CRS transformation:`, { scaleX, offsetX, scaleY, offsetY, worldExtent, tileSize: config.tileSize });

    // Create custom CRS with the transformation
    const customCRS = L.extend({}, L.CRS.Simple, {
      transformation: new L.Transformation(scaleX, offsetX, scaleY, offsetY)
    });

    return customCRS;
  }

  private initializeLeafletMap(mapData: { mapName: string; markers: MapMarker[]; isActive: boolean }): void {
    const containerId = `map-${mapData.mapName}`;
    const mapContainer = document.getElementById(containerId);

    if (!mapContainer || this.leafletMaps.has(mapData.mapName)) return;

    const bounds = MAP_BOUNDS[mapData.mapName];
    if (!bounds) {
      console.error(`No bounds found for map: ${mapData.mapName}`);
      return;
    }

    const config = this.getMapConfig(mapData.mapName);
    const maxZoom = 4;
    const tileSize = config.tileSize;
    const worldExtent = config.worldExtent;

    console.log(`[${mapData.mapName}] Map bounds from DB:`, bounds);
    console.log(`[${mapData.mapName}] World extent:`, worldExtent);

    // Create custom CRS with MetaForge transformation
    const customCRS = this.createCustomCRS(mapData.mapName);

    // Create map with custom CRS
    const map = L.map(containerId, {
      crs: customCRS,
      minZoom: 0,
      maxZoom: maxZoom,
      zoomControl: true,
      attributionControl: false
    });

    // Map bounds in MetaForge coordinates - use full worldExtent to allow panning
    const mapBounds = new L.LatLngBounds(
      [worldExtent[1], worldExtent[0]],  // SW corner [lat, lng]
      [worldExtent[3], worldExtent[2]]   // NE corner [lat, lng]
    );

    console.log(`[${mapData.mapName}] Map bounds (MetaForge coords):`, mapBounds);

    // Add tile layer
    const tileUrl = this.getTileLayerUrl(mapData.mapName);
    console.log(`[${mapData.mapName}] Tile URL pattern:`, tileUrl);

    // Don't restrict tile bounds - let tiles render where they exist
    // The CRS transformation handles the coordinate mapping
    const tileLayer = L.tileLayer(tileUrl, {
      minZoom: 0,
      maxZoom: maxZoom,
      maxNativeZoom: maxZoom,
      tileSize: tileSize,
      noWrap: true,
      errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
    });

    tileLayer.on('tileerror', (e: any) => {
      console.error(`[${mapData.mapName}] Tile error:`, e.coords, e.tile.src);
    });

    tileLayer.addTo(map);

    // Use MetaForge's configured center point
    // The worldExtent defines the full coordinate space, but actual map content
    // is typically in a smaller region within that space
    const [centerLat, centerLng] = config.center;

    // Set view with configured zoom
    map.setView([centerLat, centerLng], config.initialZoom);

    console.log(`[${mapData.mapName}] Map initialized. Center:`, [centerLat, centerLng], 'Zoom:', config.initialZoom);

    // Set max bounds to allow viewing the full worldExtent (where markers exist)
    map.setMaxBounds(mapBounds);

    // Add markers
    mapData.markers.forEach(marker => {
      this.addLeafletMarker(map, marker);
    });

    // Store map instance
    this.leafletMaps.set(mapData.mapName, map);
  }

  private getMarkerColor(marker: MapMarker): string {
    // Generate consistent colors based on subcategory for better differentiation
    // Use a hash of the subcategory name to get consistent colors
    const hash = marker.subcategory.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);

    // Create a color based on the hash with good saturation and lightness
    const hue = Math.abs(hash % 360);
    const saturation = 65 + (Math.abs(hash) % 20); // 65-85%
    const lightness = 50 + (Math.abs(hash >> 8) % 15); // 50-65%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  private addLeafletMarker(map: L.Map, marker: MapMarker): void {
    // Use game coordinates directly - the custom CRS will handle the transformation
    const latLng = L.latLng([marker.lat, marker.lng]);

    // Get color based on subcategory for better differentiation
    const color = this.getMarkerColor(marker);

    // Create circle marker
    const circleMarker = L.circleMarker(latLng, {
      radius: 8,
      fillColor: color,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    });

    // Add tooltip
    const tooltipContent = `${formatSubcategoryName(marker.subcategory)}${marker.instance_name ? ': ' + marker.instance_name : ''}`;
    circleMarker.bindTooltip(tooltipContent, {
      permanent: false,
      direction: 'top'
    });

    circleMarker.addTo(map);
  }

  private renderAlignmentControls(mapName: string): string {
    // DEBUG: Enable alignment controls by setting enableAlignmentControls to true
    // Useful for debugging and aligning map tiles to game coordinates
    if (!this.enableAlignmentControls) {
      return '<div class="map-alignment-controls" style="display: none;"></div>';
    }

    const config = this.getMapConfig(mapName);
    const extent = config.worldExtent;
    const center = config.center;

    console.log(`Rendering alignment controls for ${mapName}`, { extent, center });

    return `
      <div class="map-alignment-controls" style="display: block !important; background: #1a1a1a; padding: 20px; border: 2px solid #06b6d4; margin: 0; z-index: 1000; position: relative;">
        <h4 style="color: #06b6d4; margin: 0 0 15px 0; font-size: 16px; font-weight: bold;">MAP ALIGNMENT CONTROLS - ${this.formatMapName(mapName)}</h4>

        <div style="margin-bottom: 20px; padding: 15px; background: #0a0a0a; border-radius: 4px;">
          <label style="display: flex; align-items: center; gap: 15px; color: #fff;">
            <span style="font-weight: bold; font-size: 14px; min-width: 80px;">Step Size:</span>
            <input
              type="range"
              id="adjustment-step-slider"
              min="1"
              max="500"
              value="${this.adjustmentStep}"
              style="flex: 1; cursor: pointer; accent-color: #06b6d4;"
            />
            <span id="step-value" style="color: #06b6d4; font-weight: bold; font-size: 14px; min-width: 60px;">${this.adjustmentStep}</span>
          </label>
        </div>

        <div class="alignment-grid" style="display: flex; gap: 20px; margin-bottom: 15px; flex-wrap: wrap;">
          <div class="alignment-section" style="display: flex; align-items: center; gap: 10px;">
            <span style="color: #fff; font-weight: bold; font-size: 14px;">Scale:</span>
            <button class="btn-small" data-action="scale-down" style="background: #333; color: #fff; border: 2px solid #666; padding: 10px 20px; cursor: pointer; font-size: 20px; font-weight: bold; border-radius: 4px;">-</button>
            <button class="btn-small" data-action="scale-up" style="background: #333; color: #fff; border: 2px solid #666; padding: 10px 20px; cursor: pointer; font-size: 20px; font-weight: bold; border-radius: 4px;">+</button>
          </div>
          <div class="alignment-section" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span style="color: #fff; font-weight: bold; font-size: 14px;">Move:</span>
            <button class="btn-small" data-action="move-up" style="background: #333; color: #fff; border: 2px solid #666; padding: 10px 20px; cursor: pointer; font-size: 16px; font-weight: bold; border-radius: 4px;">↑ 8</button>
            <button class="btn-small" data-action="move-down" style="background: #333; color: #fff; border: 2px solid #666; padding: 10px 20px; cursor: pointer; font-size: 16px; font-weight: bold; border-radius: 4px;">↓ 2</button>
            <button class="btn-small" data-action="move-left" style="background: #333; color: #fff; border: 2px solid #666; padding: 10px 20px; cursor: pointer; font-size: 16px; font-weight: bold; border-radius: 4px;">← 4</button>
            <button class="btn-small" data-action="move-right" style="background: #333; color: #fff; border: 2px solid #666; padding: 10px 20px; cursor: pointer; font-size: 16px; font-weight: bold; border-radius: 4px;">→ 6</button>
          </div>
        </div>
        <div class="alignment-values" style="display: flex; flex-direction: column; gap: 10px; padding-top: 15px; border-top: 1px solid #666;">
          <code style="color: #06b6d4; background: #0a0a0a; padding: 8px; font-size: 14px; display: block; font-family: monospace;">worldExtent: [${extent.join(', ')}]</code>
          <code style="color: #06b6d4; background: #0a0a0a; padding: 8px; font-size: 14px; display: block; font-family: monospace;">center: [${center.join(', ')}]</code>
        </div>
      </div>
    `;
  }

  private renderLegend(activeMapData?: { mapName: string; markers: MapMarker[]; isActive: boolean }): string {
    if (!activeMapData || activeMapData.markers.length === 0) {
      return `
        <div class="map-view__legend">
          <p class="map-view__legend-empty">No locations found on this map</p>
        </div>
      `;
    }

    // Count markers by subcategory and get a sample marker for color
    const subcategoryCounts: Record<string, { count: number; marker: MapMarker }> = {};
    activeMapData.markers.forEach(m => {
      if (!subcategoryCounts[m.subcategory]) {
        subcategoryCounts[m.subcategory] = { count: 0, marker: m };
      }
      subcategoryCounts[m.subcategory].count++;
    });

    // Sort by count descending
    const sortedSubcategories = Object.entries(subcategoryCounts)
      .sort(([, a], [, b]) => b.count - a.count);

    return `
      <div class="map-view__legend">
        <h4>Legend:</h4>
        <div class="map-view__legend-items">
          ${sortedSubcategories
        .map(([subcategory, data]) => {
          const color = this.getMarkerColor(data.marker);
          return `
                <span class="legend-item">
                  <span class="legend-item__marker" style="background-color: ${color}; border: 2px solid #ffffff;"></span>
                  ${formatSubcategoryName(subcategory)} (${data.count})
                </span>
              `;
        })
        .join('')}
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    // Close button
    const closeBtn = this.container.querySelector('[data-action="close"]');
    closeBtn?.addEventListener('click', () => this.config.onClose());

    // Tab switching
    const tabs = this.container.querySelectorAll('[data-map]');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const button = e.currentTarget as HTMLElement;
        const mapName = button.getAttribute('data-map');
        if (mapName && mapName !== this.activeMap) {
          this.switchTab(mapName);
        }
      });
    });

    // Alignment control buttons
    const alignmentButtons = this.container.querySelectorAll('.map-alignment-controls [data-action]');
    alignmentButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        const action = btn.getAttribute('data-action');
        if (action) {
          this.handleAlignmentAction(action);
        }
      });
    });

    // Step size slider
    const stepSlider = this.container.querySelector('#adjustment-step-slider') as HTMLInputElement;
    const stepValue = this.container.querySelector('#step-value');
    if (stepSlider && stepValue) {
      stepSlider.addEventListener('input', (e) => {
        const slider = e.target as HTMLInputElement;
        this.adjustmentStep = parseInt(slider.value, 10);
        stepValue.textContent = this.adjustmentStep.toString();
      });
    }
  }

  private handleAlignmentAction(action: string): void {
    console.log(`Alignment action: ${action}`);
    const mapName = this.activeMap;
    const config = this.getMapConfig(mapName);

    // Initialize adjustments if not exists
    if (!this.debugAdjustments[mapName]) {
      this.debugAdjustments[mapName] = {
        worldExtent: [...config.worldExtent],
        center: [...config.center] as [number, number]
      };
    }

    const adj = this.debugAdjustments[mapName];
    const step = this.adjustmentStep;  // Use slider value for adjustments

    console.log('Before adjustment:', { worldExtent: [...adj.worldExtent], center: [...adj.center], step });

    switch (action) {
      case 'scale-up':
        // Increase max values (make coordinate space larger)
        adj.worldExtent[2] += step;
        adj.worldExtent[3] += step;
        break;
      case 'scale-down':
        // Decrease max values (make coordinate space smaller)
        adj.worldExtent[2] = Math.max(1024, adj.worldExtent[2] - step);
        adj.worldExtent[3] = Math.max(1024, adj.worldExtent[3] - step);
        break;
      case 'move-up':
        // Decrease minY and maxY (shift map down visually)
        adj.worldExtent[1] -= step;
        adj.worldExtent[3] -= step;
        break;
      case 'move-down':
        // Increase minY and maxY (shift map up visually)
        adj.worldExtent[1] += step;
        adj.worldExtent[3] += step;
        break;
      case 'move-left':
        // Decrease minX and maxX (shift map right visually)
        adj.worldExtent[0] -= step;
        adj.worldExtent[2] -= step;
        break;
      case 'move-right':
        // Increase minX and maxX (shift map left visually)
        adj.worldExtent[0] += step;
        adj.worldExtent[2] += step;
        break;
    }

    console.log('After adjustment:', { worldExtent: [...adj.worldExtent], center: [...adj.center] });

    // Reload the map with new configuration
    this.reloadMap(mapName);
  }

  private reloadMap(mapName: string): void {
    console.log(`Reloading map: ${mapName}`, this.debugAdjustments[mapName]);

    // Remove existing Leaflet map instance
    const existingMap = this.leafletMaps.get(mapName);
    if (existingMap) {
      existingMap.remove();
      this.leafletMaps.delete(mapName);
    }

    // Clear the container HTML to ensure clean state for Leaflet
    const containerId = `map-${mapName}`;
    const mapContainer = document.getElementById(containerId);
    if (mapContainer) {
      mapContainer.innerHTML = '';
    }

    // Get updated marker data
    const mapData = this.mapData.find(m => m.map === mapName);
    if (!mapData) return;

    const { item } = this.config;
    const filteredMarkers = filterMarkersForItem(item, mapData.markers);

    // Reinitialize the map with new config
    this.initializeLeafletMap({
      mapName,
      markers: filteredMarkers,
      isActive: true
    });

    // Update the alignment controls display
    if (this.container) {
      const controlsContainer = this.container.querySelector('.map-alignment-controls');
      if (controlsContainer) {
        const newControls = this.renderAlignmentControls(mapName);
        controlsContainer.outerHTML = newControls;

        // Re-attach event listeners for the new controls
        const alignmentButtons = this.container.querySelectorAll('.map-alignment-controls [data-action]');
        alignmentButtons.forEach(button => {
          button.addEventListener('click', (e) => {
            const btn = e.currentTarget as HTMLElement;
            const action = btn.getAttribute('data-action');
            if (action) {
              this.handleAlignmentAction(action);
            }
          });
        });

        // Re-attach slider event listener
        const stepSlider = this.container.querySelector('#adjustment-step-slider') as HTMLInputElement;
        const stepValue = this.container.querySelector('#step-value');
        if (stepSlider && stepValue) {
          stepSlider.addEventListener('input', (e) => {
            const slider = e.target as HTMLInputElement;
            this.adjustmentStep = parseInt(slider.value, 10);
            stepValue.textContent = this.adjustmentStep.toString();
          });
        }
      }
    }
  }

  private switchTab(mapName: string): void {
    if (!this.container) return;

    this.activeMap = mapName;

    // Update tab active states
    const tabs = this.container.querySelectorAll('.map-view__tab');
    tabs.forEach(tab => {
      const tabMap = tab.getAttribute('data-map');
      if (tabMap === mapName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Update canvas active states
    const canvases = this.container.querySelectorAll('.map-canvas');
    canvases.forEach(canvas => {
      const canvasMap = canvas.getAttribute('data-map');
      if (canvasMap === mapName) {
        canvas.classList.add('active');
      } else {
        canvas.classList.remove('active');
      }
    });

    // Invalidate Leaflet map size (important when switching tabs)
    const leafletMap = this.leafletMaps.get(mapName);
    if (leafletMap) {
      setTimeout(() => {
        leafletMap.invalidateSize();
      }, 100);
    }

    // Update alignment controls
    const alignmentControlsContainer = this.container.querySelector('.map-alignment-controls');
    if (alignmentControlsContainer) {
      const newControls = this.renderAlignmentControls(mapName);
      alignmentControlsContainer.outerHTML = newControls;

      // Re-attach event listeners for the new controls if they exist
      const alignmentButtons = this.container.querySelectorAll('.map-alignment-controls [data-action]');
      alignmentButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          const btn = e.currentTarget as HTMLElement;
          const action = btn.getAttribute('data-action');
          if (action) {
            this.handleAlignmentAction(action);
          }
        });
      });

      // Re-attach slider event listener
      const stepSlider = this.container.querySelector('#adjustment-step-slider') as HTMLInputElement;
      const stepValue = this.container.querySelector('#step-value');
      if (stepSlider && stepValue) {
        stepSlider.addEventListener('input', (e) => {
          const slider = e.target as HTMLInputElement;
          this.adjustmentStep = parseInt(slider.value, 10);
          stepValue.textContent = this.adjustmentStep.toString();
        });
      }
    }

    // Update legend
    const { item } = this.config;
    const mapData = this.mapData.find(m => m.map === mapName);
    if (mapData) {
      const filteredMarkers = filterMarkersForItem(item, mapData.markers);
      const legendContainer = this.container.querySelector('.map-view__legend');
      if (legendContainer) {
        legendContainer.outerHTML = this.renderLegend({
          mapName,
          markers: filteredMarkers,
          isActive: true
        });
      }
    }
  }

  private formatMapName(mapName: string): string {
    // Known map name overrides
    const names: Record<string, string> = {
      'dam': 'Dam',
      'buried-city': 'Buried City',
      'spaceport': 'Spaceport',
      'blue-gate': 'Blue Gate'
    };

    // Use override if available, otherwise auto-format kebab-case to Title Case
    if (names[mapName]) {
      return names[mapName];
    }

    // Convert kebab-case to Title Case (e.g., "new-raid-zone" -> "New Raid Zone")
    return mapName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  hide(): void {
    // Clean up Leaflet maps
    this.leafletMaps.forEach(map => map.remove());
    this.leafletMaps.clear();

    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
