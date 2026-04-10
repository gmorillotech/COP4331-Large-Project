import { useEffect, useRef } from 'react';
import { useMap, AdvancedMarker } from '@vis.gl/react-google-maps';
import {
  snapToPolygonBoundary,
  isPointOnPolygonEdge,
  pointInPolygon,
  canAddSplitPoint,
} from '../../lib/adminGeometry.ts';
import './RedrawMerge.css';

type Vertex = { latitude: number; longitude: number };

type SplitLineEditorProps = {
  parentVertices: Vertex[];
  splitLine: Vertex[];
  onSplitLineChange: (line: Vertex[]) => void;
  childLocations: Vertex[];
  childA: Vertex[] | null;
  childB: Vertex[] | null;
};

function verticesEqual(a: Vertex, b: Vertex, epsilon = 1e-9): boolean {
  return (
    Math.abs(a.latitude - b.latitude) <= epsilon &&
    Math.abs(a.longitude - b.longitude) <= epsilon
  );
}

function SplitLineEditor({
  parentVertices,
  splitLine,
  onSplitLineChange,
  childLocations,
  childA,
  childB,
}: SplitLineEditorProps) {
  const map = useMap();

  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const parentPolygonRef = useRef<google.maps.Polygon | null>(null);
  const childAPolygonRef = useRef<google.maps.Polygon | null>(null);
  const childBPolygonRef = useRef<google.maps.Polygon | null>(null);

  // Refs for the latest props so event handlers always see current values
  const splitLineRef = useRef(splitLine);
  splitLineRef.current = splitLine;
  const parentVerticesRef = useRef(parentVertices);
  parentVerticesRef.current = parentVertices;
  const onSplitLineChangeRef = useRef(onSplitLineChange);
  onSplitLineChangeRef.current = onSplitLineChange;

  // Determine whether the split line is "complete" — starts and ends on
  // different points of the parent polygon boundary.
  const isComplete =
    splitLine.length >= 2 &&
    isPointOnPolygonEdge(splitLine[0], parentVertices) &&
    isPointOnPolygonEdge(splitLine[splitLine.length - 1], parentVertices) &&
    !verticesEqual(splitLine[0], splitLine[splitLine.length - 1]);

  // ── Parent polygon (read-only) ──────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    if (!parentPolygonRef.current) {
      parentPolygonRef.current = new google.maps.Polygon({
        map,
        paths: parentVertices.map((v) => ({ lat: v.latitude, lng: v.longitude })),
        editable: false,
        clickable: false,
        draggable: false,
        strokeColor: '#f59e0b',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 0.1,
        zIndex: 1,
      });
    } else {
      parentPolygonRef.current.setPath(
        parentVertices.map((v) => ({ lat: v.latitude, lng: v.longitude })),
      );
    }
  }, [map, parentVertices]);

  // ── Split-line polyline ─────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    if (!polylineRef.current) {
      polylineRef.current = new google.maps.Polyline({
        map,
        path: splitLine.map((v) => ({ lat: v.latitude, lng: v.longitude })),
        strokeColor: '#e91e63',
        strokeWeight: 3,
        strokeOpacity: 1,
        zIndex: 10,
        clickable: false,
        editable: false,
      });
    } else {
      polylineRef.current.setPath(
        splitLine.map((v) => ({ lat: v.latitude, lng: v.longitude })),
      );
    }
  }, [map, splitLine]);

  // ── Child A preview polygon ─────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    if (childA) {
      const path = childA.map((v) => ({ lat: v.latitude, lng: v.longitude }));
      if (!childAPolygonRef.current) {
        childAPolygonRef.current = new google.maps.Polygon({
          map,
          paths: path,
          editable: false,
          clickable: false,
          draggable: false,
          strokeColor: '#4caf50',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#4caf50',
          fillOpacity: 0.15,
          zIndex: 3,
        });
      } else {
        childAPolygonRef.current.setPath(path);
        childAPolygonRef.current.setMap(map);
      }
    } else if (childAPolygonRef.current) {
      childAPolygonRef.current.setMap(null);
    }
  }, [map, childA]);

  // ── Child B preview polygon ─────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    if (childB) {
      const path = childB.map((v) => ({ lat: v.latitude, lng: v.longitude }));
      if (!childBPolygonRef.current) {
        childBPolygonRef.current = new google.maps.Polygon({
          map,
          paths: path,
          editable: false,
          clickable: false,
          draggable: false,
          strokeColor: '#2196f3',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#2196f3',
          fillOpacity: 0.15,
          zIndex: 3,
        });
      } else {
        childBPolygonRef.current.setPath(path);
        childBPolygonRef.current.setMap(map);
      }
    } else if (childBPolygonRef.current) {
      childBPolygonRef.current.setMap(null);
    }
  }, [map, childB]);

  // ── Map click handler — build split line ────────────────────────────
  // Enforces: only boundary snaps for start/end, interior must be inside
  // parent, no self-intersection, no parent boundary crossing.
  useEffect(() => {
    if (!map) return;

    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;

      const clicked: Vertex = {
        latitude: e.latLng.lat(),
        longitude: e.latLng.lng(),
      };

      const currentLine = splitLineRef.current;
      const parent = parentVerticesRef.current;

      // If line is already complete, ignore all clicks
      if (
        currentLine.length >= 2 &&
        isPointOnPolygonEdge(currentLine[0], parent) &&
        isPointOnPolygonEdge(currentLine[currentLine.length - 1], parent) &&
        !verticesEqual(currentLine[0], currentLine[currentLine.length - 1])
      ) {
        return;
      }

      const snapped = snapToPolygonBoundary(clicked, parent);

      if (currentLine.length === 0) {
        // First point must snap to polygon boundary (vertex or edge)
        if (!snapped) return;
        onSplitLineChangeRef.current([snapped]);
        return;
      }

      // Line started — try to finalize if click snaps to boundary
      if (snapped) {
        if (verticesEqual(snapped, currentLine[0])) return; // Same as start
        if (!canAddSplitPoint(currentLine, snapped, parent)) return;
        onSplitLineChangeRef.current([...currentLine, snapped]);
        return;
      }

      // Interior point — must be inside parent polygon
      if (!pointInPolygon(clicked, parent)) return;
      // Must not cause self-intersection or cross parent boundary
      if (!canAddSplitPoint(currentLine, clicked, parent)) return;
      onSplitLineChangeRef.current([...currentLine, clicked]);
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map]);

  // ── Right-click handler — undo last point ───────────────────────────
  useEffect(() => {
    if (!map) return;

    const listener = map.addListener('rightclick', () => {
      const currentLine = splitLineRef.current;
      if (currentLine.length === 0) return;
      onSplitLineChangeRef.current(currentLine.slice(0, -1));
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map]);

  // ── Cleanup all overlays on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      parentPolygonRef.current?.setMap(null);
      parentPolygonRef.current = null;
      childAPolygonRef.current?.setMap(null);
      childAPolygonRef.current = null;
      childBPolygonRef.current?.setMap(null);
      childBPolygonRef.current = null;
    };
  }, []);

  // ── Hint message ────────────────────────────────────────────────────
  let hint = '';
  if (splitLine.length === 0) {
    hint = 'Click the parent polygon boundary to start the split line.';
  } else if (!isComplete) {
    hint = 'Click inside the polygon to add points, then click the boundary to finish.';
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

      {hint && <div className="polygon-invalid-hint">{hint}</div>}
    </>
  );
}

export default SplitLineEditor;
