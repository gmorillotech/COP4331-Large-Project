// mapMarkerAssets — maps (noiseBand, frame) to imported SVG asset URLs.
//
// Naming: {noiseLevel}-{frame}.svg
// Noise levels 1 (soft) to 5 (loud), frames 1–3 (loop: 1→2→3→2→1).

import type { NoiseBand } from '../../types/mapAnnotations.ts';

// ---- Animated frame imports -------------------------------------------------

import band1f1 from '../../assets/markers/1-1.svg';
import band1f2 from '../../assets/markers/1-2.svg';
import band1f3 from '../../assets/markers/1-3.svg';

import band2f1 from '../../assets/markers/2-1.svg';
import band2f2 from '../../assets/markers/2-2.svg';
import band2f3 from '../../assets/markers/2-3.svg';

import band3f1 from '../../assets/markers/3-1.svg';
import band3f2 from '../../assets/markers/3-2.svg';
import band3f3 from '../../assets/markers/3-3.svg';

import band4f1 from '../../assets/markers/4-1.svg';
import band4f2 from '../../assets/markers/4-2.svg';
import band4f3 from '../../assets/markers/4-3.svg';

import band5f1 from '../../assets/markers/5-1.svg';
import band5f2 from '../../assets/markers/5-2.svg';
import band5f3 from '../../assets/markers/5-3.svg';

// ---- Static pin imports -----------------------------------------------------

import locationPinUrl from '../../assets/markers/LocationPin.svg';
import subLocationPinUrl from '../../assets/markers/subLocationPin.svg';

// ---- Registry ---------------------------------------------------------------

const ANIMATED_FRAMES: Record<NoiseBand, [string, string, string]> = {
  1: [band1f1, band1f2, band1f3],
  2: [band2f1, band2f2, band2f3],
  3: [band3f1, band3f2, band3f3],
  4: [band4f1, band4f2, band4f3],
  5: [band5f1, band5f2, band5f3],
};

/** Returns the SVG URL for an animated marker frame. */
export function getAnimatedFrameUrl(band: NoiseBand, frameIndex: 0 | 1 | 2): string {
  return ANIMATED_FRAMES[band][frameIndex];
}

/** Returns the static pin SVG URL for a given marker kind. */
export function getStaticPinUrl(isSub: boolean): string {
  return isSub ? subLocationPinUrl : locationPinUrl;
}
