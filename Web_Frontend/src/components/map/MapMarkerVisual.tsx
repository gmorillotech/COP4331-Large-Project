// MapMarkerVisual — renders a single marker as either an animated crossfaded
// SVG pair or a static pin, depending on the location's marker state fields.
//
// Size scales with map zoom level (slower than the map itself).

import { memo } from 'react';
import type { MapLocation } from '../../types/mapAnnotations.ts';
import type { AnimationState } from './mapMarkerAnimation.ts';
import type { ClusterMarker } from './mapClustering.ts';
import { getAnimatedFrameUrl, getStaticPinUrl } from './mapMarkerAssets.ts';
import { deriveNoiseBand } from '../../lib/mapUtils.ts';

type Props = {
  location: MapLocation;
  isSelected: boolean;
  animation: AnimationState;
  zoom: number;
  // When true, suppress the noise-level background SVG. Used by the cluster
  // visual so a cluster pin doesn't carry a halo that would overflow its
  // container. Standalone group and sub-location pins both default to false.
  hideNoiseOverlay?: boolean;
};

// Base sizes at zoom 15 (the default zoom)
const BASE_SIZE = 48;
const BASE_SIZE_SUB = 36;
const SELECTED_BOOST = 14;

// How much the marker grows per zoom level above 15.
const SCALE_PER_ZOOM = 0.12;
const REFERENCE_ZOOM = 15;

// Shrink markers below the reference zoom, flooring at 60% of base size.
const MIN_SCALE = 0.6;
const SHRINK_PER_ZOOM = 0.06;

export function getSize(zoom: number, isSub: boolean, isSelected: boolean): number {
  const base = isSub ? BASE_SIZE_SUB : BASE_SIZE;
  let scaleFactor: number;
  if (zoom >= REFERENCE_ZOOM) {
    scaleFactor = 1 + (zoom - REFERENCE_ZOOM) * SCALE_PER_ZOOM;
  } else {
    scaleFactor = Math.max(MIN_SCALE, 1 - (REFERENCE_ZOOM - zoom) * SHRINK_PER_ZOOM);
  }
  const size = base * scaleFactor;
  return isSelected ? size + SELECTED_BOOST : size;
}

function MapMarkerVisualImpl({ location, isSelected, zoom, hideNoiseOverlay }: Props) {
  // Pin style is driven purely by kind. Groups → LocationPin.svg.
  // Sub-locations → subLocationPin.svg. Neither ever morphs.
  const isSub = location.kind !== 'group';
  const size = getSize(zoom, isSub, isSelected);
  const staticSrc = getStaticPinUrl(isSub);

  // Noise band is derived per marker — groups AND sub-locations both get a
  // band so the background SVG appears behind either kind of pin. Groups
  // pull their band from aggregated data the API provides (or fall back via
  // inferNoiseValue) so the layering style matches sub-locations visually.
  const noiseBand = hideNoiseOverlay ? null : deriveNoiseBand(location);
  const showNoiseOverlay = noiseBand != null;

  // Pre-resolve the three animation frames for this location's noise band.
  // CSS keyframes (see .marker-noise-frame-{0,1,2} in index.css) drive the
  // cross-fade, so the component never re-renders on animation ticks.
  const frame0 = showNoiseOverlay ? getAnimatedFrameUrl(noiseBand, 0) : null;
  const frame1 = showNoiseOverlay ? getAnimatedFrameUrl(noiseBand, 1) : null;
  const frame2 = showNoiseOverlay ? getAnimatedFrameUrl(noiseBand, 2) : null;

  // Make the noise background noticeably larger than the pin so it reads as
  // a clear colored halo behind the marker. Pin itself stays at `size` —
  // only the noise SVG scales up. 1.6x on each side gives a prominent rim
  // while still keeping the pin visually dominant.
  const NOISE_SCALE = 1.6;
  const noiseSize = showNoiseOverlay ? size * NOISE_SCALE : size;
  const noiseInset = (noiseSize - size) / 2; // pin offset to stay centered in the halo

  return (
    <div
      className={`marker-visual marker-visual--static ${isSelected ? 'is-selected' : ''}`}
      style={{
        width: noiseSize,
        height: noiseSize,
        position: 'relative',
      }}
    >
      {/* BACKGROUND layer — the noise-level SVG. Rendered first and with a
          low z-index so the pin above partially covers it. pointer-events
          none + aria-hidden keep it purely decorative; it is never a marker. */}
      {showNoiseOverlay && frame0 && frame1 && frame2 && (
        <div
          aria-hidden="true"
          className="marker-noise-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: noiseSize,
            height: noiseSize,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <img
            src={frame0}
            alt=""
            width={noiseSize}
            height={noiseSize}
            className="marker-noise-frame marker-noise-frame--0"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          />
          <img
            src={frame1}
            alt=""
            width={noiseSize}
            height={noiseSize}
            className="marker-noise-frame marker-noise-frame--1"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          />
          <img
            src={frame2}
            alt=""
            width={noiseSize}
            height={noiseSize}
            className="marker-noise-frame marker-noise-frame--2"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          />
        </div>
      )}

      {/* FOREGROUND layer — the actual pin. Horizontally centered in the
          halo (left: noiseInset) but pinned to the TOP of the container
          (top: 0) so the noise SVG underneath is mostly visible BELOW it:
          the pin covers the upper portion of the noise, and the lower
          portion sticks out below the pin. Pure visual offset; z-index
          and click routing are unchanged. */}
      <img
        src={staticSrc}
        alt=""
        width={size}
        height={size}
        style={{
          position: 'absolute',
          top: 0,
          left: noiseInset,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
    </div>
  );
}

// Memoize so unrelated parent re-renders (animation clock ticks, zoom-agnostic
// state updates elsewhere in MapMarkers) don't force every marker to
// reconcile. A marker only re-renders when its own location, zoom, or
// selection flips.
const MapMarkerVisual = memo(MapMarkerVisualImpl, (prev, next) => {
  return (
    prev.location === next.location &&
    prev.isSelected === next.isSelected &&
    prev.zoom === next.zoom &&
    prev.hideNoiseOverlay === next.hideNoiseOverlay
  );
});

// ---- Cluster visual ---------------------------------------------------------

type ClusterProps = {
  cluster: ClusterMarker;
  isSelected: boolean;
  animation: AnimationState;
  zoom: number;
};

export function ClusterMarkerVisual({ cluster, isSelected, animation, zoom }: ClusterProps) {
  const size = getSize(zoom, false, isSelected);
  const badgeSize = Math.max(18, size * 0.4);
  const count = cluster.members.length;
  const label = count > 99 ? '99+' : `+${count}`;

  return (
    <div
      className={`marker-visual marker-visual--cluster ${isSelected ? 'is-selected' : ''}`}
      style={{ width: size, height: size, position: 'relative' }}
    >
      <MapMarkerVisual
        location={cluster.representative}
        isSelected={false}
        animation={animation}
        zoom={zoom}
        hideNoiseOverlay
      />
      <div
        className="cluster-badge"
        style={{
          position: 'absolute',
          top: -badgeSize * 0.3,
          right: -badgeSize * 0.3,
          width: badgeSize,
          height: badgeSize,
          borderRadius: '50%',
          backgroundColor: '#1d4ed8',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: badgeSize * 0.5,
          fontWeight: 700,
          border: '2px solid #fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          lineHeight: 1,
          pointerEvents: 'none',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default MapMarkerVisual;
