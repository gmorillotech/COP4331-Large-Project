// Shared color and noise utilities used by both MapMarkers and MapHeatOverlay.
// Keeping them here avoids duplicating code and circular import issues.

import type { MapLocation, NoiseBand } from '../types/mapAnnotations.ts';

// ---- Helpers ----------------------------------------------------------------

// Clamps a number between min and max
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Interpolates one color channel (R, G, or B) between start and end by ratio 0–1
function interpolateChannel(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * ratio);
}

// Converts a hex color string like "#2563eb" into [R, G, B] numbers
function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  // Handle shorthand hex like "#abc" → expand each char to "aabbcc"
  const segs =
    n.length === 3
      ? n.split('').map((s) => s + s)
      : (n.match(/.{1,2}/g) ?? ['00', '00', '00']);
  return segs.slice(0, 3).map((s) => Number.parseInt(s, 16)) as [number, number, number];
}

// Blends two hex colors together at the given ratio (0 = all a, 1 = all b)
function mixHex(a: string, b: string, ratio: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const t = clamp(ratio, 0, 1);
  return `rgb(${interpolateChannel(ar, br, t)}, ${interpolateChannel(ag, bg, t)}, ${interpolateChannel(ab, bb, t)})`;
}

// ---- Exports ----------------------------------------------------------------

// Desaturated / darkened versions of the marker body colors per noise band.
// Band 1 (#16D0D0 teal) → Band 5 (#210061 purple), muted for use as a map wash.
const BAND_HEAT_COLORS: Record<NoiseBand, string> = {
  1: 'rgb(30, 148, 148)',  // muted teal  (from pin #16D0D0)
  2: 'rgb(24, 112, 170)',  // muted blue  (from pin #0C95EE)
  3: 'rgb(34, 52, 150)',   // muted deep blue (from pin #001AD2)
  4: 'rgb(30, 30, 110)',   // muted indigo (from pin #000487)
  5: 'rgb(48, 26, 88)',    // muted purple (from pin #210061)
};
const BAND_DEFAULT_COLOR = 'rgb(80, 80, 100)'; // neutral fallback when band is unknown

/**
 * Returns a desaturated/darkened color matching the marker pin for a given noise band.
 * Used by the heatmap overlay so wash colors track the pin icon colors.
 */
export function buildBandColor(band: NoiseBand | null | undefined): string {
  return band != null ? BAND_HEAT_COLORS[band] : BAND_DEFAULT_COLOR;
}

/**
 * Returns a NoiseBand (1–5) for any location, falling back to inference
 * from noiseText/severity when the backend didn't populate `noiseBand`.
 * Every sub-location reliably gets a band so the noise SVG can always
 * render — the prior dependency on `isAnimated` + explicit `noiseBand`
 * was what caused sub-locations to show no noise imagery at all.
 */
export function deriveNoiseBand(location: MapLocation): NoiseBand {
  if (location.noiseBand != null) return location.noiseBand;
  const v = inferNoiseValue(location);
  if (v < 0.2) return 1;
  if (v < 0.4) return 2;
  if (v < 0.6) return 3;
  if (v < 0.8) return 4;
  return 5;
}

/**
 * Converts a 0–1 noise intensity into an rgb() color string.
 * Low intensity → blue, medium → yellow, high → red.
 * This color is used for pin fill and the heat overlay blobs.
 */
export function buildHeatColor(intensity: number): string {
  if (intensity <= 0.33) return mixHex('#2563eb', '#06b6d4', intensity / 0.33);
  if (intensity <= 0.66) return mixHex('#06b6d4', '#facc15', (intensity - 0.33) / 0.33);
  return mixHex('#f97316', '#dc2626', (intensity - 0.66) / 0.34);
}

/**
 * Reads a location's noiseText and severity to produce a 0–1 intensity number.
 * 0 = very quiet (blue), 1 = very loud (red).
 * Used as the single source of truth for all noise-driven visuals.
 */
export function inferNoiseValue(location: MapLocation): number {
  const t = location.noiseText?.toLowerCase() ?? '';
  if (t.includes('very quiet')) return 0.1;
  if (t.includes('quiet'))      return 0.22;
  if (t.includes('moderate'))   return 0.52;
  if (t.includes('busy'))       return 0.74;
  if (t.includes('loud'))       return 0.9;
  // Fall back to severity if no noiseText
  switch (location.severity) {
    case 'low':    return 0.24;
    case 'medium': return 0.56;
    case 'high':   return 0.88;
    default:       return 0.42;
  }
}

/**
 * Builds the CSS radial-gradient string for a heat blob at the given color + intensity.
 * The opacity values get larger as intensity increases, making loud spots glow more.
 */
export function buildHeatGradient(color: string, intensity: number): string {
  const core = 0.35 + intensity * 0.30;  // center of the blob
  const mid  = 0.24 + intensity * 0.20;  // middle ring
  const edge = 0.10 + intensity * 0.14;  // outer fade
  // Insert alpha into the rgb() string to make rgba()
  const rgba = (op: number) => color.replace('rgb', 'rgba').replace(')', `, ${op})`);
  return `radial-gradient(circle, ${rgba(core)} 0%, ${rgba(mid)} 30%, ${rgba(edge)} 60%, rgba(0,0,0,0) 100%)`;
}

/**
 * Builds a text search string for a location — combines all searchable fields
 * into one lowercase string so we only need one .includes() check.
 */
export function buildSearchableText(location: MapLocation): string {
  return [
    location.title,
    location.buildingName,
    location.floorLabel,
    location.sublocationLabel,
    location.summary,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Returns the display heading for a location.
 * Prefers "BuildingName - FloorLabel", falls back to title.
 */
export function formatLocationHeading(location: MapLocation): string {
  return (
    [location.buildingName, location.floorLabel].filter(Boolean).join(' · ') ||
    location.title
  );
}

/**
 * Display-only formatter for a location's primary name.
 * Pure formatter — never mutates or renames the underlying data.
 *
 *  - Group        → `buildingName`  (group name only, no level)
 *  - Sub-location → `sublocationLabel` (+ ` - Level X` when `floorLabel` is set)
 *
 * If `floorLabel` already begins with "Level" or "Floor", it's left as-is so
 * values like "Floor 4" or "Level 2B" render without "Level Level 4".
 * Otherwise the literal prefix "Level " is added before the floor value so a
 * raw "6" becomes "Level 6".
 */
export function formatDisplayName(location: MapLocation): string {
  if (location.kind === 'group') {
    return location.buildingName || location.title || '';
  }
  const name =
    location.sublocationLabel || location.title || location.buildingName || '';
  const floor = (location.floorLabel || '').trim();
  if (!floor) return name;
  const levelText = /^(level|floor)\b/i.test(floor) ? floor : `Level ${floor}`;
  return name ? `${name} - ${levelText}` : levelText;
}