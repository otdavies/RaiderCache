export interface MapMarker {
  id: string;
  subcategory: string;
  lat: number;
  lng: number;
  map: string;
  category: string;
  instance_name?: string;
  created_at: string;
  updated_at: string;
}

export interface MapData {
  map: string;
  markers: MapMarker[];
  stats: {
    totalMarkers: number;
    byCategory: Record<string, number>;
    bySubcategory: Record<string, number>;
  };
}

export interface MapBounds {
  lat: [number, number];  // [min, max]
  lng: [number, number];  // [min, max]
}

// MAP_BOUNDS will be computed dynamically from marker data
export const MAP_BOUNDS: Record<string, MapBounds> = {};

class MapDataLoader {
  private static instance: MapDataLoader;
  private mapData: MapData[] | null = null;
  private loading: Promise<MapData[]> | null = null;

  private constructor() {}

  static getInstance(): MapDataLoader {
    if (!MapDataLoader.instance) {
      MapDataLoader.instance = new MapDataLoader();
    }
    return MapDataLoader.instance;
  }

  private computeBoundsForMap(mapData: MapData): MapBounds {
    if (mapData.markers.length === 0) {
      // Default bounds if no markers
      return { lat: [0, 8192], lng: [0, 8192] };
    }

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    mapData.markers.forEach(marker => {
      minLat = Math.min(minLat, marker.lat);
      maxLat = Math.max(maxLat, marker.lat);
      minLng = Math.min(minLng, marker.lng);
      maxLng = Math.max(maxLng, marker.lng);
    });

    // Add 5% padding to bounds
    const latPadding = (maxLat - minLat) * 0.05;
    const lngPadding = (maxLng - minLng) * 0.05;

    return {
      lat: [minLat - latPadding, maxLat + latPadding],
      lng: [minLng - lngPadding, maxLng + lngPadding]
    };
  }

  async load(): Promise<MapData[]> {
    // Return cached data if available
    if (this.mapData) return this.mapData;

    // Return existing promise if already loading
    if (this.loading) return this.loading;

    // Start loading - use BASE_URL from Vite config
    const baseUrl = import.meta.env.BASE_URL || '/';
    this.loading = fetch(`${baseUrl}data/maps.json`)
      .then(response => response.json())
      .then(data => {
        this.mapData = data;

        // Compute bounds for each map dynamically
        data.forEach((mapData: MapData) => {
          MAP_BOUNDS[mapData.map] = this.computeBoundsForMap(mapData);
        });

        console.log('Computed MAP_BOUNDS:', MAP_BOUNDS);

        this.loading = null;
        return data;
      })
      .catch(error => {
        console.error('Failed to load map data:', error);
        this.loading = null;
        return [];
      });

    return this.loading;
  }

  getMarkersForMap(mapName: string): MapMarker[] {
    const map = this.mapData?.find(m => m.map === mapName);
    return map?.markers || [];
  }

  getAllMaps(): string[] {
    return this.mapData?.map(m => m.map) || [];
  }

  filterMarkers(
    markers: MapMarker[],
    filters: {
      categories?: string[];
      subcategories?: string[];
    }
  ): MapMarker[] {
    return markers.filter(marker => {
      if (filters.categories && filters.categories.length > 0) {
        if (!filters.categories.includes(marker.category)) {
          return false;
        }
      }
      if (filters.subcategories && filters.subcategories.length > 0) {
        if (!filters.subcategories.includes(marker.subcategory)) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Convert game coordinates to pixel positions on a 100% width image
   * Returns percentages (0-100) for positioning
   */
  coordsToPercent(lat: number, lng: number, mapName: string): { x: number; y: number } {
    const bounds = MAP_BOUNDS[mapName];
    if (!bounds) {
      console.warn(`No bounds found for map: ${mapName}`);
      return { x: 50, y: 50 }; // Center fallback
    }

    const latRange = bounds.lat[1] - bounds.lat[0];
    const lngRange = bounds.lng[1] - bounds.lng[0];

    // Normalize to 0-1 range
    const normalizedLat = (lat - bounds.lat[0]) / latRange;
    const normalizedLng = (lng - bounds.lng[0]) / lngRange;

    // Convert to percentage
    // Note: Y axis is inverted (0 at top in CSS)
    return {
      x: normalizedLng * 100,
      y: (1 - normalizedLat) * 100
    };
  }
}

export const mapLoader = MapDataLoader.getInstance();
