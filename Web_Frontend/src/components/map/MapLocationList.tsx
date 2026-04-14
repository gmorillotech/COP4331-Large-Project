// MapLocationList — the right-side scrollable list of location cards.
//
// Each card mirrors the mobile design: colored avatar circle with a letter,
// building name, a "Building" tag, study area counts, and a favorite heart.
// Clicking a card selects that location (which pans the map to it).

import type { MapLocation } from '../../types/mapAnnotations.ts';
import { inferNoiseValue, buildHeatColor, formatDisplayName } from '../../lib/mapUtils.ts';

// NoiseChip — a colored dot + label showing the noise level for a location.
// Uses the same heat color system as the pins and heat overlay so everything
// is visually consistent (blue = quiet, yellow = moderate, red = loud).
//
// When the backend reports the live reading is stale (hasRecentData === false)
// we still render the chip — greyed out with a "stale" tag — so users see the
// last-known reading instead of the chip vanishing between report submissions.
function NoiseChip({ location }: { location: MapLocation }) {
  const intensity = inferNoiseValue(location);  // 0–1 noise value
  const color = buildHeatColor(intensity);       // rgb() color string

  // Strip the "Noise: " prefix if present so we just show "Quiet", "Moderate", etc.
  const rawText = location.noiseText ?? '';
  const label = rawText.replace(/^noise:\s*/i, '');

  // No live data has ever been recorded for this location — nothing useful to show.
  if (!label || label.toLowerCase().includes('unavailable')) return null;

  // hasRecentData is set by the backend based on its freshness window. Treat an
  // explicit `false` as stale; missing field means "trust it."
  const isStale = location.hasRecentData === false;

  return (
    <span className={`location-card__noise-chip${isStale ? ' is-stale' : ''}`}>
      {/* Colored dot matching the heat color for this noise level. The .is-stale
          modifier in CSS overrides this background to a muted grey. */}
      <span
        className="location-card__noise-dot"
        style={{ background: color }}
        aria-hidden="true"
      />
      {label}
      {isStale && (
        <span className="location-card__noise-chip__stale-tag">stale</span>
      )}
    </span>
  );
}

type MapLocationListProps = {
  locations: MapLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
};

// HeartIcon — renders a filled heart (♥) if favorite, outline heart (♡) if not.
// Using unicode characters keeps this dependency-free.
function HeartIcon({ filled, onClick }: { filled: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <span
      role="button"
      className={`location-card__heart-btn ${filled ? 'is-favorited' : ''}`}
      onClick={onClick}
      aria-label={filled ? 'Remove from favorites' : 'Add to favorites'}
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
  isFavorite,
  onToggleFavorite,
}: {
  location: MapLocation;
  isSelected: boolean;
  onSelect: () => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void
}) {
  // Compute the noise-driven color for this location's avatar circle
  const intensity = inferNoiseValue(location);
  const color = buildHeatColor(intensity);

  // Kind is the source of truth: groups always render as groups, sub-locations
  // always render as sub-locations. Derivation used to key off sublocationLabel,
  // which caused a group decorated with optional labels to flip into sub mode.
  const isSub = location.kind !== 'group';

  // Primary name that appears in the bolded line of the card.
  // Uses the shared display-only formatter so popup / list / favorites all
  // render identically. Sub-location cards get "<name> - Level X" when a
  // floor exists, group cards get the group name only. No data is renamed.
  const primaryName = formatDisplayName(location);

  // First letter of whatever name is actually displayed on this card.
  const letter = (primaryName || ' ').charAt(0).toUpperCase();

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
        {/* Primary name: group name for groups, sub-location's own name for sub-locations */}
        <strong className="location-card__name">{primaryName}</strong>

        {/* For sub-locations, show the parent group as context on a second
            line. Groups don't have a parent, so nothing renders there. */}
        {isSub && location.buildingName && location.buildingName !== primaryName && (
          <span className="location-card__sub">{location.buildingName}</span>
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

        {/* Noise level chip — colored dot + label using the heat color system */}
        <NoiseChip location={location} />
      </div>

      {/* Right: favorite heart icon */}
      <HeartIcon
        filled={isFavorite}
        onClick={(e) => {
          e.stopPropagation(); // prevent card selection when clicking heart
          onToggleFavorite(location.id);
        }}
      />
    </button>
  );
}

// MapLocationList — renders the full scrollable list.
// Shows an empty state message if the list is empty.
function MapLocationList({ locations, selectedId, onSelect,  isFavorite, onToggleFavorite }: MapLocationListProps) {
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
          isFavorite={isFavorite(location.id)}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}

export default MapLocationList;