import { useState, useEffect, useRef, useCallback } from 'react';
import './SessionManager.css';

type PermissionStatus = 'pending' | 'granted' | 'denied' | 'requesting';

type SessionState = {
  isActive: boolean;
  studyLocationId: string | null;
  locationName: string | null;
  noisesamples: number[];
  avgNoise: number | null;
  occupancy: number | null;
};

type StudyLocation = {
  studyLocationId: string;
  name: string;
  latitude: number;
  longitude: number;
  locationGroupId: string;
};

function SessionManager() {
  const [micPermission, setMicPermission] = useState<PermissionStatus>('pending');
  const [locationPermission, setLocationPermission] = useState<PermissionStatus>('pending');
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>({
    isActive: false,
    studyLocationId: null,
    locationName: null,
    noisesamples: [],
    avgNoise: null,
    occupancy: null,
  });
  const [showOccupancyPicker, setShowOccupancyPicker] = useState(false);
  const [currentDb, setCurrentDb] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const samplingIntervalRef = useRef<number | null>(null);
  const locationWatchRef = useRef<number | null>(null);
  const samplesRef = useRef<number[]>([]);

  // Show permission modal on mount
  useEffect(() => {
    setShowPermissionModal(true);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioSampling();
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
      }
    };
  }, []);

  async function requestPermissions() {
    setMicPermission('requesting');
    setLocationPermission('requesting');

    // Request microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicPermission('granted');
    } catch {
      setMicPermission('denied');
    }

    // Request location
    if (!navigator.geolocation) {
      setLocationPermission('denied');
    } else {
      navigator.geolocation.getCurrentPosition(
        () => setLocationPermission('granted'),
        () => setLocationPermission('denied'),
      );
    }

    setShowPermissionModal(false);
  }

  function startAudioSampling() {
    if (!streamRef.current) return;

    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 2048;

    const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
    source.connect(analyserRef.current);

    samplesRef.current = [];

    samplingIntervalRef.current = window.setInterval(() => {
      if (!analyserRef.current) return;

      const buffer = new Float32Array(analyserRef.current.fftSize);
      analyserRef.current.getFloatTimeDomainData(buffer);

      // Calculate RMS and convert to decibels
      const rms = Math.sqrt(buffer.reduce((sum, val) => sum + val * val, 0) / buffer.length);
      const db = rms > 0 ? 20 * Math.log10(rms) + 90 : 0; // offset to get realistic dB range

      if (db > 0) {
        samplesRef.current.push(db);
        setCurrentDb(Math.round(db));
        setSessionState((prev) => ({ ...prev, noisesamples: [...samplesRef.current] }));
      }
    }, 500); // sample every 500ms
  }

  function stopAudioSampling() {
    if (samplingIntervalRef.current !== null) {
      window.clearInterval(samplingIntervalRef.current);
      samplingIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }

  async function findNearestLocation(coords: GeolocationCoordinates): Promise<StudyLocation | null> {
    try {
      const response = await fetch(
        `/api/locations/closest?latitude=${coords.latitude}&longitude=${coords.longitude}`,
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function startSession() {
    if (micPermission !== 'granted' || locationPermission !== 'granted') {
      setIsError(true);
      setMessage('Please grant microphone and location permissions first.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const location = await findNearestLocation(position.coords);

        if (!location) {
          setIsError(true);
          setMessage('No study location found nearby. Please move closer to a study space.');
          return;
        }

        setSessionState({
          isActive: true,
          studyLocationId: location.studyLocationId,
          locationName: location.name,
          noisesamples: [],
          avgNoise: null,
          occupancy: null,
        });

        startAudioSampling();
        setIsError(false);
        setMessage(`Session started at ${location.name}. Recording noise levels...`);
      },
      () => {
        setIsError(true);
        setMessage('Could not get your location. Please try again.');
      },
    );
  }

  function endSession() {
    stopAudioSampling();

    if (samplesRef.current.length < 10) {
      setIsError(true);
      setMessage(`Not enough noise samples yet (${samplesRef.current.length}/10 minimum). Keep the session going a bit longer.`);
      startAudioSampling(); // resume sampling
      return;
    }

    // Calculate stats from samples
    const avg = samplesRef.current.reduce((a, b) => a + b, 0) / samplesRef.current.length;
    const max = Math.max(...samplesRef.current);
    const variance = samplesRef.current.reduce((sum, val) => sum + (val - avg) ** 2, 0) / samplesRef.current.length;

    setSessionState((prev) => ({ ...prev, avgNoise: avg }));
    setShowOccupancyPicker(true);
    setMessage('How busy was it? Select an occupancy level to submit your report.');
    setIsError(false);
  }

  async function submitReport(occupancy: number) {
    if (!sessionState.studyLocationId || samplesRef.current.length < 10) return;

    const avg = samplesRef.current.reduce((a, b) => a + b, 0) / samplesRef.current.length;
    const max = Math.max(...samplesRef.current);
    const variance = samplesRef.current.reduce((sum, val) => sum + (val - avg) ** 2, 0) / samplesRef.current.length;

    setIsSubmitting(true);
    setShowOccupancyPicker(false);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/reports', {
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
        noisesamples: [],
        avgNoise: null,
        occupancy: null,
      });
      samplesRef.current = [];
      setCurrentDb(null);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Failed to submit report.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const sampleCount = sessionState.noisesamples.length;
  const hasEnoughSamples = sampleCount >= 10;

  return (
    <>
      {/* Permission Modal */}
      {showPermissionModal && (
        <div className="session-overlay">
          <div className="session-modal">
            <div className="session-modal__icon">📍🎙️</div>
            <h2>Enable Location & Microphone</h2>
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
            <button
              type="button"
              className="session-btn session-btn--primary"
              onClick={requestPermissions}
            >
              Allow Access
            </button>
            <button
              type="button"
              className="session-btn session-btn--secondary"
              onClick={() => setShowPermissionModal(false)}
            >
              Not Now
            </button>
          </div>
        </div>
      )}

      {/* Occupancy Picker */}
      {showOccupancyPicker && (
        <div className="session-overlay">
          <div className="session-modal">
            <h2>How busy was it?</h2>
            <p>Rate the occupancy level at <strong>{sessionState.locationName}</strong></p>
            <div className="session-occupancy-grid">
              {[
                { level: 1, label: 'Empty', emoji: '🟢' },
                { level: 2, label: 'Quiet', emoji: '🟡' },
                { level: 3, label: 'Moderate', emoji: '🟠' },
                { level: 4, label: 'Busy', emoji: '🔴' },
                { level: 5, label: 'Packed', emoji: '🔴' },
              ].map(({ level, label, emoji }) => (
                <button
                  key={level}
                  type="button"
                  className="session-occupancy-btn"
                  onClick={() => submitReport(level)}
                  disabled={isSubmitting}
                >
                  <span className="session-occupancy-btn__emoji">{emoji}</span>
                  <span className="session-occupancy-btn__level">{level}/5</span>
                  <span className="session-occupancy-btn__label">{label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="session-btn session-btn--secondary"
              onClick={() => {
                setShowOccupancyPicker(false);
                startAudioSampling();
              }}
            >
              Keep Recording
            </button>
          </div>
        </div>
      )}

      {/* Session Status Bar */}
      <div className={`session-bar ${sessionState.isActive ? 'is-active' : ''}`}>
        {!sessionState.isActive ? (
          <button
            type="button"
            className="session-btn session-btn--start"
            onClick={startSession}
            disabled={micPermission === 'denied' || locationPermission === 'denied'}
          >
            🎙️ Start Session
          </button>
        ) : (
          <div className="session-bar__active">
            <div className="session-bar__info">
              <span className="session-bar__location">📍 {sessionState.locationName}</span>
              <span className="session-bar__db">
                {currentDb !== null ? `${currentDb} dB` : 'Listening...'}
              </span>
              <span className={`session-bar__samples ${hasEnoughSamples ? 'ready' : ''}`}>
                {sampleCount} samples {hasEnoughSamples ? '✓' : `(need ${10 - sampleCount} more)`}
              </span>
            </div>
            <button
              type="button"
              className="session-btn session-btn--end"
              onClick={endSession}
            >
              End Session
            </button>
          </div>
        )}

        {/* Permission status indicators */}
        {(micPermission === 'denied' || locationPermission === 'denied') && (
          <p className="session-bar__denied">
            {micPermission === 'denied' && '🎙️ Microphone access denied. '}
            {locationPermission === 'denied' && '📍 Location access denied. '}
            Please update your browser permissions and refresh.
          </p>
        )}

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