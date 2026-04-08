import { useState, useEffect, useRef } from 'react';
import { apiUrl } from '../config';
import './SessionManager.css';

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

function SessionManager() {
  const [micPermission, setMicPermission] = useState<PermissionStatus>('pending');
  const [locationPermission, setLocationPermission] = useState<PermissionStatus>('pending');
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  const [sessionState, setSessionState] = useState<SessionState>({
    isActive: false,
    studyLocationId: null,
    locationName: null,
    buildingName: null,
    noisesamples: [],
    avgNoise: null,
  });

  const [occupancyLevel, setOccupancyLevel] = useState<number>(3);
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

  async function findNearestLocation(coords: GeolocationCoordinates): Promise<StudyLocation | null> {
    try {
      const response = await fetch(
        apiUrl(`/api/locations/closest?latitude=${coords.latitude}&longitude=${coords.longitude}`),
      );
      if (!response.ok) return null;
      const data = await response.json();
      if (!data || !data.studyLocationId) return null;
      return {
        studyLocationId: data.studyLocationId,
        name: data.name ?? 'Study Location',
        buildingName: data.buildingName ?? '',
        latitude: data.latitude ?? coords.latitude,
        longitude: data.longitude ?? coords.longitude,
        locationGroupId: data.locationGroupId ?? '',
      };
    } catch {
      return null;
    }
  }

  async function findNearbyLocations(coords: GeolocationCoordinates): Promise<StudyLocation[]> {
    try {
      const response = await fetch(
        apiUrl(
          `/api/locations/search?lat=${coords.latitude}&lng=${coords.longitude}&maxRadiusMeters=150&includeGroups=false&sortBy=distance`,
        ),
      );
      if (!response.ok) return [];
      const data = await response.json();
      return (data.results ?? [])
        .filter((node: any) => node.kind === 'location')
        .map((node: any) => ({
          studyLocationId: node.id,
          name: node.title,
          buildingName: node.buildingName ?? '',
          latitude: node.lat,
          longitude: node.lng,
          locationGroupId: '',
        }));
    } catch {
      return [];
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

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setUserCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        const locations = await findNearbyLocations(position.coords);

        if (locations.length === 0) {
          // Always find nearest — no "no spots" error
          const nearest = await findNearestLocation(position.coords);
          if (!nearest) {
            // Absolute last resort: still don't error, just use a placeholder
            confirmAndBeginSession({
              studyLocationId: '',
              name: 'Nearest Study Spot',
              buildingName: '',
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              locationGroupId: '',
            });
            return;
          }
          confirmAndBeginSession(nearest);
          return;
        }

        if (locations.length === 1) {
          confirmAndBeginSession(locations[0]);
          return;
        }

        setNearbyLocations(locations);
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

  const sampleCount = sessionState.noisesamples.length;
  const hasEnoughSamples = sampleCount >= 10;
  const noiseBarPosition = currentDb !== null ? dbToBarPosition(currentDb) : 0;
  const qualitativeLabel = currentDb !== null ? dbToQualitative(currentDb) : '—';
  const selectedOccupancy = OCCUPANCY_LEVELS.find((o) => o.level === occupancyLevel);
  const occupancyDotPosition = ((5 - occupancyLevel) / 4) * 100;

  return (
    <>
      {/* ── Permission Modal ─────────────────────────────── */}
      {showPermissionModal && (
        <div className="session-overlay">
          <div className="session-modal">
            <div className="session-modal__icon">📍🎙️</div>
            <h2>Enable Location &amp; Microphone</h2>
            <p>
              To track noise levels at your study space and contribute to live data,
              we need access to your microphone and location.
            </p>
            <ul className="session-modal__list">
              <li>📍 Location — to find which study space you're at</li>
              <li>🎙️ Microphone — to measure ambient noise levels</li>
            </ul>
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
                  📍 {loc.name}
                  {loc.buildingName ? <span className="session-location-btn__building"> — {loc.buildingName}</span> : null}
                </button>
              ))}
            </div>
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

      {/* ── Location Confirmation Modal ────────────────────── */}
      {showLocationConfirm && pendingLocation && (
        <div className="session-overlay">
          <div className="session-modal">
            <div className="session-modal__icon">📍</div>
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

        {/* Session location banner */}
        {sessionState.isActive && (
          <div className="dc-location-banner">
            <span className="dc-location-banner__pin">📍</span>
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

        {/* ── Decibel Readout ─────────────────────────────── */}
        <div className="dc-panel">
          <p className="dc-panel__label">DECIBEL READOUT</p>
          <div className="dc-db-readout">
            <span className="dc-db-readout__number">
              {currentDb !== null ? currentDb.toFixed(1) : '--'}
            </span>
            <span className="dc-db-readout__unit">dB</span>
          </div>
          {micPermission !== 'granted' && (
            <p className="dc-panel__sublabel">Microphone access needed</p>
          )}
        </div>

        {/* ── Qualitative Noise Bar ─────────────────────────── */}
        <div className="dc-panel">
          <p className="dc-panel__label">QUALITATIVE NOISE</p>
          <p className="dc-noise-quality-label">{qualitativeLabel}</p>
          <div className="dc-noise-bar-wrap">
            <div className="dc-noise-bar">
              <div
                className="dc-noise-bar__indicator"
                style={{ left: `${noiseBarPosition}%` }}
              />
            </div>
            <div className="dc-noise-bar-ends">
              <span>Quiet</span>
              <span>Loud</span>
            </div>
          </div>
        </div>

        {/* ── Mic Button ──────────────────────────────────── */}
        <div className="session-mic-container">
          <p className="session-mic-hint">
            {sessionState.isActive
              ? 'Tap to end session and submit'
              : 'Tap the microphone to start a session'}
          </p>
          <button
            type="button"
            className={`session-mic-btn ${sessionState.isActive ? 'session-mic-btn--active' : ''}`}
            onClick={handleMicClick}
            disabled={
              isSubmitting ||
              (micPermission === 'denied') ||
              (locationPermission === 'denied')
            }
            aria-label={sessionState.isActive ? 'End Session' : 'Start Session'}
          >
            🎙️
          </button>
          <p className="session-mic-label">
            {isSubmitting ? 'Submitting...' : sessionState.isActive ? 'End Session' : 'Start Session'}
          </p>
        </div>

        {/* ── Occupancy Vertical Slider ─────────────────────── */}
        <div className="dc-panel dc-panel--row">
          <div className="dc-occupancy-wrap">
            <p className="dc-panel__label">OCCUPANCY</p>
            <p className="dc-occupancy-current" style={{ color: selectedOccupancy?.color ?? '#888' }}>
              {selectedOccupancy?.label ?? 'Moderate'}
            </p>
            <p className="dc-occupancy-sub">Stored as a 1–5 A1/report value</p>
            <div className="dc-occupancy-layout">
              <div className="dc-occupancy-bar-wrap">
                <div className="dc-occupancy-bar">
                  <div
                    className="dc-occupancy-bar__dot"
                    style={{ top: `${occupancyDotPosition}%` }}
                  />
                </div>
              </div>
              <div className="dc-occupancy-labels">
                {OCCUPANCY_LEVELS.map(({ level, label, color }) => (
                  <button
                    key={level}
                    type="button"
                    className={`dc-occupancy-label-btn ${occupancyLevel === level ? 'active' : ''}`}
                    style={{ color: occupancyLevel === level ? color : '#888' }}
                    onClick={() => setOccupancyLevel(level)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Create Group Button ───────────────────────────── */}
        <button
          type="button"
          className="dc-create-group-btn"
          onClick={openCreateGroupModal}
        >
          🏛️ Create Group + First Study Area
        </button>

        {/* ── Status Message ────────────────────────────────── */}
        {message && (
          <p className={`session-bar__message ${isError ? 'error' : 'success'}`}>
            {message}
          </p>
        )}

        {/* ── Permission Denied Warnings ────────────────────── */}
        {(micPermission === 'denied' || locationPermission === 'denied') && (
          <p className="session-bar__denied">
            {micPermission === 'denied' && locationPermission === 'denied'
              ? '⚠️ Microphone and location access denied. Please update browser permissions.'
              : micPermission === 'denied'
              ? '⚠️ Microphone access denied. Please update browser permissions.'
              : '⚠️ Location access denied. Please update browser permissions.'}
          </p>
        )}
      </div>
    </>
  );
}

export default SessionManager;
