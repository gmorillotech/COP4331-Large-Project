// MapLocationList — the right-side scrollable list of location cards.
//
// Each card mirrors the mobile design: colored avatar circle with a letter,
// building name, a "Building" tag, study area counts, and a favorite heart.
// Clicking a card selects that location (which pans the map to it).

import type { MapLocation } from '../../types/mapAnnotations.ts';
import { inferNoiseValue, buildHeatColor, formatLocationHeading } from '../../lib/mapUtils.ts';

type MapLocationListProps = {
  locations: MapLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

// HeartIcon — renders a filled heart (♥) if favorite, outline heart (♡) if not.
// Using unicode characters keeps this dependency-free.
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <span
      className="location-card__heart"
      aria-label={filled ? 'Favorited' : 'Not favorited'}
    >
      {filled ? '♥' : '♡'}
    </span>
  );
}

// LocationCard — one entry in the sidebar list.
// Shows the avatar letter, building info, study counts, and favorite status.
function LocationCard({
  location,
  isSelected,
  onSelect,
}: {
  location: MapLocation;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // Compute the noise-driven color for this location's avatar circle
  const intensity = inferNoiseValue(location);
  const color = buildHeatColor(intensity);

  // First letter of building name (or title) — shown in the avatar circle
  const letter = (location.buildingName ?? location.title).charAt(0).toUpperCase();

  // Whether this is an individual study spot (vs. a top-level building)
  const isSub = Boolean(location.sublocationLabel);

  return (
    <button
      type="button"
      className={`location-card ${isSelected ? 'is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={isSelected} // screen reader: tells user this item is active
    >
      {/* Left: colored circle avatar with first letter */}
      <div
        className="location-card__avatar"
        style={{
          background: color.replace('rgb', 'rgba').replace(')', ', 0.15)'),
          borderColor: color,
          color,
        }}
      >
        {letter}
      </div>

      {/* Middle: text content */}
      <div className="location-card__body">
        {/* Building name, bold */}
        <strong className="location-card__name">{formatLocationHeading(location)}</strong>

        {/* If this is a study spot inside a building, show which spot */}
        {location.sublocationLabel && (
          <span className="location-card__sub">{location.sublocationLabel}</span>
        )}

        {/* "Building" or "Study Spot" tag pill */}
        <span className="location-card__tag">{isSub ? 'Study Spot' : 'Building'}</span>

        {/* Study area count — only shown if the API provides this field */}
        {location.studyAreaCount != null && (
          <span className="location-card__count">
            {location.studyAreaCount} study area{location.studyAreaCount !== 1 ? 's' : ''} in this building
          </span>
        )}

        {/* Quiet options count — only shown if the API provides this field */}
        {location.quietOptionCount != null && (
          <span className="location-card__count">
            {location.quietOptionCount} quiet option{location.quietOptionCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Noise and status text from the API */}
        {location.noiseText && (
          <span className="location-card__noise">{location.noiseText}</span>
        )}
      </div>

      {/* Right: favorite heart icon */}
      <HeartIcon filled={Boolean(location.isFavorite)} />
    </button>
  );
}

// MapLocationList — renders the full scrollable list.
// Shows an empty state message if the list is empty.
function MapLocationList({ locations, selectedId, onSelect }: MapLocationListProps) {
  if (locations.length === 0) {
    return (
      <div className="location-list__empty">
        No study spaces match your search and filters.
      </div>
    );
  }

  return (
    <div className="location-list">
      {locations.map((location) => (
        <LocationCard
          key={location.id}
          location={location}
          isSelected={location.id === selectedId}
          onSelect={() => onSelect(location.id)}
        />
      ))}
    </div>
  );
}

export default MapLocationList;