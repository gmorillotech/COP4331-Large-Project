// MapInfoPopup — the info box that appears on the map when a pin is clicked.
//
// Uses InfoWindow from @vis.gl/react-google-maps.
// InfoWindow is a native Google Maps component: it anchors to a lat/lng
// coordinate on the map canvas and moves with the map as you pan/zoom.
// It is NOT a floating CSS div — it lives inside the map's own DOM.
//
// It renders null when nothing is selected, so it's always safe to include
// inside <MapCanvas> without any conditional rendering in the parent.

import { memo } from 'react';
import { InfoWindow } from '@vis.gl/react-google-maps';
import type { MapLocation } from '../../types/mapAnnotations.ts';
import { inferNoiseValue, buildHeatColor, formatDisplayName } from '../../lib/mapUtils.ts';

type MapInfoPopupProps = {
  location: MapLocation | null; // null = no location selected → renders nothing
  onClose: () => void;          // called when the user clicks the × on the popup
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  // Fired when a GROUP popup card is clicked. Wired to reveal that group's
  // sub-location pins on the map. Ignored for sub-location popups.
  onRevealGroupLocations?: (groupId: string) => void;
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

function MapInfoPopup({
  location,
  onClose,
  isFavorite,
  onToggleFavorite,
  onRevealGroupLocations,
}: MapInfoPopupProps) {
  // If no location is selected, render nothing — InfoWindow disappears
  if (!location) return null;

  // Compute the noise color for the accent bar at the top of the popup
  const intensity = inferNoiseValue(location);
  const accentColor = buildHeatColor(intensity);

  // Group popups are intentionally stripped of location-level detail
  // (floor, sublocation label, noise/occupancy readings). Only sub-location
  // popups render the full location card. This keeps a group pin's popup
  // stable regardless of what optional fields the backend decorates it with.
  const isGroup = location.kind === 'group';

  // Heading & subtitle. Both come from display-only formatters — the
  // underlying location data is never renamed or mutated.
  //   Group pin       → heading: group/building name.     subtitle: none.
  //   Sub-location    → heading: "<name> - Level X" (or just "<name>"
  //                                when no floor).         subtitle: buildingName.
  const heading = formatDisplayName(location);
  const subHeading = isGroup
    ? null
    : (location.buildingName || null);

  // Group popup card click → reveal that group's sub-location pins. Only
  // active on group popups, and ignores clicks that originated on the
  // favorite button (which has its own handler).
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isGroup) return;
    if (!onRevealGroupLocations) return;
    const target = e.target as HTMLElement;
    if (target.closest('.map-info-popup__favorite-btn')) return;
    onRevealGroupLocations(location.id);
  };
  const cardIsClickable = isGroup && Boolean(onRevealGroupLocations);

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
      <div
        className="map-info-popup"
        onClick={cardIsClickable ? handleCardClick : undefined}
        role={cardIsClickable ? 'button' : undefined}
        tabIndex={cardIsClickable ? 0 : undefined}
        style={cardIsClickable ? { cursor: 'pointer' } : undefined}
        title={cardIsClickable ? 'Show study areas in this building' : undefined}
      >

        {/* Thin colored bar at the top — color matches the noise heat level */}
        <div
          className="map-info-popup__accent"
          style={{ background: accentColor }}
        />

        {/* Header row: building name + severity badge */}
        <div className="map-info-popup__header">
          <div>
            <h3 className="map-info-popup__title">{heading}</h3>
            {/* Subtitle: "Library · Floor 4" for sub-locations so the group
                context is visible under the sub-location's own name. Nothing
                here for group popups — they stay group-level only. */}
            {subHeading && (
              <p className="map-info-popup__sub">{subHeading}</p>
            )}
          </div>
          <SeverityBadge severity={location.severity} />
        </div>

        {/* Short summary paragraph */}
        {location.summary && (
          <p className="map-info-popup__summary">{location.summary}</p>
        )}

        {/* Detail rows — only render a row if the value is a real, non-"unavailable" string.
            Noise and occupancy are location-level readings; groups suppress them.
            Groups get a dedicated Status row that surfaces the averaged noise
            rolled up from their sublocations — same source the sidebar list's
            NoiseChip reads, same "Quiet (58.2 dB)" formatting, just strip the
            "Noise: " prefix so the label "Status" leads instead. */}
        <dl className="popup-meta">
          {!isGroup && isDisplayable(location.noiseText)      && <MetaRow label="Noise"     value={location.noiseText} />}
          {!isGroup && isDisplayable(location.occupancyText)  && <MetaRow label="Occupancy" value={location.occupancyText} />}
          {isGroup && isDisplayable(location.noiseText) && (
            <MetaRow label="Status" value={location.noiseText.replace(/^noise:\s*/i, '')} />
          )}
          {!isGroup && isDisplayable(location.statusText)     && <MetaRow label="Status"    value={location.statusText} />}
          {isDisplayable(location.updatedAtLabel) && <MetaRow label="Updated"   value={location.updatedAtLabel} />}
          <MetaRow
            label="Coordinates"
            value={`${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}
          />
        </dl>

      {/* Favorite button at the bottom */}
  <button
    type="button"
    className={`map-info-popup__favorite-btn ${isFavorite ? 'is-favorited' : ''}`}
    onClick={() => onToggleFavorite(location.id)}
  >
    {isFavorite ? '♥ Saved to favorites' : '♡ Save to favorites'}
  </button>

      </div>
    </InfoWindow>
  );
}

export default memo(MapInfoPopup);
