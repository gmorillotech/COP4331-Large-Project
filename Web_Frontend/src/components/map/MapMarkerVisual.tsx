// MapMarkerVisual — renders a single marker as either an animated crossfaded
// SVG pair or a static pin, depending on the location's marker state fields.
//
// Size scales with map zoom level (slower than the map itself).

import type { MapLocation } from '../../types/mapAnnotations.ts';
import type { AnimationState } from './mapMarkerAnimation.ts';
import type { ClusterMarker } from './mapClustering.ts';
import { getAnimatedFrameUrl, getStaticPinUrl } from './mapMarkerAssets.ts';

type Props = {
  location: MapLocation;
  isSelected: boolean;
  animation: AnimationState;
  zoom: number;
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

function MapMarkerVisual({ location, isSelected, animation, zoom }: Props) {
  const isSub = Boolean(location.sublocationLabel);
  const size = getSize(zoom, isSub, isSelected);

  // Use animated frames when the API says the marker should animate
  if (location.isAnimated && location.noiseBand != null) {
    const currentSrc = getAnimatedFrameUrl(location.noiseBand, animation.currentFrame);
    const nextSrc = getAnimatedFrameUrl(location.noiseBand, animation.nextFrame);

    return (
      <div
        className={`marker-visual ${isSelected ? 'is-selected' : ''}`}
        style={{ width: size, height: size, position: 'relative' }}
      >
        <img
          src={currentSrc}
          alt=""
          width={size}
          height={size}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: 1 - animation.progress,
            pointerEvents: 'none',
          }}
        />
        <img
          src={nextSrc}
          alt=""
          width={size}
          height={size}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: animation.progress,
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  // Static fallback — no animation
  const staticSrc = getStaticPinUrl(isSub);

  return (
    <div
      className={`marker-visual marker-visual--static ${isSelected ? 'is-selected' : ''}`}
      style={{ width: size, height: size }}
    >
      <img
        src={staticSrc}
        alt=""
        width={size}
        height={size}
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
}

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
