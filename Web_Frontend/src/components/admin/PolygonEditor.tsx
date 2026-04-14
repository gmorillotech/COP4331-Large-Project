import { useEffect, useRef, useCallback } from 'react';
import { useMap, AdvancedMarker } from '@vis.gl/react-google-maps';
import { snapToNearbyPolygonBoundaries } from '../../lib/adminGeometry.ts';
import './RedrawMerge.css';

type LatLng = {
  latitude: number;
  longitude: number;
};

type PolygonEditorProps = {
  vertices: LatLng[];
  onChange: (vertices: LatLng[]) => void;
  childLocations: LatLng[];
  snapPolygons?: LatLng[][];
};

// Check whether a point is inside a polygon using ray-casting algorithm
function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].latitude;
    const yi = polygon[i].longitude;
    const xj = polygon[j].latitude;
    const yj = polygon[j].longitude;
    const intersect =
      yi > point.longitude !== yj > point.longitude &&
      point.latitude < ((xj - xi) * (point.longitude - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function PolygonEditor({ vertices, onChange, childLocations, snapPolygons }: PolygonEditorProps) {
  const map = useMap();
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  // Prevents feedback loop: when we push path changes to React state,
  // the resulting re-render should not push the same data back to the polygon
  const isSyncing = useRef(false);
  // Prevents recursion when a snap-driven setAt triggers another set_at event
  const isSnapping = useRef(false);
  // Keep latest snapPolygons accessible to path listeners without re-attaching
  const snapPolygonsRef = useRef<LatLng[][] | undefined>(snapPolygons);
  useEffect(() => {
    snapPolygonsRef.current = snapPolygons;
  }, [snapPolygons]);

  // Snap is opt-in: only apply while Shift is held. Google Maps' path events
  // (set_at, insert_at) don't expose modifier-key state, so we track Shift at
  // the window level.
  const shiftHeldRef = useRef(false);
  useEffect(() => {
    const updateFromEvent = (e: KeyboardEvent | MouseEvent) => {
      shiftHeldRef.current = e.shiftKey;
    };
    const onBlur = () => {
      shiftHeldRef.current = false;
    };
    window.addEventListener('keydown', updateFromEvent);
    window.addEventListener('keyup', updateFromEvent);
    window.addEventListener('mousemove', updateFromEvent);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', updateFromEvent);
      window.removeEventListener('keyup', updateFromEvent);
      window.removeEventListener('mousemove', updateFromEvent);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const hasEnoughVertices = vertices.length >= 3;
  const allChildrenInside =
    hasEnoughVertices &&
    childLocations.every((child) => pointInPolygon(child, vertices));
  const isValid = hasEnoughVertices && allChildrenInside;

  const syncPathToState = useCallback(() => {
    const polygon = polygonRef.current;
    if (!polygon || isSyncing.current) return;

    const path = polygon.getPath();
    const newVertices: LatLng[] = [];
    for (let i = 0; i < path.getLength(); i++) {
      const pt = path.getAt(i);
      newVertices.push({ latitude: pt.lat(), longitude: pt.lng() });
    }
    isSyncing.current = true;
    onChange(newVertices);
    // Allow re-sync after React processes the update
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, [onChange]);

  const snapVertexAt = useCallback((index: number) => {
    if (!shiftHeldRef.current) return;
    const polygon = polygonRef.current;
    const targets = snapPolygonsRef.current;
    if (!polygon || !targets || targets.length === 0) return;
    const path = polygon.getPath();
    if (index < 0 || index >= path.getLength()) return;
    const pt = path.getAt(index);
    const candidate: LatLng = { latitude: pt.lat(), longitude: pt.lng() };
    const snapped = snapToNearbyPolygonBoundaries(candidate, targets);
    if (!snapped) return;
    if (
      Math.abs(snapped.latitude - candidate.latitude) < 1e-12 &&
      Math.abs(snapped.longitude - candidate.longitude) < 1e-12
    ) {
      return;
    }
    isSnapping.current = true;
    try {
      path.setAt(index, new google.maps.LatLng(snapped.latitude, snapped.longitude));
    } finally {
      isSnapping.current = false;
    }
  }, []);

  function attachPathListeners(path: google.maps.MVCArray<google.maps.LatLng>) {
    const onSetAt = (index: number) => {
      if (isSnapping.current) return;
      snapVertexAt(index);
      syncPathToState();
    };
    const onInsertAt = (index: number) => {
      if (isSnapping.current) return;
      snapVertexAt(index);
      syncPathToState();
    };
    const onRemoveAt = () => {
      if (isSnapping.current) return;
      syncPathToState();
    };
    const listeners = [
      google.maps.event.addListener(path, 'set_at', onSetAt),
      google.maps.event.addListener(path, 'insert_at', onInsertAt),
      google.maps.event.addListener(path, 'remove_at', onRemoveAt),
    ];
    return () => listeners.forEach((l) => google.maps.event.removeListener(l));
  }

  const pathCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!map) return;

    const fillColor = isValid ? '#007bff' : '#dc3545';

    if (!polygonRef.current) {
      const polygon = new google.maps.Polygon({
        map,
        paths: vertices.map((v) => ({ lat: v.latitude, lng: v.longitude })),
        editable: true,
        draggable: false,
        fillColor,
        fillOpacity: 0.2,
        strokeColor: fillColor,
        strokeWeight: 2,
        strokeOpacity: 0.8,
      });

      pathCleanupRef.current = attachPathListeners(polygon.getPath());

      // Right-click or double-click a vertex to remove it
      const removeVertex = (e: google.maps.PolyMouseEvent) => {
        const path = polygon.getPath();
        if (e.vertex != null && path.getLength() > 1) {
          path.removeAt(e.vertex);
          syncPathToState();
        }
      };
      google.maps.event.addListener(polygon, 'rightclick', removeVertex);
      google.maps.event.addListener(polygon, 'dblclick', removeVertex);

      polygonRef.current = polygon;
    } else {
      polygonRef.current.setOptions({ fillColor, strokeColor: fillColor });

      // Update path if vertices changed externally (not from our own sync)
      if (!isSyncing.current) {
        const path = polygonRef.current.getPath();
        const currentLen = path.getLength();

        let needsUpdate = currentLen !== vertices.length;
        if (!needsUpdate) {
          for (let i = 0; i < currentLen; i++) {
            const pt = path.getAt(i);
            if (
              Math.abs(pt.lat() - vertices[i].latitude) > 1e-8 ||
              Math.abs(pt.lng() - vertices[i].longitude) > 1e-8
            ) {
              needsUpdate = true;
              break;
            }
          }
        }

        if (needsUpdate) {
          // Remove old path listeners before replacing the path
          pathCleanupRef.current?.();
          const newPath = vertices.map(
            (v) => new google.maps.LatLng(v.latitude, v.longitude),
          );
          polygonRef.current.setPath(newPath);
          pathCleanupRef.current = attachPathListeners(polygonRef.current.getPath());
        }
      }
    }
  }, [map, vertices, isValid, syncPathToState]);

  useEffect(() => {
    if (!map) return;

    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const raw: LatLng = {
        latitude: e.latLng.lat(),
        longitude: e.latLng.lng(),
      };
      const shiftHeld =
        (e.domEvent as MouseEvent | undefined)?.shiftKey ?? shiftHeldRef.current;
      const targets = snapPolygonsRef.current;
      const snapped = shiftHeld && targets && targets.length > 0
        ? snapToNearbyPolygonBoundaries(raw, targets)
        : null;
      const newVertex = snapped ?? raw;
      onChange([...vertices, newVertex]);
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, vertices, onChange]);

  // Cleanup polygon and listeners on unmount
  useEffect(() => {
    return () => {
      pathCleanupRef.current?.();
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
        polygonRef.current = null;
      }
    };
  }, []);

  let validationMessage = '';
  if (!hasEnoughVertices) {
    validationMessage = `Need at least 3 vertices (currently ${vertices.length}). Click the map to add.`;
  } else if (!allChildrenInside) {
    validationMessage = 'Polygon does not contain all child locations.';
  }

  const hasSnapTargets = (snapPolygons?.length ?? 0) > 0;

  return (
    <>
      {childLocations.map((loc, i) => (
        <AdvancedMarker
          key={`child-${i}`}
          position={{ lat: loc.latitude, lng: loc.longitude }}
          title="Child location"
        >
          <div className="child-marker" />
        </AdvancedMarker>
      ))}

      {validationMessage && (
        <div className="polygon-invalid-hint">{validationMessage}</div>
      )}

      {hasSnapTargets && (
        <div className="polygon-snap-hint">
          <strong>Hold Shift</strong> while clicking or dragging to snap onto a
          neighboring group boundary. To create a <strong>shared edge</strong>
          (required for merging), Shift-snap <strong>two consecutive
          vertices</strong> onto the <em>same</em> edge of a neighboring group.
        </div>
      )}
    </>
  );
}

export { pointInPolygon };
export default PolygonEditor;
