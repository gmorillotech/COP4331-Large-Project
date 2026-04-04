// MapMarkers — places one pin on the map per location.
//
// Uses AdvancedMarker (requires mapId on the parent <Map>).
// Each marker's visual is a plain React component rendered as children —
// no SVG data URLs, no manual DOM creation. React handles creation/cleanup.
//
// Also contains MapCameraController: a helper that pans + zooms the map
// whenever the selected location changes.

import { useEffect } from 'react';
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import type { MapLocation } from '../../types/mapAnnotations.ts';
import { inferNoiseValue, buildHeatColor, formatLocationHeading } from '../../lib/mapUtils.ts';

// ---- Pin visuals (plain React components, no map API calls) -----------------

// Returns the first letter of a building name to show inside the pin circle.
// Falls back to the first letter of title if buildingName isn't set.
function getAvatarLetter(location: MapLocation): string {
  return (location.buildingName ?? location.title).charAt(0).toUpperCase();
}

// BuildingPin — the large circular pin shown for top-level buildings.
// Shows a colored circle with a letter avatar and a small speaker badge.
function BuildingPin({
  location,
  isSelected,
}: {
  location: MapLocation;
  isSelected: boolean;
}) {
  const intensity = inferNoiseValue(location);  // 0–1 noise value
  const color = buildHeatColor(intensity);       // rgb() color string

  return (
    // Outer circle — size and border change when selected
    <div
      className={`building-pin ${isSelected ? 'is-selected' : ''}`}
      style={{
        // The pin fill color is a semi-transparent version of the noise color
        background: color.replace('rgb', 'rgba').replace(')', ', 0.15)'),
        borderColor: color,
      }}
    >
      {/* Letter avatar in the center of the pin */}
      <span className="building-pin__letter" style={{ color }}>
        {getAvatarLetter(location)}
      </span>

      {/* Small speaker badge in the top-right corner — shows noise level as a colored dot */}
      <span
        className="building-pin__badge"
        style={{ background: color }}
        aria-label={`Noise level: ${location.noiseText ?? location.severity ?? 'unknown'}`}
      />
    </div>
  );
}

// StudyPin — the smaller circular pin used for individual study spots
// (locations that have a sublocationLabel, meaning they're inside a building).
function StudyPin({
  location,
  isSelected,
}: {
  location: MapLocation;
  isSelected: boolean;
}) {
  const intensity = inferNoiseValue(location);
  const color = buildHeatColor(intensity);

  return (
    <div
      className={`study-pin ${isSelected ? 'is-selected' : ''}`}
      style={{
        background: color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
        borderColor: color,
      }}
    />
  );
}

// ---- Camera controller -------------------------------------------------------

// MapCameraController — pans and zooms the map when selectedId changes.
// This must live inside <Map> (as a child component) so useMap() has context.
// It renders nothing — it only has a side effect.
function MapCameraController({
  selectedId,
  locations,
}: {
  selectedId: string | null;
  locations: MapLocation[];
}) {
  // useMap() returns the google.maps.Map instance from React context.
  // This is the React way to get the map — no refs, no global lookups.
  const map = useMap();

  useEffect(() => {
    // Do nothing if there's no map yet or nothing is selected
    if (!map || !selectedId) return;

    // Find the location object for the selected ID
    const target = locations.find((l) => l.id === selectedId);
    if (!target) return;

    // Smoothly pan the map to the selected location
    map.panTo({ lat: target.lat, lng: target.lng });

    // Zoom in if we're too far out to see the pin clearly
    if ((map.getZoom() ?? 0) < 17) map.setZoom(17);
  }, [map, selectedId, locations]); // re-run whenever selection or locations change

  return null; // renders nothing to the DOM
}

// ---- Main component ---------------------------------------------------------

type MapMarkersProps = {
  locations: MapLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

// MapMarkers — renders one AdvancedMarker per location, plus the camera controller.
//
// React reconciles the marker list on each render — no manual teardown loops.
// When locations or selectedId changes, React updates only what changed.
function MapMarkers({ locations, selectedId, onSelect }: MapMarkersProps) {
  return (
    <>
      {/* Camera controller: pans + zooms on selection change */}
      <MapCameraController selectedId={selectedId} locations={locations} />

      {locations.map((location) => {
        const isSelected = location.id === selectedId;
        // Locations with a sublocationLabel are spots inside a building → use small pin
        const isSub = Boolean(location.sublocationLabel);

        return (
          <AdvancedMarker
            key={location.id}
            position={{ lat: location.lat, lng: location.lng }}
            title={formatLocationHeading(location)} // shows on hover (tooltip)
            zIndex={isSelected ? 100 : isSub ? 5 : 10} // selected pins always on top
            onClick={() => onSelect(location.id)}
          >
            {/* The JSX child is what actually renders on the map at this lat/lng */}
            {isSub ? (
              <StudyPin location={location} isSelected={isSelected} />
            ) : (
              <BuildingPin location={location} isSelected={isSelected} />
            )}
          </AdvancedMarker>
        );
      })}
    </>
  );
}

export default MapMarkers;