// Shared color and noise utilities used by both MapMarkers and MapHeatOverlay.
// Keeping them here avoids duplicating code and circular import issues.

import type { MapLocation } from '../types/mapAnnotations.ts';

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
  const core = 0.18 + intensity * 0.28;  // center of the blob
  const mid  = 0.12 + intensity * 0.14;  // middle ring
  const edge = 0.03 + intensity * 0.08;  // outer fade
  // Insert alpha into the rgb() string to make rgba()
  const rgba = (op: number) => color.replace('rgb', 'rgba').replace(')', `, ${op})`);
  return `radial-gradient(circle, ${rgba(core)} 0%, ${rgba(mid)} 34%, ${rgba(edge)} 58%, rgba(0,0,0,0) 76%)`;
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