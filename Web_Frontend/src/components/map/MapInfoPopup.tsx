// MapInfoPopup — the info box that appears on the map when a pin is clicked.
//
// Uses InfoWindow from @vis.gl/react-google-maps.
// InfoWindow is a native Google Maps component: it anchors to a lat/lng
// coordinate on the map canvas and moves with the map as you pan/zoom.
// It is NOT a floating CSS div — it lives inside the map's own DOM.
//
// It renders null when nothing is selected, so it's always safe to include
// inside <MapCanvas> without any conditional rendering in the parent.

import { InfoWindow } from '@vis.gl/react-google-maps';
import type { MapLocation } from '../../types/mapAnnotations.ts';
import { inferNoiseValue, buildHeatColor } from '../../lib/mapUtils.ts';

type MapInfoPopupProps = {
  location: MapLocation | null; // null = no location selected → renders nothing
  onClose: () => void;          // called when the user clicks the × on the popup
};

// SeverityBadge — a colored pill showing Low / Medium / High
function SeverityBadge({ severity }: { severity: MapLocation['severity'] }) {
  // Map severity string to a CSS class (these already exist in index.css)
  const cls = `map-popup__badge severity-${severity ?? 'low'}`;
  const label =
    severity === 'high'   ? 'High noise' :
    severity === 'medium' ? 'Moderate'   :
                            'Quiet';
  return <span className={cls}>{label}</span>;
}

// Strips a leading "Label: " prefix from API text fields so we don't double-print.
// e.g. "Noise: Quiet" with label "Noise" → just "Quiet"
// e.g. "Occupancy: 2 users" with label "Occupancy" → just "2 users"
function stripPrefix(value: string, prefix: string): string {
  const pattern = new RegExp(`^${prefix}:\\s*`, 'i');
  return value.replace(pattern, '');
}

// Returns true if the value is a real displayable string (not empty or "unavailable").
// Prevents rendering rows like "Noise | Noise unavailable".
function isDisplayable(value: string | undefined): value is string {
  if (!value) return false;
  return !value.toLowerCase().includes('unavailable');
}

// MetaRow — one labeled row in the detail table
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="popup-meta__row">
      <dt className="popup-meta__label">{label}</dt>
      {/* Strip the field's own prefix so we don't show "Noise: Quiet" under "Noise" */}
      <dd className="popup-meta__value">{stripPrefix(value, label)}</dd>
    </div>
  );
}

function MapInfoPopup({ location, onClose }: MapInfoPopupProps) {
  // If no location is selected, render nothing — InfoWindow disappears
  if (!location) return null;

  // Compute the noise color for the accent bar at the top of the popup
  const intensity = inferNoiseValue(location);
  const accentColor = buildHeatColor(intensity);

  // The name shown as the popup heading
  const heading = [location.buildingName, location.floorLabel]
    .filter(Boolean)
    .join(' · ') || location.title;

  return (
    // InfoWindow anchors itself to this position on the map canvas.
    // pixelOffset pushes it upward so it appears above the pin, not on top of it.
    // onCloseClick fires when the user clicks the native Google Maps × button.
    <InfoWindow
      position={{ lat: location.lat, lng: location.lng }}
      pixelOffset={[0, -50]}
      onCloseClick={onClose}
    >
      {/*
        Everything inside InfoWindow is rendered as normal React JSX.
        Google Maps injects it into a small floating container on the canvas.
      */}
      <div className="map-info-popup">

        {/* Thin colored bar at the top — color matches the noise heat level */}
        <div
          className="map-info-popup__accent"
          style={{ background: accentColor }}
        />

        {/* Header row: building name + severity badge */}
        <div className="map-info-popup__header">
          <div>
            <h3 className="map-info-popup__title">{heading}</h3>
            {/* Sublocation label (e.g. "North Reading Room") shown below the title */}
            {location.sublocationLabel && (
              <p className="map-info-popup__sub">{location.sublocationLabel}</p>
            )}
          </div>
          <SeverityBadge severity={location.severity} />
        </div>

        {/* Short summary paragraph */}
        {location.summary && (
          <p className="map-info-popup__summary">{location.summary}</p>
        )}

        {/* Detail rows — only render a row if the value is a real, non-"unavailable" string */}
        <dl className="popup-meta">
          {isDisplayable(location.noiseText)      && <MetaRow label="Noise"     value={location.noiseText} />}
          {isDisplayable(location.occupancyText)  && <MetaRow label="Occupancy" value={location.occupancyText} />}
          {isDisplayable(location.statusText)     && <MetaRow label="Status"    value={location.statusText} />}
          {isDisplayable(location.updatedAtLabel) && <MetaRow label="Updated"   value={location.updatedAtLabel} />}
          <MetaRow
            label="Coordinates"
            value={`${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}
          />
        </dl>

        {/* Favorite indicator at the bottom */}
        {location.isFavorite && (
          <p className="map-info-popup__favorite">♥ Saved to favorites</p>
        )}

      </div>
    </InfoWindow>
  );
}

export default MapInfoPopup;
