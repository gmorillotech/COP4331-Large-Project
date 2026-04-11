import type { ReactNode } from 'react';
import { Map } from '@vis.gl/react-google-maps';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_ID } from '../../lib/googleMaps.ts';

type MapCanvasProps = {
  onMapClick: () => void; // called when user clicks the map background (deselects a pin)
  children: ReactNode;    // MapMarkers and MapHeatOverlay go here as children
};

// Renders the <Map> component from @vis.gl/react-google-maps.
// This is what creates the actual google.maps.Map instance and binds it to the DOM.
//
// Key facts:
//   - defaultCenter and defaultZoom are "uncontrolled" — the map owns its own
//     camera position after mount. We don't keep re-setting them on re-renders.
//   - mapId is required for AdvancedMarker (custom HTML pins). It comes from .env.
//   - Any component rendered as a child of <Map> can call useMap() to get the
//     map instance, because <Map> puts it into React context.
function MapCanvas({ onMapClick, children }: MapCanvasProps) {
  return (
    <Map
      defaultCenter={DEFAULT_CENTER}   // where the map starts centered
      defaultZoom={DEFAULT_ZOOM}       // zoom level on first load
      mapId={MAP_ID}                   // enables AdvancedMarker + vector tiles
      colorScheme="DARK"              // force the dark cloud style at render time
      clickableIcons={false}           // prevent clicking on Google's built-in POI icons
      disableDefaultUI={true}          // hide all default Google controls (zoom buttons, etc.)
      onClick={onMapClick}             // clicking the map background deselects the active pin
      style={{ width: '100%', height: '100%' }} // fill whatever container wraps it
    >
      {children}
    </Map>
  );
}

export default MapCanvas;
