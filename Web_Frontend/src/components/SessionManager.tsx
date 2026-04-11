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
  noisesamples: number[];
  avgNoise: number | null;
};

type StudyLocation = {
  studyLocationId: string;
  name: string;
  buildingName: string;
  latitude: number;
  longitude: number;
  locationGroupId: string;
};

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

  const [sessionState, setSessionState] = useState<SessionState>({
    isActive: false,
    studyLocationId: null,
    locationName: null,
    buildingName: null,
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

        await Promise.all(
          groups.map(async (group: any) => {
            const groupId = (group.locationGroupId ?? '').trim();
            const groupName = (group.name ?? 'Unknown Building').trim();
            if (!groupId) return;

            try {
              const locsRes = await fetch(
                apiUrl(`/api/locations/groups/${encodeURIComponent(groupId)}/locations`),
              );
              if (!locsRes.ok) return;
              const locs: any[] = await locsRes.json();

              for (const loc of locs) {
                const id = (loc.studyLocationId ?? '').trim();
                if (!id) continue;
                const floorLabel = (loc.floorLabel ?? '').trim();
                collected.push({
                  studyLocationId: id,
                  // Display name matches sidebar's formatLocationHeading logic
                  name: [groupName, floorLabel].filter(Boolean).join(' · '),
                  buildingName: groupName,
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
      } catch {
        // silent — fallback to API-based lookup if needed
      }
    }

    loadAllLocations();
  }, []);

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

  // ── Local distance helpers (no API call, no radius limit) ──────────────────
  // Mirrors Flutter's LocalStudyLocationResolver exactly.

  function findNearbyLocationsLocal(lat: number, lng: number): StudyLocation[] {
    // Return all locations sorted by distance (no hard radius cut-off —
    // let the group-picker show the nearest building's spots).
    if (allLocations.length === 0) return [];
    return [...allLocations].sort(
      (a, b) =>
        haversineMeters(lat, lng, a.latitude, a.longitude) -
        haversineMeters(lat, lng, b.latitude, b.longitude),
    );
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

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserCoords({ lat: latitude, lng: longitude });

        // ── Local matching — mirrors Flutter's LocalStudyLocationResolver ──
        const sorted = findNearbyLocationsLocal(latitude, longitude);

        if (sorted.length === 0) {
          // No locations loaded yet — show a helpful message instead of a fake spot
          setIsError(true);
          setMessage('Location data not loaded yet. Please wait a moment and try again.');
          return;
        }

        // Group by locationGroupId (real group ID now that we fetch from /groups)
        const groups = new Map<string, StudyLocation[]>();
        for (const loc of sorted) {
          const key = loc.locationGroupId || `_solo_${loc.studyLocationId}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(loc);
        }

        // The nearest location's group is the first key inserted
        const nearestLoc = sorted[0];
        const nearestGroupKey = nearestLoc.locationGroupId || `_solo_${nearestLoc.studyLocationId}`;
        const groupLocations = groups.get(nearestGroupKey)!;

        if (groupLocations.length === 1) {
          confirmAndBeginSession(groupLocations[0]);
          return;
        }

        // Multiple spots in the nearest building — let the user pick
        setNearbyLocations(groupLocations);
        setShowLocationPicker(true);
        setIsError(false);
        setMessage('');
      },
      () => {
        setIsError(true);
        setMessage('Could not get your location. Please try again.');
      },
    );
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
      noisesamples: [],
      avgNoise: null,
    });
    setIsError(false);
    setMessage('');
  }

  function endSession() {
    isRecordingRef.current = false;

    const samples = samplesRef.current;
    if (samples.length < 10) {
      setIsError(true);
      setMessage(
        `Not enough samples yet (${samples.length}/10 minimum). Keep recording a bit longer.`,
      );
      isRecordingRef.current = true; // re-enable recording
      return;
    }

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
    if (!sessionState.studyLocationId || samples.length < 10) return;

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const max = Math.max(...samples);
    const variance = samples.reduce((sum, val) => sum + (val - avg) ** 2, 0) / samples.length;

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

      setShowCreateGroupModal(false);
      setCreateGroupForm({ groupName: '', firstAreaName: '', floor: '', description: '' });
      setIsError(false);
      setMessage(`"${createGroupForm.groupName.trim()}" created successfully!`);
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
      const floorLabel = createLocationForm.floor.trim();
      const newStudyLocation: StudyLocation = {
        studyLocationId: newLoc.studyLocationId,
        name: [targetGroupName, floorLabel].filter(Boolean).join(' · '),
        buildingName: targetGroupName ?? '',
        latitude: userCoords.lat,
        longitude: userCoords.lng,
        locationGroupId: targetGroupId,
      };
      setAllLocations((prev) => [...prev, newStudyLocation]);

      setShowCreateLocationModal(false);
      setCreateLocationForm({ areaName: '', floor: '', description: '' });
      setIsError(false);
      setMessage(`"${createLocationForm.areaName.trim()}" added to ${targetGroupName}!`);
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

  const sampleCount = sessionState.noisesamples.length;
  const hasEnoughSamples = sampleCount >= 10;
  const noiseBarPosition = currentDb !== null ? dbToBarPosition(currentDb) : 0;
  const qualitativeLabel = currentDb !== null ? dbToQualitative(currentDb) : '—';
  const tierIndex = currentDb !== null ? dbToTierIndex(currentDb) : 0;
  const currentMarkerSrc = NOISE_TIER_MARKERS[tierIndex][markerVariant];
  // const selectedOccupancy = OCCUPANCY_LEVELS.find((o) => o.level === occupancyLevel) ?? null;
  // dot position: Full(5)=0% top, Empty(1)=100% bottom
  const occupancyDotPosition = occupancyLevel !== null ? ((5 - occupancyLevel) / 4) * 100 : null;

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
            <p className="session-confirm__location-name">{pendingLocation.name}</p>
            {pendingLocation.buildingName && (
              <p className="session-confirm__building">Building: {pendingLocation.buildingName}</p>
            )}
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
              🏛️ Create Group + First Study Area
            </button>
          </div>
        </div>
      )}

      {/* ── Create Location Group Modal ───────────────────── */}
      {showCreateGroupModal && (
        <div className="session-overlay">
          <div className="session-modal session-modal--form">
            <h2>Create Location Study Group</h2>
            <p className="session-modal__desc">
              This creates a new 60 meter radius group and the first study area inside it. You can
              adjust the group center, but your current position must still be inside the new boundary.
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

        {/* Active-session location banner */}
        {sessionState.isActive && (
          <div className="dc-location-banner">
            <img src={locationPinSrc} alt="" className="dc-location-banner__pin" style={{ width: 24, height: 24 }} />
            <div className="dc-location-banner__text">
              <span className="dc-location-banner__name">{sessionState.locationName}</span>
              {sessionState.buildingName && (
                <span className="dc-location-banner__building">{sessionState.buildingName}</span>
              )}
            </div>
            <span className={`dc-location-banner__samples ${hasEnoughSamples ? 'ready' : ''}`}>
              {sampleCount} / 10 {hasEnoughSamples ? '✓' : ''}
            </span>
          </div>
        )}

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
              <p className="dc-col__title">Occupancy</p>
              <div className="dc-occupancy-layout">
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
        </div>

        {message && (
          <p className={`session-bar__message ${isError ? 'error' : 'success'}`}>
            {message}
          </p>
        )}
      </div>
    </>
  );
}

export default SessionManager;
