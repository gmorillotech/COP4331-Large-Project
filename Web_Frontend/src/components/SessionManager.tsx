import { useState, useEffect, useRef } from 'react';
import { apiUrl } from '../config';
import './SessionManager.css';

// ── Noise-level marker SVGs (15 total: 5 tiers × 3 variants) ──────────────
import m1_1 from '../assets/markers/1-1.svg';
import m1_2 from '../assets/markers/1-2.svg';
import m1_3 from '../assets/markers/1-3.svg';
import m2_1 from '../assets/markers/2-1.svg';
import m2_2 from '../assets/markers/2-2.svg';
import m2_3 from '../assets/markers/2-3.svg';
import m3_1 from '../assets/markers/3-1.svg';
import m3_2 from '../assets/markers/3-2.svg';
import m3_3 from '../assets/markers/3-3.svg';
import m4_1 from '../assets/markers/4-1.svg';
import m4_2 from '../assets/markers/4-2.svg';
import m4_3 from '../assets/markers/4-3.svg';
import m5_1 from '../assets/markers/5-1.svg';
import m5_2 from '../assets/markers/5-2.svg';
import m5_3 from '../assets/markers/5-3.svg';
import locationPinSrc from '../assets/markers/LocationPin.svg';
import microphoneSrc from '../assets/microphone.svg';

// Indexed 0–4: Quiet → Moderate → Lively → Loud → Very Loud
const NOISE_TIER_MARKERS: string[][] = [
  [m1_1, m1_2, m1_3],
  [m2_1, m2_2, m2_3],
  [m3_1, m3_2, m3_3],
  [m4_1, m4_2, m4_3],
  [m5_1, m5_2, m5_3],
];

function dbToTierIndex(db: number): number {
  if (db < 40) return 0; // Quiet
  if (db < 55) return 1; // Moderate
  if (db < 65) return 2; // Lively
  if (db < 75) return 3; // Loud
  return 4;              // Very Loud
}

type PermissionStatus = 'pending' | 'granted' | 'denied' | 'requesting';

type SessionState = {
  isActive: boolean;
  studyLocationId: string | null;
  locationName: string | null;
  buildingName: string | null;
  floorLabel: string | null;
  noisesamples: number[];
  avgNoise: number | null;
};

type StudyLocation = {
  studyLocationId: string;
  name: string;
  buildingName: string;
  floorLabel: string;
  latitude: number;
  longitude: number;
  locationGroupId: string;
};

type LocationGroup = {
  locationGroupId: string;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusMeters: number | null;
  polygon: { lat: number; lng: number }[] | null;
};

// Fallback radius when backend omits polygon + radius — mirrors Flutter's
// 60m default hex-group boundary (data_collection_backend.dart:209).
const DEFAULT_GROUP_RADIUS_M = 60;

// Ray-casting point-in-polygon — mirrors Flutter's _pointInPolygon
// (data_collection_workflow.dart:531-560).
function pointInPolygon(lat: number, lng: number, poly: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng;
    const yi = poly[i].lat;
    const xj = poly[j].lng;
    const yj = poly[j].lat;
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Polygon first, radius fallback — mirrors DataCollectionLocationGroup.contains
// (data_collection_workflow.dart:78-98).
function groupContains(group: LocationGroup, lat: number, lng: number): boolean {
  if (group.polygon && group.polygon.length >= 3) {
    return pointInPolygon(lat, lng, group.polygon);
  }
  const radius = group.radiusMeters ?? DEFAULT_GROUP_RADIUS_M;
  return (
    haversineMeters(lat, lng, group.centerLatitude, group.centerLongitude) <= radius
  );
}

type CreateGroupForm = {
  groupName: string;
  firstAreaName: string;
  floor: string;
  description: string;
};

type CreateLocationForm = {
  areaName: string;
  floor: string;
  description: string;
};

const OCCUPANCY_LEVELS = [
  { level: 5, label: 'Full', color: '#ef4444' },
  { level: 4, label: 'Busy', color: '#f97316' },
  { level: 3, label: 'Moderate', color: '#eab308' },
  { level: 2, label: 'Sparse', color: '#84cc16' },
  { level: 1, label: 'Empty', color: '#22c55e' },
];

function dbToQualitative(db: number): string {
  if (db < 40) return 'Quiet';
  if (db < 55) return 'Moderate';
  if (db < 65) return 'Lively';
  if (db < 75) return 'Loud';
  return 'Very Loud';
}

function dbToBarPosition(db: number): number {
  return Math.max(0, Math.min(100, ((db - 30) / 60) * 100));
}

// Haversine distance in metres (mirrors Flutter's _haversineDistanceMeters)
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function SessionManager() {
  const [micPermission, setMicPermission] = useState<PermissionStatus>('pending');
  const [locationPermission, setLocationPermission] = useState<PermissionStatus>('pending');
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  // All study locations fetched once on mount, exactly as Flutter does it
  const [allLocations, setAllLocations] = useState<StudyLocation[]>([]);
  const [allGroups, setAllGroups] = useState<LocationGroup[]>([]);
  // Tracks whether the initial /api/locations/groups fetch has resolved, so we
  // can distinguish "still loading" from "genuinely empty" for forced setup.
  const [hasLoadedLocations, setHasLoadedLocations] = useState(false);

  const [sessionState, setSessionState] = useState<SessionState>({
    isActive: false,
    studyLocationId: null,
    locationName: null,
    buildingName: null,
    floorLabel: null,
    noisesamples: [],
    avgNoise: null,
  });

  const [occupancyLevel, setOccupancyLevel] = useState<number | null>(null);
  const [currentDb, setCurrentDb] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Location picker & confirmation
  const [nearbyLocations, setNearbyLocations] = useState<StudyLocation[]>([]);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showLocationConfirm, setShowLocationConfirm] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<StudyLocation | null>(null);

  // Create Group modal
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [createGroupForm, setCreateGroupForm] = useState<CreateGroupForm>({
    groupName: '',
    firstAreaName: '',
    floor: '',
    description: '',
  });
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState('');

  // Add Location to existing group modal
  const [showCreateLocationModal, setShowCreateLocationModal] = useState(false);
  const [createLocationForm, setCreateLocationForm] = useState<CreateLocationForm>({
    areaName: '',
    floor: '',
    description: '',
  });
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
  const [targetGroupName, setTargetGroupName] = useState<string | null>(null);
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [createLocationError, setCreateLocationError] = useState('');

  // Cycles 0 → 1 → 2 → 0 every 1.5 s to alternate between the 3 SVG variants
  const [markerVariant, setMarkerVariant] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setMarkerVariant((v) => (v + 1) % 3), 750);
    return () => window.clearInterval(id);
  }, []);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const monitorIntervalRef = useRef<number | null>(null);
  const locationWatchRef = useRef<number | null>(null);
  const samplesRef = useRef<number[]>([]);
  const isRecordingRef = useRef(false);

  // Show permission modal on mount
  useEffect(() => {
    setShowPermissionModal(true);
  }, []);

  // Start live audio monitoring once mic is granted
  useEffect(() => {
    if (micPermission === 'granted') {
      startLiveMonitoring();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micPermission]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLiveMonitoring();
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(id);
  }, [message]);

  // ── Fetch ALL locations once on mount (mirrors Flutter's fetchStudyLocations) ──
  // GET /api/locations/groups → for each group → GET /api/locations/groups/:id/locations
  // This gives us buildingName from the group + full location details, with no radius filter.
  useEffect(() => {
    async function loadAllLocations() {
      try {
        const groupsRes = await fetch(apiUrl('/api/locations/groups'));
        if (!groupsRes.ok) return;
        const groups: any[] = await groupsRes.json();

        const collected: StudyLocation[] = [];
        const collectedGroups: LocationGroup[] = [];

        await Promise.all(
          groups.map(async (group: any) => {
            const groupId = (group.locationGroupId ?? '').trim();
            const groupName = (group.name ?? 'Unknown Building').trim();
            if (!groupId) return;

            // Capture group boundary info for containment checks. The backend
            // may provide `polygon`, `centerLatitude/Longitude`, `radiusMeters`,
            // or any subset — we fall back to 60m at evaluation time.
            const rawPoly: any[] | null = Array.isArray(group.polygon) ? group.polygon : null;
            const polygon = rawPoly
              ? rawPoly
                  .map((p: any) => ({
                    lat: Number(p.lat ?? p.latitude),
                    lng: Number(p.lng ?? p.longitude),
                  }))
                  .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
              : null;
            const centerLat = Number(group.centerLatitude);
            const centerLng = Number(group.centerLongitude);
            if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
              collectedGroups.push({
                locationGroupId: groupId,
                name: groupName,
                centerLatitude: centerLat,
                centerLongitude: centerLng,
                radiusMeters: Number.isFinite(Number(group.radiusMeters))
                  ? Number(group.radiusMeters)
                  : null,
                polygon: polygon && polygon.length >= 3 ? polygon : null,
              });
            }

            try {
              const locsRes = await fetch(
                apiUrl(`/api/locations/groups/${encodeURIComponent(groupId)}/locations`),
              );
              if (!locsRes.ok) return;
              const locs: any[] = await locsRes.json();

              for (const loc of locs) {
                const id = (loc.studyLocationId ?? '').trim();
                if (!id) continue;
                const locName = (loc.name ?? '').trim();
                const floorLabel = (loc.floorLabel ?? '').trim();
                collected.push({
                  studyLocationId: id,
                  // The display name is the user-entered location/area name —
                  // the group name shows separately as buildingName.
                  name: locName || floorLabel || 'Study Area',
                  buildingName: groupName,
                  floorLabel,
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  locationGroupId: groupId,
                });
              }
            } catch {
              // skip unreachable group
            }
          }),
        );

        if (collected.length > 0) {
          setAllLocations(collected);
        }
        if (collectedGroups.length > 0) {
          setAllGroups(collectedGroups);
        }
      } catch {
        // silent — fallback to API-based lookup if needed
      } finally {
        setHasLoadedLocations(true);
      }
    }

    loadAllLocations();
  }, []);

  // ── Continuous location watch — mirrors Flutter's
  // Geolocator.getPositionStream setup in data_collection_screen.dart:69-81,
  // 477-495. Emits whenever the device's position changes; the returned
  // watch-id is cleared on unmount in the existing cleanup effect above.
  useEffect(() => {
    if (locationPermission !== 'granted') return;
    if (!navigator.geolocation) return;
    if (locationWatchRef.current !== null) return;

    locationWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* ignore transient stream errors — next fix will recover */
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    return () => {
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
    };
  }, [locationPermission]);

  // ── Boundary reaction — mirrors Flutter's _handleCoordinatesChanged
  // (data_collection_screen.dart:556-572). Only cuts off an *active* session
  // when the user walks out of its group boundary. It does NOT auto-open the
  // create-group modal on mount or on background coordinate updates — that
  // flow is user-initiated via the Start Session button only.
  useEffect(() => {
    if (!userCoords || !hasLoadedLocations) return;
    if (!sessionState.isActive || !sessionState.studyLocationId) return;

    const containing =
      allGroups.find((g) => groupContains(g, userCoords.lat, userCoords.lng)) ?? null;
    const sessionLoc = allLocations.find(
      (l) => l.studyLocationId === sessionState.studyLocationId,
    );
    const sessionGroupId = sessionLoc?.locationGroupId ?? null;

    if (sessionGroupId && (!containing || containing.locationGroupId !== sessionGroupId)) {
      cutOffSessionForLeavingGroup(sessionState.buildingName ?? 'this');
    }
  }, [
    userCoords,
    hasLoadedLocations,
    allGroups,
    allLocations,
    sessionState.isActive,
    sessionState.studyLocationId,
    sessionState.buildingName,
  ]);

  // Stops an in-flight session when the user walks out of its group boundary.
  // Mirrors _cutOffSessionForLeavingGroup (data_collection_screen.dart:663-681).
  function cutOffSessionForLeavingGroup(buildingName: string) {
    isRecordingRef.current = false;
    samplesRef.current = [];
    setSessionState({
      isActive: false,
      studyLocationId: null,
      locationName: null,
      buildingName: null,
      floorLabel: null,
      noisesamples: [],
      avgNoise: null,
    });
    setIsError(true);
    setMessage(`Recording stopped because you left the ${buildingName} location group boundary.`);
  }

  async function requestPermissions() {
    setMicPermission('requesting');
    setLocationPermission('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicPermission('granted');
    } catch {
      setMicPermission('denied');
    }

    if (!navigator.geolocation) {
      setLocationPermission('denied');
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationPermission('granted');
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => setLocationPermission('denied'),
      );
    }

    setShowPermissionModal(false);
  }

  function startLiveMonitoring() {
    if (!streamRef.current || monitorIntervalRef.current !== null) return;

    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 2048;

    const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
    source.connect(analyserRef.current);

    monitorIntervalRef.current = window.setInterval(() => {
      if (!analyserRef.current) return;

      const buffer = new Float32Array(analyserRef.current.fftSize);
      analyserRef.current.getFloatTimeDomainData(buffer);

      const rms = Math.sqrt(buffer.reduce((sum, val) => sum + val * val, 0) / buffer.length);
      const db = rms > 0 ? 20 * Math.log10(rms) + 90 : 0;

      if (db > 0) {
        setCurrentDb(Math.round(db * 10) / 10);

        // Only collect samples while a session is actively recording
        if (isRecordingRef.current) {
          samplesRef.current.push(db);
          setSessionState((prev) => ({ ...prev, noisesamples: [...samplesRef.current] }));
        }
      }
    }, 500);
  }

  function stopLiveMonitoring() {
    if (monitorIntervalRef.current !== null) {
      window.clearInterval(monitorIntervalRef.current);
      monitorIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      analyserRef.current = null;
    }
  }

  async function handleMicClick() {
    if (sessionState.isActive) {
      endSession();
      return;
    }

    if (micPermission !== 'granted' || locationPermission !== 'granted') {
      setIsError(true);
      setMessage('Please grant microphone and location permissions first.');
      return;
    }

    if (occupancyLevel === null) {
      setIsError(true);
      setMessage('Cannot start session without selecting occupancy level.');
      return;
    }

    // Use the coords already streaming in from watchPosition — requesting a
    // fresh GPS fix here (the old getCurrentPosition call) delayed the first
    // click by seconds on some devices, which made the button feel like it
    // needed multiple taps. watchPosition keeps userCoords fresh continuously.
    if (!userCoords) {
      setIsError(true);
      setMessage('Waiting for your location. Please try again in a moment.');
      return;
    }

    const { lat, lng } = userCoords;

    // ── Containment-based resolution — mirrors Flutter's resolveNearestGroup
    // (data_collection_workflow.dart:307-331).
    const containing = allGroups.find((g) => groupContains(g, lat, lng)) ?? null;

    if (!containing) {
      if (hasLoadedLocations) {
        setIsError(false);
        setMessage('');
        openCreateGroupModal();
      } else {
        setIsError(true);
        setMessage('Location data is still loading. Please try again in a moment.');
      }
      return;
    }

    const groupLocations = allLocations.filter(
      (l) => l.locationGroupId === containing.locationGroupId,
    );

    if (groupLocations.length === 0) {
      openCreateGroupModal();
      return;
    }

    if (groupLocations.length === 1) {
      confirmAndBeginSession(groupLocations[0]);
      return;
    }

    setNearbyLocations(groupLocations);
    setShowLocationPicker(true);
    setIsError(false);
    setMessage('');
  }

  function confirmAndBeginSession(location: StudyLocation) {
    setPendingLocation(location);
    setShowLocationConfirm(true);
    setShowLocationPicker(false);
    setNearbyLocations([]);
  }

  function beginSessionAtLocation(location: StudyLocation) {
    setShowLocationConfirm(false);
    setPendingLocation(null);
    samplesRef.current = [];
    isRecordingRef.current = true;
    setSessionState({
      isActive: true,
      studyLocationId: location.studyLocationId,
      locationName: location.name,
      buildingName: location.buildingName,
      floorLabel: location.floorLabel || null,
      noisesamples: [],
      avgNoise: null,
    });
    setIsError(false);
    setMessage('');
  }

  function endSession() {
    isRecordingRef.current = false;

    if (occupancyLevel === null) {
      setIsError(true);
      setMessage('Please select an occupancy level before submitting.');
      isRecordingRef.current = true;
      return;
    }
    submitReport(occupancyLevel);
  }

  async function submitReport(occupancy: number) {
    const samples = samplesRef.current;
    if (!sessionState.studyLocationId) return;

    const hasSamples = samples.length > 0;
    const avg = hasSamples ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
    const max = hasSamples ? Math.max(...samples) : 0;
    const variance = hasSamples
      ? samples.reduce((sum, val) => sum + (val - avg) ** 2, 0) / samples.length
      : 0;

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(apiUrl('/api/reports'), {
        method: 'POST',
        body: JSON.stringify({
          studyLocationId: sessionState.studyLocationId,
          avgNoise: avg,
          maxNoise: max,
          variance,
          occupancy,
        }),
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const res = await response.json();
        throw new Error(res.error || 'Failed to submit report');
      }

      setIsError(false);
      setMessage(`Report submitted for ${sessionState.locationName}! Thank you.`);
      setSessionState({
        isActive: false,
        studyLocationId: null,
        locationName: null,
        buildingName: null,
        floorLabel: null,
        noisesamples: [],
        avgNoise: null,
      });
      samplesRef.current = [];
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Failed to submit report.');
      // Re-enable recording so they can try again
      isRecordingRef.current = true;
      setSessionState((prev) => ({ ...prev, isActive: true }));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateGroup() {
    if (!userCoords) {
      setCreateGroupError('Location not available. Please grant location permissions.');
      return;
    }
    if (!createGroupForm.groupName.trim()) {
      setCreateGroupError('Group / building name is required.');
      return;
    }
    if (!createGroupForm.firstAreaName.trim()) {
      setCreateGroupError('First study area name is required.');
      return;
    }

    // Final gate: refuse to create a new group if the user is already inside
    // an existing one. Groups are boundary containers and must not overlap —
    // the correct action inside an existing group is "add a location".
    const containing =
      allGroups.find((g) => groupContains(g, userCoords.lat, userCoords.lng)) ?? null;
    if (containing) {
      setCreateGroupError(
        `You are already inside "${containing.name}". Add a new location to this group instead of creating a new group.`,
      );
      return;
    }

    setIsCreatingGroup(true);
    setCreateGroupError('');

    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Step 1: Create the location group
      const groupRes = await fetch(apiUrl('/api/locations/groups'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: createGroupForm.groupName.trim(),
          centerLatitude: userCoords.lat,
          centerLongitude: userCoords.lng,
          creatorLatitude: userCoords.lat,
          creatorLongitude: userCoords.lng,
        }),
      });

      if (!groupRes.ok) {
        const err = await groupRes.json();
        throw new Error(err.error || 'Failed to create location group.');
      }

      const group = await groupRes.json();
      const locationGroupId = group.locationGroupId;

      // Step 2: Create the first study area
      const locRes = await fetch(apiUrl(`/api/locations/groups/${encodeURIComponent(locationGroupId)}/locations`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: createGroupForm.firstAreaName.trim(),
          floorLabel: createGroupForm.floor.trim(),
          sublocationLabel: createGroupForm.description.trim(),
          latitude: userCoords.lat,
          longitude: userCoords.lng,
        }),
      });

      if (!locRes.ok) {
        const err = await locRes.json();
        throw new Error(err.error || 'Failed to create study area.');
      }

      // Sync new group + first location into allGroups/allLocations so they
      // participate in containment checks and Start Session flows immediately.
      const newLoc = await locRes.json();
      const groupName = createGroupForm.groupName.trim();
      const firstAreaName = createGroupForm.firstAreaName.trim();
      const floorLabel = createGroupForm.floor.trim();
      const newStudyLocation: StudyLocation = {
        studyLocationId: newLoc.studyLocationId,
        // Recording UI shows location name prominently — use the study-area
        // name the user just entered, not the group/building label.
        name: firstAreaName || floorLabel || 'Study Area',
        buildingName: groupName,
        floorLabel,
        latitude: userCoords.lat,
        longitude: userCoords.lng,
        locationGroupId,
      };
      const newGroup: LocationGroup = {
        locationGroupId,
        name: groupName,
        centerLatitude: Number.isFinite(Number(group.centerLatitude))
          ? Number(group.centerLatitude)
          : userCoords.lat,
        centerLongitude: Number.isFinite(Number(group.centerLongitude))
          ? Number(group.centerLongitude)
          : userCoords.lng,
        radiusMeters: Number.isFinite(Number(group.radiusMeters))
          ? Number(group.radiusMeters)
          : null,
        polygon: Array.isArray(group.polygon) && group.polygon.length >= 3
          ? group.polygon.map((p: any) => ({
              lat: Number(p.lat ?? p.latitude),
              lng: Number(p.lng ?? p.longitude),
            }))
          : null,
      };
      setAllGroups((prev) => [...prev, newGroup]);
      setAllLocations((prev) => [...prev, newStudyLocation]);

      setShowCreateGroupModal(false);
      setCreateGroupForm({ groupName: '', firstAreaName: '', floor: '', description: '' });
      setIsError(false);

      // Auto-start recording at the just-created location — one continuous flow
      beginSessionAtLocation(newStudyLocation);
    } catch (error) {
      setCreateGroupError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setIsCreatingGroup(false);
    }
  }

  async function handleCreateLocation() {
    if (!userCoords) {
      setCreateLocationError('Location not available. Please grant location permissions.');
      return;
    }
    if (!createLocationForm.areaName.trim()) {
      setCreateLocationError('Study area name is required.');
      return;
    }
    if (!targetGroupId) return;

    setIsCreatingLocation(true);
    setCreateLocationError('');

    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const locRes = await fetch(
        apiUrl(`/api/locations/groups/${encodeURIComponent(targetGroupId)}/locations`),
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: createLocationForm.areaName.trim(),
            floorLabel: createLocationForm.floor.trim(),
            sublocationLabel: createLocationForm.description.trim(),
            latitude: userCoords.lat,
            longitude: userCoords.lng,
          }),
        },
      );

      if (!locRes.ok) {
        const err = await locRes.json();
        throw new Error(err.error || 'Failed to create study area.');
      }

      const newLoc = await locRes.json();
      const areaName = createLocationForm.areaName.trim();
      const floorLabel = createLocationForm.floor.trim();
      const newStudyLocation: StudyLocation = {
        studyLocationId: newLoc.studyLocationId,
        // Show the user-entered area name — group/building label shows
        // separately below it in the recording banner.
        name: areaName || floorLabel || 'Study Area',
        buildingName: targetGroupName ?? '',
        floorLabel,
        latitude: userCoords.lat,
        longitude: userCoords.lng,
        locationGroupId: targetGroupId,
      };
      setAllLocations((prev) => [...prev, newStudyLocation]);

      setShowCreateLocationModal(false);
      setCreateLocationForm({ areaName: '', floor: '', description: '' });
      setIsError(false);

      // Auto-start recording at the just-created location — one continuous flow
      beginSessionAtLocation(newStudyLocation);
    } catch (error) {
      setCreateLocationError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setIsCreatingLocation(false);
    }
  }

  function openCreateGroupModal() {
    setCreateGroupError('');
    if (locationPermission === 'granted') {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
      );
    }

    // Group boundaries don't overlap in practice — if the user is already
    // inside an existing group, creating a new group is disallowed. Route
    // them to the add-location-in-this-group flow instead so they can add
    // another study area to the group they're already in. Mirrors Flutter's
    // "Add Study Area Here" button at data_collection_screen.dart:2062.
    if (userCoords) {
      const containing =
        allGroups.find((g) => groupContains(g, userCoords.lat, userCoords.lng)) ?? null;
      if (containing) {
        setTargetGroupId(containing.locationGroupId);
        setTargetGroupName(containing.name);
        setCreateLocationError('');
        setShowCreateLocationModal(true);
        return;
      }
    }

    setShowCreateGroupModal(true);
  }

  function pickLevelFromBarY(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    // ratio 0 = top = Full (level 5), ratio 1 = bottom = Empty (level 1)
    const index = Math.round(ratio * (OCCUPANCY_LEVELS.length - 1));
    setOccupancyLevel(OCCUPANCY_LEVELS[index].level);
  }

  function handleBarPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pickLevelFromBarY(e);
  }

  function handleBarPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons === 0) return;
    pickLevelFromBarY(e);
  }

  const noiseBarPosition = currentDb !== null ? dbToBarPosition(currentDb) : 0;
  const qualitativeLabel = currentDb !== null ? dbToQualitative(currentDb) : '—';
  const tierIndex = currentDb !== null ? dbToTierIndex(currentDb) : 0;
  const currentMarkerSrc = NOISE_TIER_MARKERS[tierIndex][markerVariant];
  const selectedOccupancy = OCCUPANCY_LEVELS.find((o) => o.level === occupancyLevel) ?? null;
  // Clamp dot so it never clips outside the 280px bar (dot radius = 12px → offset = 12/280*100)
  const DOT_OFFSET_PCT = (12 / 280) * 100;
  const occupancyDotPosition = occupancyLevel !== null
    ? DOT_OFFSET_PCT + ((5 - occupancyLevel) / 4) * (100 - 2 * DOT_OFFSET_PCT)
    : null;

  return (
    <>
      {/* ── Permission Modal ─────────────────────────────── */}
      {showPermissionModal && (
        <div className="session-overlay">
          <div className="session-modal">
            <h2>Enable Location &amp; Microphone</h2>
            <p>
              To track noise levels at your study space and contribute to live data,
              we need access to your microphone and location.
            </p>
            <p className="session-modal__note">
              Your audio is never recorded or stored — only the noise level (dB) is used.
            </p>
            <button type="button" className="session-btn session-btn--primary" onClick={requestPermissions}>
              Allow Access
            </button>
            <button type="button" className="session-btn session-btn--secondary" onClick={() => setShowPermissionModal(false)}>
              Not Now
            </button>
          </div>
        </div>
      )}

      {/* ── Location Picker Modal ─────────────────────────── */}
      {showLocationPicker && (
        <div className="session-overlay">
          <div className="session-modal">
            <h2>Which spot are you at?</h2>
            <p>We found {nearbyLocations.length} study spaces nearby. Pick the one you're at:</p>
            <div className="session-location-list">
              {nearbyLocations.map((loc) => (
                <button
                  key={loc.studyLocationId}
                  type="button"
                  className="session-location-btn"
                  onClick={() => confirmAndBeginSession(loc)}
                >
                  <img src={locationPinSrc} alt="" style={{ width: 16, height: 16, verticalAlign: 'middle', marginRight: 6 }} />
                  {loc.name}
                  {loc.buildingName ? <span className="session-location-btn__building"> — {loc.buildingName}</span> : null}
                </button>
              ))}
            </div>
            <hr className="session-modal__divider" />
            <p className="session-modal__hint">Don't see your spot?</p>
            <button
              type="button"
              className="session-btn session-btn--ghost"
              onClick={() => {
                setTargetGroupId(nearbyLocations[0].locationGroupId);
                setTargetGroupName(nearbyLocations[0].buildingName);
                setShowLocationPicker(false);
                setNearbyLocations([]);
                setShowCreateLocationModal(true);
              }}
            >
              + Add New Location in This Building
            </button>
            <button
              type="button"
              className="session-btn session-btn--secondary"
              onClick={() => { setShowLocationPicker(false); setNearbyLocations([]); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Add Location to Group Modal ───────────────────── */}
      {showCreateLocationModal && (
        <div className="session-overlay">
          <div className="session-modal session-modal--form">
            <h2>Add Location in {targetGroupName}</h2>
            <p className="session-modal__desc">
              Add a new study area to this building. Your current position will be used as the location.
            </p>

            {createLocationError && (
              <p className="session-modal__error">{createLocationError}</p>
            )}

            <div className="session-form-group">
              <label className="session-form-label">Study area name</label>
              <input
                className="session-form-input"
                type="text"
                placeholder="e.g. 2nd Floor Reading Room"
                value={createLocationForm.areaName}
                onChange={(e) => setCreateLocationForm((prev) => ({ ...prev, areaName: e.target.value }))}
              />
            </div>

            <div className="session-form-group">
              <label className="session-form-label">Floor / level (optional)</label>
              <input
                className="session-form-input"
                type="text"
                placeholder="Floor / level (optional)"
                value={createLocationForm.floor}
                onChange={(e) => setCreateLocationForm((prev) => ({ ...prev, floor: e.target.value }))}
              />
            </div>

            <div className="session-form-group">
              <label className="session-form-label">Description (optional)</label>
              <input
                className="session-form-input"
                type="text"
                placeholder="Description (optional)"
                value={createLocationForm.description}
                onChange={(e) => setCreateLocationForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="session-modal__actions">
              <button
                type="button"
                className="session-btn session-btn--secondary"
                onClick={() => { setShowCreateLocationModal(false); setCreateLocationError(''); }}
                disabled={isCreatingLocation}
              >
                Cancel
              </button>
              <button
                type="button"
                className="session-btn session-btn--primary session-btn--create"
                onClick={handleCreateLocation}
                disabled={isCreatingLocation}
              >
                {isCreatingLocation ? 'Adding...' : 'Add Location'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Location Confirmation Modal ────────────────────── */}
      {showLocationConfirm && pendingLocation && (
        <div className="session-overlay">
          <div className="session-modal">
            <div className="session-modal__icon">
              <img src={locationPinSrc} alt="" style={{ width: 40, height: 40 }} />
            </div>
            <h2>Starting session at:</h2>
            <p className="session-confirm__location-name">
              {[pendingLocation.buildingName, pendingLocation.name, pendingLocation.floorLabel]
                .filter((s) => !!s && s.trim().length > 0)
                .join(' - ')}
            </p>
            <button
              type="button"
              className="session-btn session-btn--primary"
              onClick={() => beginSessionAtLocation(pendingLocation)}
            >
              Start Recording
            </button>
            <button
              type="button"
              className="session-btn session-btn--secondary"
              onClick={() => { setShowLocationConfirm(false); setPendingLocation(null); }}
            >
              Cancel
            </button>

            <hr className="session-modal__divider" />
            <p className="session-modal__hint">Don't see your location?</p>
            <button
              type="button"
              className="session-btn session-btn--ghost"
              onClick={() => {
                setShowLocationConfirm(false);
                setPendingLocation(null);
                openCreateGroupModal();
              }}
            >
                Create New Location In This Group
            </button>
          </div>
        </div>
      )}

      {/* ── Create Location Group Modal ───────────────────── */}
      {showCreateGroupModal && (
        <div className="session-overlay">
          <div className="session-modal session-modal--form">
            <h2>Create a group to start your session</h2>
            <p className="session-modal__desc">
              You are currently not in a group. Please create a new group and a location within it to start a session.
            </p>

            {createGroupError && (
              <p className="session-modal__error">{createGroupError}</p>
            )}

            <div className="session-form-group">
              <label className="session-form-label">Group / building name</label>
              <input
                className="session-form-input"
                type="text"
                placeholder="Group / building name"
                value={createGroupForm.groupName}
                onChange={(e) => setCreateGroupForm((prev) => ({ ...prev, groupName: e.target.value }))}
              />
            </div>

            <div className="session-form-group">
              <label className="session-form-label">Group center latitude</label>
              <input
                className="session-form-input session-form-input--readonly"
                type="text"
                value={userCoords ? userCoords.lat.toFixed(6) : 'Acquiring location...'}
                readOnly
              />
            </div>

            <div className="session-form-group">
              <label className="session-form-label">Group center longitude</label>
              <input
                className="session-form-input session-form-input--readonly"
                type="text"
                value={userCoords ? userCoords.lng.toFixed(6) : 'Acquiring location...'}
                readOnly
              />
            </div>

            <div className="session-form-group">
              <label className="session-form-label">First study area name</label>
              <input
                className="session-form-input"
                type="text"
                placeholder="First study area name"
                value={createGroupForm.firstAreaName}
                onChange={(e) => setCreateGroupForm((prev) => ({ ...prev, firstAreaName: e.target.value }))}
              />
            </div>

            <div className="session-form-group">
              <label className="session-form-label">Floor / level (optional)</label>
              <input
                className="session-form-input"
                type="text"
                placeholder="Floor / level (optional)"
                value={createGroupForm.floor}
                onChange={(e) => setCreateGroupForm((prev) => ({ ...prev, floor: e.target.value }))}
              />
            </div>

            <div className="session-form-group">
              <label className="session-form-label">Description (optional)</label>
              <input
                className="session-form-input"
                type="text"
                placeholder="Description (optional)"
                value={createGroupForm.description}
                onChange={(e) => setCreateGroupForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="session-modal__actions">
              <button
                type="button"
                className="session-btn session-btn--secondary"
                onClick={() => { setShowCreateGroupModal(false); setCreateGroupError(''); }}
                disabled={isCreatingGroup}
              >
                Cancel
              </button>
              <button
                type="button"
                className="session-btn session-btn--primary session-btn--create"
                onClick={handleCreateGroup}
                disabled={isCreatingGroup}
              >
                {isCreatingGroup ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Data Collection UI ───────────────────────── */}
      <div className="dc-container">

        {/* ── Three-column layout — all in one shared card ─── */}
        <div className="dc-card dc-card--shared">
          <div className="dc-three-col">

            {/* LEFT — Noise Level */}
            <div className="dc-col">
              <p className="dc-col__title">Noise Level</p>
              <div className="dc-noise-meter">
                <span className="dc-noise-meter__db">
                  {currentDb !== null ? `${currentDb.toFixed(1)} dB` : '-- dB'}
                </span>
                <div className="dc-noise-meter__bar-outer">
                  <div className="dc-noise-meter__bar-track">
                    <div
                      className="dc-noise-meter__bar-fill"
                      style={{ height: `${noiseBarPosition}%` }}
                    />
                  </div>
                </div>
                <span className="dc-noise-meter__qualitative">{qualitativeLabel}</span>
              </div>
              {micPermission !== 'granted' && (
                <p className="dc-card__note">Mic needed</p>
              )}
            </div>

            {/* CENTER — Start Session */}
            <div className="dc-col dc-col--center">
              <p className="dc-col__title">
                {sessionState.isActive ? 'Recording' : 'Start Session'}
              </p>
              <p className="dc-card__description">
                Help other students by reporting noise and occupancy at your study spot.
              </p>
              <button
                type="button"
                className={`session-mic-btn ${sessionState.isActive ? 'session-mic-btn--active' : ''}`}
                onClick={handleMicClick}
                disabled={isSubmitting || micPermission === 'denied' || locationPermission === 'denied'}
                aria-label={sessionState.isActive ? 'End Session' : 'Start Session'}
              >
                <img src={currentMarkerSrc} alt="" className="session-mic-marker" />
                <img src={microphoneSrc} alt="" className="session-mic-icon" />
              </button>

            </div>

            {/* RIGHT — Occupancy */}
            <div className="dc-col">
              <div className="dc-occupancy-layout">
                <div className="dc-occ-bar-col">
                  <p className="dc-col__title">Occupancy</p>
                  {selectedOccupancy ? (
                    <p className="dc-occupancy-selected" style={{ color: selectedOccupancy.color }}>
                      {selectedOccupancy.label}
                    </p>
                  ) : (
                    <p className="dc-occupancy-sub">Choose level</p>
                  )}
                  <div className="dc-occupancy-bar-wrap">
                    <div
                      className="dc-occupancy-bar"
                      onPointerDown={handleBarPointerDown}
                      onPointerMove={handleBarPointerMove}
                    >
                      {occupancyDotPosition !== null && (
                        <div
                          className="dc-occupancy-bar__dot"
                          style={{ top: `${occupancyDotPosition}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="dc-occupancy-labels">
                  {OCCUPANCY_LEVELS.map(({ level, label, color }) => (
                    <button
                      key={level}
                      type="button"
                      className={`dc-occupancy-label-btn ${occupancyLevel === level ? 'active' : ''}`}
                      style={{ color: occupancyLevel === level ? color : undefined }}
                      onClick={() => setOccupancyLevel(level)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {message && (
            <p className={`session-bar__message ${isError ? 'error' : 'success'}`}>
              {message}
            </p>
          )}
        </div>

        {/* Active-session location banner — sits below the main card */}
        {sessionState.isActive && (
          <div className="dc-location-banner">
            <img src={locationPinSrc} alt="" className="dc-location-banner__pin" style={{ width: 24, height: 24 }} />
            <div className="dc-location-banner__text">
              <span className="dc-location-banner__name">
                {[sessionState.buildingName, sessionState.locationName, sessionState.floorLabel]
                  .filter((s): s is string => !!s && s.trim().length > 0)
                  .join(' - ')}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default SessionManager;
