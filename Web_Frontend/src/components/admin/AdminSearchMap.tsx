import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import type { SearchResultItem } from '../../pages/admin/AdminSearchPage.tsx';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_ID } from '../../lib/googleMaps.ts';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

type AdminSearchMapProps = {
  results: SearchResultItem[];
  selectedId: string | null;
  onSelect: (item: SearchResultItem) => void;
};

function AdminSearchMap({ results, selectedId, onSelect }: AdminSearchMapProps) {
  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={DEFAULT_ZOOM}
        mapId={MAP_ID}
        colorScheme="LIGHT"
        clickableIcons={false}
        disableDefaultUI={true}
        style={{ width: '100%', height: '100%' }}
      >
        {results.map((item) => {
          if (item.lat == null || item.lng == null) return null;
          const isGroup = item.kind === 'group';
          const isSelected = item.id === selectedId;
          const initial = item.name.charAt(0).toUpperCase();

          return (
            <AdvancedMarker
              key={item.id}
              position={{ lat: item.lat, lng: item.lng }}
              title={item.name}
              zIndex={isSelected ? 100 : isGroup ? 10 : 5}
              onClick={() => onSelect(item)}
            >
              <div
                className={`admin-map-pin ${isGroup ? 'admin-map-pin--group' : 'admin-map-pin--location'}${isSelected ? ' is-selected' : ''}`}
              >
                {initial}
              </div>
            </AdvancedMarker>
          );
        })}
      </Map>
    </APIProvider>
  );
}

export default AdminSearchMap;
