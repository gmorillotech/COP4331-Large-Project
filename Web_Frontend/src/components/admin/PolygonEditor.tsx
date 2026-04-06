import { useEffect, useRef, useCallback } from 'react';
import { useMap, AdvancedMarker } from '@vis.gl/react-google-maps';
import './RedrawMerge.css';

type LatLng = {
  latitude: number;
  longitude: number;
};

type PolygonEditorProps = {
  vertices: LatLng[];
  onChange: (vertices: LatLng[]) => void;
  childLocations: LatLng[];
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

function PolygonEditor({ vertices, onChange, childLocations }: PolygonEditorProps) {
  const map = useMap();
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  // Prevents feedback loop: when we push path changes to React state,
  // the resulting re-render should not push the same data back to the polygon
  const isSyncing = useRef(false);

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

  function attachPathListeners(path: google.maps.MVCArray<google.maps.LatLng>) {
    const listeners = [
      google.maps.event.addListener(path, 'set_at', syncPathToState),
      google.maps.event.addListener(path, 'insert_at', syncPathToState),
      google.maps.event.addListener(path, 'remove_at', syncPathToState),
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
      const newVertex: LatLng = {
        latitude: e.latLng.lat(),
        longitude: e.latLng.lng(),
      };
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
    </>
  );
}

export { pointInPolygon };
export default PolygonEditor;
