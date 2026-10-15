// Free OpenStreetMap raster style for MapLibre. No API key needed.
// Note: tile.openstreetmap.org is meant for light usage
// (https://operations.osmfoundation.org/policies/tiles/). For a large public
// release, switch the tile URL to a provider/self-hosted server.
export const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
    },
  ],
};