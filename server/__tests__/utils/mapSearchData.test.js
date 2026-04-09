'use strict';

const {
  distanceInMeters,
  toSeverity,
  toNoiseText,
  toOccupancyText,
  formatUpdatedAtLabel,
} = require('../../services/mapSearchData');

describe('mapSearchData utilities', () => {
  // ── distanceInMeters ──────────────────────────────────────────
  describe('distanceInMeters', () => {
    it('returns 0 for identical coordinates', () => {
      expect(distanceInMeters(28.6, -81.2, 28.6, -81.2)).toBeCloseTo(0, 3);
    });

    it('is symmetric (A→B ≈ B→A)', () => {
      const d1 = distanceInMeters(28.6, -81.2, 28.61, -81.19);
      const d2 = distanceInMeters(28.61, -81.19, 28.6, -81.2);
      expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
    });

    it('1 degree of latitude ≈ 111,195 meters', () => {
      const d = distanceInMeters(0, 0, 1, 0);
      expect(d).toBeGreaterThan(110_000);
      expect(d).toBeLessThan(112_000);
    });

    it('returns a positive value for different points', () => {
      expect(distanceInMeters(28.6, -81.2, 28.605, -81.19)).toBeGreaterThan(0);
    });
  });

  // ── toSeverity ────────────────────────────────────────────────
  describe('toSeverity', () => {
    it('returns "low" for noise below 52', () => {
      expect(toSeverity(0)).toBe('low');
      expect(toSeverity(40)).toBe('low');
      expect(toSeverity(51.9)).toBe('low');
    });

    it('returns "medium" for noise 52–67.9', () => {
      expect(toSeverity(52)).toBe('medium');
      expect(toSeverity(60)).toBe('medium');
      expect(toSeverity(67.9)).toBe('medium');
    });

    it('returns "high" for noise >= 68', () => {
      expect(toSeverity(68)).toBe('high');
      expect(toSeverity(80)).toBe('high');
      expect(toSeverity(100)).toBe('high');
    });

    it('returns "low" for non-finite inputs', () => {
      expect(toSeverity(NaN)).toBe('low');
      expect(toSeverity(null)).toBe('low');
      expect(toSeverity(undefined)).toBe('low');
      expect(toSeverity(Infinity)).toBe('low');
    });
  });

  // ── toNoiseText ───────────────────────────────────────────────
  describe('toNoiseText', () => {
    it('returns "Noise unavailable" for non-finite values', () => {
      expect(toNoiseText(NaN)).toBe('Noise unavailable');
      expect(toNoiseText(null)).toBe('Noise unavailable');
      expect(toNoiseText(undefined)).toBe('Noise unavailable');
    });

    it('returns a "Quiet" label for noise < 52', () => {
      const text = toNoiseText(45.0);
      expect(text).toContain('Quiet');
      expect(text).toContain('45.0 dB');
    });

    it('returns a "Moderate" label for noise 52–67.9', () => {
      expect(toNoiseText(60.0)).toContain('Moderate');
    });

    it('returns a "Loud" label for noise >= 68', () => {
      expect(toNoiseText(75.0)).toContain('Loud');
    });

    it('includes the formatted dB value in all finite cases', () => {
      expect(toNoiseText(43.0)).toContain('43.0 dB');
      expect(toNoiseText(57.5)).toContain('57.5 dB');
      expect(toNoiseText(73.0)).toContain('73.0 dB');
    });
  });

  // ── toOccupancyText ───────────────────────────────────────────
  describe('toOccupancyText', () => {
    it('returns "Occupancy unavailable" for non-finite values', () => {
      expect(toOccupancyText(NaN)).toBe('Occupancy unavailable');
      expect(toOccupancyText(null)).toBe('Occupancy unavailable');
    });

    it('formats integers with one decimal place', () => {
      expect(toOccupancyText(3)).toBe('Occupancy: 3.0 / 5');
    });

    it('formats decimal values', () => {
      expect(toOccupancyText(2.5)).toBe('Occupancy: 2.5 / 5');
    });

    it('includes "/ 5" denominator', () => {
      expect(toOccupancyText(1)).toContain('/ 5');
    });
  });

  // ── formatUpdatedAtLabel ──────────────────────────────────────
  describe('formatUpdatedAtLabel', () => {
    it('returns "Awaiting live reports" for null', () => {
      expect(formatUpdatedAtLabel(null)).toBe('Awaiting live reports');
    });

    it('returns "Awaiting live reports" for undefined', () => {
      expect(formatUpdatedAtLabel(undefined)).toBe('Awaiting live reports');
    });

    it('returns "Updated just now" for a timestamp within the last minute', () => {
      const recent = new Date(Date.now() - 10_000); // 10 seconds ago
      expect(formatUpdatedAtLabel(recent)).toBe('Updated just now');
    });

    it('returns "Updated 1 minute ago" for exactly 1 minute ago', () => {
      const oneMin = new Date(Date.now() - 60_000);
      expect(formatUpdatedAtLabel(oneMin)).toBe('Updated 1 minute ago');
    });

    it('returns plural minutes label for 5 minutes ago', () => {
      const fiveMins = new Date(Date.now() - 300_000);
      expect(formatUpdatedAtLabel(fiveMins)).toBe('Updated 5 minutes ago');
    });
  });
});
