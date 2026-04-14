import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:geolocator/geolocator.dart';
import 'package:noise_meter/noise_meter.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../auth/auth_service.dart';
import '../config/app_tuning.dart';
import 'background_collection_controller.dart';
import 'data_collection_backend.dart';
import 'data_collection_model.dart';
import 'data_collection_render_model.dart';
import 'data_collection_workflow.dart';

typedef MicrophonePermissionRequest = Future<PermissionStatus> Function();
typedef LocationPermissionRequest = Future<PermissionStatus> Function();
typedef BackgroundLocationPermissionRequest =
    Future<PermissionStatus> Function();
typedef BackgroundLocationPermissionStatusProvider =
    Future<PermissionStatus> Function();
typedef CurrentSessionCoordinatesProvider =
    Future<SessionCoordinates?> Function();
typedef SessionCoordinatesStreamFactory = Stream<SessionCoordinates> Function();

Future<PermissionStatus> _requestMicrophonePermission() {
  return Permission.microphone.request();
}

Future<PermissionStatus> _requestLocationPermission() {
  return Permission.locationWhenInUse.request();
}

Future<PermissionStatus> _requestBackgroundLocationPermission() async {
  if (!Platform.isAndroid) {
    return PermissionStatus.granted;
  }

  return Permission.locationAlways.request();
}

Future<PermissionStatus> _loadBackgroundLocationPermissionStatus() async {
  if (!Platform.isAndroid) {
    return PermissionStatus.granted;
  }

  return Permission.locationAlways.status;
}

Future<SessionCoordinates?> _loadCurrentCoordinates() async {
  final servicesEnabled = await Geolocator.isLocationServiceEnabled();
  if (!servicesEnabled) {
    return null;
  }

  final position = await Geolocator.getCurrentPosition(
    locationSettings: const LocationSettings(accuracy: LocationAccuracy.best),
  );

  return SessionCoordinates(
    latitude: position.latitude,
    longitude: position.longitude,
  );
}

Stream<SessionCoordinates> _watchCoordinates() {
  return Geolocator.getPositionStream(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.best,
      distanceFilter: MobileCaptureTuning.locationDistanceFilterMeters,
    ),
  ).map(
    (position) => SessionCoordinates(
      latitude: position.latitude,
      longitude: position.longitude,
    ),
  );
}

enum _MicrophonePermissionState { requesting, granted, denied, unavailable }

enum _LocationPermissionState { requesting, granted, denied, unavailable }

class DataCollectionScreen extends StatefulWidget {
  const DataCollectionScreen({
    super.key,
    this.signalSampler = demoSignalLevel,
    this.config = const SurfaceConfig(),
    this.initialOccupancy,
    this.initialStudyLocationId,
    this.locationResolver = const LocalStudyLocationResolver(),
    this.draftBuilder = const CapturedReportDraftBuilder(),
    this.draftRepository,
    this.backendClient,
    this.apiBaseUrl,
    this.microphonePermissionRequest = _requestMicrophonePermission,
    this.locationPermissionRequest = _requestLocationPermission,
    this.backgroundLocationPermissionRequest =
        _requestBackgroundLocationPermission,
    this.backgroundLocationPermissionStatusProvider =
        _loadBackgroundLocationPermissionStatus,
    this.currentCoordinatesProvider = _loadCurrentCoordinates,
    this.coordinatesStreamFactory = _watchCoordinates,
    this.backgroundCollectionController =
        const MethodChannelBackgroundCollectionController(),
    this.allowSyntheticAudioInput = false,
  });

  final SignalSampler signalSampler;
  final SurfaceConfig config;
  final OccupancyLevel? initialOccupancy;
  final String? initialStudyLocationId;
  final LocalStudyLocationResolver locationResolver;
  final CapturedReportDraftBuilder draftBuilder;
  final ReportDraftRepository? draftRepository;
  final DataCollectionBackendClient? backendClient;
  final String? apiBaseUrl;
  final MicrophonePermissionRequest microphonePermissionRequest;
  final LocationPermissionRequest locationPermissionRequest;
  final BackgroundLocationPermissionRequest backgroundLocationPermissionRequest;
  final BackgroundLocationPermissionStatusProvider
  backgroundLocationPermissionStatusProvider;
  final CurrentSessionCoordinatesProvider currentCoordinatesProvider;
  final SessionCoordinatesStreamFactory coordinatesStreamFactory;
  final BackgroundCollectionController backgroundCollectionController;
  final bool allowSyntheticAudioInput;

  @override
  State<DataCollectionScreen> createState() => _DataCollectionScreenState();
}

class _DataCollectionScreenState extends State<DataCollectionScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  static const Duration _sampleInterval = MobileCaptureTuning.sampleInterval;
  static const Duration _reportWindow = MobileCaptureTuning.reportWindow;
  static const Duration _queueRetryDelay = MobileCaptureTuning.queueRetryDelay;

  late final Ticker _ticker;
  late final ProceduralSurfaceEngine _engine;
  late final BackgroundCollectionController _backgroundCollectionController;
  late final ReportDraftRepository _draftRepository;
  late final DataCollectionBackendClient _backendClient;
  OccupancyLevel? _occupancy;
  late SurfaceFrameState _frame;
  late DataCollectionStudyLocation? _selectedLocation;
  late List<DataCollectionStudyLocation> _studyLocations;
  final List<double> _capturedSamples = <double>[];
  Duration _captureElapsed = Duration.zero;

  bool _isCapturing = false;
  bool _isSyncingQueue = false;
  bool _isCreatingLocation = false;
  bool _isCreatingGroup = false;
  int? _windowStartedMs;
  Timer? _captureTimer;
  Timer? _queueRetryTimer;
  ProceduralSurfaceEngine? _captureEngine;

  // Microphone state
  NoiseMeter? _noiseMeter;
  StreamSubscription<NoiseReading>? _noiseSubscription;
  StreamSubscription<SessionCoordinates>? _coordinatesSubscription;
  double _liveAudioLevel = 0.0;
  bool _micActive = false;
  _MicrophonePermissionState _microphonePermissionState =
      _MicrophonePermissionState.requesting;
  bool _microphonePermanentlyDenied = false;
  _LocationPermissionState _locationPermissionState =
      _LocationPermissionState.requesting;
  SessionCoordinates? _lastKnownCoordinates;
  String? _availableLocationGroupId;
  String? _sessionLockedLocationGroupId;
  String? _locationStatusMessage;

  bool get _isDataCollectionEnabled =>
      _microphonePermissionState == _MicrophonePermissionState.granted;

  bool get _hasLockedSession => _sessionLockedLocationGroupId != null;

  bool get _isAndroidBackgroundModeEnabled =>
      _backgroundCollectionController.isSupported;

  LocalStudyLocationResolver get _activeLocationResolver =>
      LocalStudyLocationResolver(
        studyLocations: _studyLocations,
        maxResolutionDistanceMeters:
            widget.locationResolver.maxResolutionDistanceMeters,
        locationGroupPaddingMeters:
            widget.locationResolver.locationGroupPaddingMeters,
        minimumLocationGroupRadiusMeters:
            widget.locationResolver.minimumLocationGroupRadiusMeters,
      );

  DataCollectionLocationGroup? get _currentLocationGroup {
    final groupId = _sessionLockedLocationGroupId ?? _availableLocationGroupId;
    if (groupId == null || groupId.isEmpty) {
      return null;
    }

    return _activeLocationResolver.findGroupById(groupId);
  }

  double _audioInputLevel(Duration elapsed) {
    if (_micActive) {
      return _liveAudioLevel;
    }

    if (widget.allowSyntheticAudioInput && _isDataCollectionEnabled) {
      return widget.signalSampler(elapsed);
    }

    return 0.0;
  }

  Future<bool> _ensureBackgroundLocationAccess() async {
    if (!_backgroundCollectionController.isSupported) {
      return true;
    }

    try {
      final status = await widget.backgroundLocationPermissionRequest();
      if (!mounted) {
        return false;
      }
      return status.isGranted;
    } catch (_) {
      return false;
    }
  }

  String _backgroundCollectionNotificationText() {
    final location = _selectedLocation;
    if (location != null) {
      return 'Collecting microphone and location samples for ${location.displayLabel}. Reopen the app to stop this session.';
    }

    final group = _currentLocationGroup;
    if (group != null) {
      return 'Collecting microphone and location samples for ${group.buildingName}. Reopen the app to stop this session.';
    }

    return 'Collecting microphone and location samples. Reopen the app to stop this session.';
  }

  Future<bool> _startBackgroundCollectionMode() async {
    if (!_backgroundCollectionController.isSupported) {
      return true;
    }

    try {
      await _backgroundCollectionController.startSession(
        notificationTitle: 'Study data collection active',
        notificationText: _backgroundCollectionNotificationText(),
      );
      if (!mounted) {
        return false;
      }

      return true;
    } on StateError catch (error) {
      if (!mounted) {
        return false;
      }

      _showMessage(error.message);
      return false;
    }
  }

  Future<void> _stopBackgroundCollectionMode() async {
    if (!_backgroundCollectionController.isSupported) {
      return;
    }

    try {
      await _backgroundCollectionController.stopSession();
    } catch (_) {
      // Capture shutdown remains best effort during teardown.
    }
  }

  Future<void> _initLocationAccess() async {
    await _coordinatesSubscription?.cancel();
    _coordinatesSubscription = null;

    if (mounted) {
      setState(() {
        _locationPermissionState = _LocationPermissionState.requesting;
        _locationStatusMessage =
            'Checking location permission for session locking.';
      });
    }

    try {
      final status = await widget.locationPermissionRequest();
      if (!mounted) {
        return;
      }

      if (status.isGranted) {
        final subscription = widget.coordinatesStreamFactory().listen(
          _handleCoordinatesChanged,
          onError: (_) {
            if (!mounted) {
              return;
            }

            setState(() {
              _locationPermissionState = _LocationPermissionState.unavailable;
              _locationStatusMessage =
                  'Live location is unavailable, so recording cannot be locked to a location group yet.';
            });
          },
        );

        setState(() {
          _coordinatesSubscription = subscription;
          _locationPermissionState = _LocationPermissionState.granted;
        });

        await _refreshCurrentCoordinates();
        return;
      }

      setState(() {
        _locationPermissionState = _LocationPermissionState.denied;
        _locationStatusMessage =
            'Location access is required to lock a recording session to the correct study location group.';
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _locationPermissionState = _LocationPermissionState.unavailable;
        _locationStatusMessage =
            'Location services are unavailable, so session locking is paused.';
      });
    }
  }

  Future<SessionCoordinates?> _refreshCurrentCoordinates() async {
    try {
      final coords = await widget.currentCoordinatesProvider();
      if (coords == null) {
        if (!mounted) {
          return null;
        }

        setState(() {
          if (!_hasLockedSession) {
            _availableLocationGroupId = null;
            _selectedLocation = null;
          }
          _locationStatusMessage =
              'Move into a supported study location group to begin recording.';
        });
        return null;
      }

      _handleCoordinatesChanged(coords);
      return coords;
    } catch (_) {
      if (!mounted) {
        return null;
      }

      setState(() {
        _locationStatusMessage =
            'Location services are unavailable, so session locking cannot be verified.';
      });
      return null;
    }
  }

  void _handleCoordinatesChanged(SessionCoordinates coords) {
    if (!mounted) {
      return;
    }

    _lastKnownCoordinates = coords;
    final lockedGroupId = _sessionLockedLocationGroupId;
    if (lockedGroupId != null) {
      final lockedGroup = _activeLocationResolver.findGroupById(lockedGroupId);
      if (lockedGroup != null && !lockedGroup.contains(coords)) {
        _cutOffSessionForLeavingGroup(lockedGroup);
      }
      return;
    }

    _applyAvailableGroupForCoordinates(coords);
  }

  void _applyAvailableGroupForCoordinates(
    SessionCoordinates coords, {
    String? preferredLocationId,
  }) {
    setState(() {
      _updateAvailableGroupForCoordinates(
        coords,
        preferredLocationId: preferredLocationId,
      );
    });
  }

  void _updateAvailableGroupForCoordinates(
    SessionCoordinates coords, {
    String? preferredLocationId,
  }) {
    final resolvedGroup = _activeLocationResolver.resolveNearestGroup(
      latitude: coords.latitude,
      longitude: coords.longitude,
    );

    if (resolvedGroup == null) {
      _availableLocationGroupId = null;
      _selectedLocation = null;
      _locationStatusMessage =
          'Move into a supported study location group to begin recording.';
      return;
    }

    _availableLocationGroupId = resolvedGroup.locationGroupId;
    _selectedLocation = _selectLocationForGroup(
      resolvedGroup,
      preferredLocationId: preferredLocationId,
    );
    _locationStatusMessage =
        'Currently inside ${resolvedGroup.buildingName}. Choose one of ${resolvedGroup.studyLocations.length} study areas before recording.';
  }

  DataCollectionStudyLocation _selectLocationForGroup(
    DataCollectionLocationGroup group, {
    String? preferredLocationId,
  }) {
    final currentSelection = _selectedLocation;
    if (currentSelection != null &&
        currentSelection.locationGroupId == group.locationGroupId) {
      return currentSelection;
    }

    if (preferredLocationId != null && preferredLocationId.isNotEmpty) {
      for (final location in group.studyLocations) {
        if (location.studyLocationId == preferredLocationId) {
          return location;
        }
      }
    }

    final coords = _lastKnownCoordinates;
    if (coords != null) {
      return group.resolveNearestLocation(coords);
    }

    return group.studyLocations.first;
  }

  void _lockSessionToGroup(DataCollectionLocationGroup group) {
    _sessionLockedLocationGroupId = group.locationGroupId;
    _availableLocationGroupId = group.locationGroupId;
    _selectedLocation = _selectLocationForGroup(group);
    _locationStatusMessage =
        'Session locked to ${group.buildingName}. Stop recording to choose a different location.';
  }

  void _releaseSessionLock() {
    _sessionLockedLocationGroupId = null;
    final coords = _lastKnownCoordinates;
    if (coords != null) {
      _updateAvailableGroupForCoordinates(
        coords,
        preferredLocationId: _selectedLocation?.studyLocationId,
      );
      return;
    }

    _availableLocationGroupId = null;
    _selectedLocation = null;
    _locationStatusMessage =
        'Location lock cleared. Move into a supported study location group to begin recording.';
  }

  void _cutOffSessionForLeavingGroup(DataCollectionLocationGroup lockedGroup) {
    setState(() {
      _isCapturing = false;
      _capturedSamples.clear();
      _windowStartedMs = null;
      _releaseSessionLock();
    });
    _stopCaptureLoop();
    unawaited(_backgroundCollectionController.stopSession());

    _showMessage(
      'Recording stopped because you left the ${lockedGroup.buildingName} location group boundary.',
    );
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _engine = ProceduralSurfaceEngine(config: widget.config);
    _backgroundCollectionController = widget.backgroundCollectionController;
    _draftRepository =
        widget.draftRepository ?? InMemoryReportDraftRepository.instance;
    _backendClient =
        widget.backendClient ??
        HttpDataCollectionBackendClient(baseUrl: widget.apiBaseUrl);
    _occupancy = widget.initialOccupancy;
    _studyLocations = List<DataCollectionStudyLocation>.from(
      widget.locationResolver.studyLocations,
    );
    _selectedLocation = _findLocationById(
      widget.initialStudyLocationId,
      _studyLocations,
    );
    _frame = _engine.tick(
      rawLevel: _audioInputLevel(Duration.zero),
      elapsed: Duration.zero,
    );
    _ticker = createTicker(_handleTick)..start();
    _initMicrophone();
    unawaited(_initLocationAccess());
    unawaited(_hydrateStudyLocations());
    unawaited(_flushQueuedDrafts());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _noiseSubscription?.cancel();
    _coordinatesSubscription?.cancel();
    _captureTimer?.cancel();
    _queueRetryTimer?.cancel();
    if (_backgroundCollectionController.isSupported) {
      unawaited(_backgroundCollectionController.stopSession());
    }
    _ticker.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {}

  Future<void> _initMicrophone() async {
    await _noiseSubscription?.cancel();
    _noiseSubscription = null;
    _noiseMeter = null;

    if (mounted) {
      setState(() {
        _microphonePermissionState = _MicrophonePermissionState.requesting;
        _microphonePermanentlyDenied = false;
        _micActive = false;
        _liveAudioLevel = 0.0;
      });
    }

    try {
      final status = await widget.microphonePermissionRequest();
      if (!mounted) {
        return;
      }

      if (status.isGranted) {
        _noiseMeter = NoiseMeter();
        final subscription = _noiseMeter!.noise.listen(
          (NoiseReading reading) {
            // Convert dB to a 0-1 level using the config's dB range
            final minDb = widget.config.minDecibels.toDouble();
            final maxDb = widget.config.maxDecibels.toDouble();
            _liveAudioLevel = ((reading.meanDecibel - minDb) / (maxDb - minDb))
                .clamp(0.0, 1.0);
            _micActive = true;
          },
          onError: (Object error) {
            if (!mounted) {
              return;
            }

            setState(() {
              _micActive = false;
              _isCapturing = false;
              _microphonePermissionState =
                  _MicrophonePermissionState.unavailable;
            });
            _stopCaptureLoop();
            unawaited(_stopBackgroundCollectionMode());
          },
        );
        setState(() {
          _noiseSubscription = subscription;
          _microphonePermissionState = _MicrophonePermissionState.granted;
        });
        return;
      }

      setState(() {
        _isCapturing = false;
        _microphonePermissionState = _MicrophonePermissionState.denied;
        _microphonePermanentlyDenied =
            status.isPermanentlyDenied || status.isRestricted;
      });
      _stopCaptureLoop();
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _isCapturing = false;
        _micActive = false;
        _microphonePermissionState = _MicrophonePermissionState.unavailable;
      });
      _stopCaptureLoop();
    }
  }

  void _handleTick(Duration elapsed) {
    if (!mounted) {
      return;
    }

    final rawLevel = _audioInputLevel(elapsed);
    final nextFrame = _engine.tick(rawLevel: rawLevel, elapsed: elapsed);

    setState(() {
      _frame = nextFrame;
    });
  }

  void _startCaptureLoop() {
    _captureTimer?.cancel();
    _captureEngine = ProceduralSurfaceEngine(config: widget.config);
    _captureElapsed = Duration.zero;

    final initialFrame = _captureEngine!.tick(
      rawLevel: _audioInputLevel(Duration.zero),
      elapsed: Duration.zero,
    );

    _capturedSamples
      ..clear()
      ..add(initialFrame.signal.decibels);
    _windowStartedMs = initialFrame.signal.elapsed.inMilliseconds;

    _captureTimer = Timer.periodic(_sampleInterval, (_) {
      final captureEngine = _captureEngine;
      if (!_isCapturing || captureEngine == null) {
        return;
      }

      _captureElapsed += _sampleInterval;
      final elapsed = _captureElapsed;
      final frame = captureEngine.tick(
        rawLevel: _audioInputLevel(elapsed),
        elapsed: elapsed,
      );

      if (mounted) {
        setState(() {
          _capturedSamples.add(frame.signal.decibels);
        });
      } else {
        _capturedSamples.add(frame.signal.decibels);
      }

      unawaited(_queueCompletedWindowIfReady(frame));
    });
  }

  void _stopCaptureLoop() {
    _captureTimer?.cancel();
    _captureTimer = null;
    _captureElapsed = Duration.zero;
    _captureEngine = null;
  }

  Future<void> _startCapture() async {
    var lockedSessionDuringStart = false;

    if (!_isDataCollectionEnabled) {
      _showMessage(
        'Microphone access is required before data collection can begin.',
      );
      return;
    }

    if (_locationPermissionState != _LocationPermissionState.granted) {
      _showMessage(
        'Location access is required before recording can be locked to a study location group.',
      );
      return;
    }

    if (_hasLockedSession) {
      final lockedGroup = _currentLocationGroup;
      final coords = await _refreshCurrentCoordinates();
      if (lockedGroup != null &&
          coords != null &&
          !lockedGroup.contains(coords)) {
        _showMessage(
          'You moved outside the locked location group. Start a new session before recording again.',
        );
        return;
      }
    } else {
      final coords = await _refreshCurrentCoordinates();
      if (coords == null) {
        _showMessage(
          'Move into a supported study location group before recording.',
        );
        return;
      }

      final lockedGroup = _activeLocationResolver.resolveNearestGroup(
        latitude: coords.latitude,
        longitude: coords.longitude,
      );
      if (lockedGroup == null) {
        _showMessage(
          'No study location group was found near your current position.',
        );
        return;
      }

      setState(() {
        _lockSessionToGroup(lockedGroup);
      });
      lockedSessionDuringStart = true;
    }

    if (_backgroundCollectionController.isSupported) {
      final hasBackgroundLocationAccess =
          await _ensureBackgroundLocationAccess();
      if (!hasBackgroundLocationAccess) {
        if (lockedSessionDuringStart && mounted) {
          setState(_releaseSessionLock);
        }
        _showMessage(
          'Allow Android background location so collection can continue with the screen off and stop automatically when you leave the study area.',
        );
        return;
      }

      final backgroundModeStarted = await _startBackgroundCollectionMode();
      if (!backgroundModeStarted) {
        if (lockedSessionDuringStart && mounted) {
          setState(_releaseSessionLock);
        }
        return;
      }
    }

    setState(() {
      _isCapturing = true;
    });
    _startCaptureLoop();

    if (_isAndroidBackgroundModeEnabled) {
      _showMessage(
        'You can use your phone, and StudySpot will run in the background.',
      );
    }

    unawaited(_flushQueuedDrafts());
  }

  Future<void> _handleSessionStartRequested() async {
    if (_occupancy == null) {
      _showMessage('Cannot start session without selecting occupancy level.');
      return;
    }

    if (!_isDataCollectionEnabled) {
      _showMessage(
        'Microphone access is required before data collection can begin.',
      );
      return;
    }

    if (_locationPermissionState != _LocationPermissionState.granted) {
      _showMessage(
        'Location access is required before recording can be locked to a study location group.',
      );
      return;
    }

    final coords = await _refreshCurrentCoordinates();
    if (!mounted) return;
    if (coords == null) {
      await _promptToCreateGroupAndLocation();
      return;
    }

    final nearestGroup = _activeLocationResolver.resolveNearestGroup(
      latitude: coords.latitude,
      longitude: coords.longitude,
    );
    if (nearestGroup == null) {
      await _promptToCreateGroupAndLocation();
      return;
    }

    final candidateLocations = _studyLocations
        .where(
          (location) => location.locationGroupId == nearestGroup.locationGroupId,
        )
        .toList(growable: false);

    if (candidateLocations.isEmpty) {
      await _promptToAddStudyLocation();
      return;
    }

    if (candidateLocations.length == 1) {
      setState(() {
        _selectedLocation = candidateLocations.first;
      });
      await _confirmAndStartSession(candidateLocations.first);
      return;
    }

    final chosen = await _showStudyLocationPicker(candidateLocations);
    if (chosen == null || !mounted) return;
    setState(() {
      _selectedLocation = chosen;
    });
    await _confirmAndStartSession(chosen);
  }

  Future<void> _confirmAndStartSession(
    DataCollectionStudyLocation location,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF0F2333),
          title: const Text(
            'Confirm location',
            style: TextStyle(color: Colors.white),
          ),
          content: Text(
            'Start recording at "${location.displayLabel}"?',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.86)),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              key: const Key('confirm-start-session-button'),
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Start'),
            ),
          ],
        );
      },
    );
    if (confirmed != true || !mounted) return;
    await _startCapture();
  }

  Future<DataCollectionStudyLocation?> _showStudyLocationPicker(
    List<DataCollectionStudyLocation> locations,
  ) {
    return showModalBottomSheet<DataCollectionStudyLocation>(
      context: context,
      backgroundColor: const Color(0xFF0F2333),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Pick a study location',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                Flexible(
                  child: ListView.separated(
                    key: const Key('study-location-picker-list'),
                    shrinkWrap: true,
                    itemCount: locations.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final location = locations[index];
                      return ListTile(
                        tileColor: Colors.white.withValues(alpha: 0.06),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        title: Text(
                          location.displayLabel,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        subtitle: Text(
                          location.detailLabel,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.72),
                          ),
                        ),
                        onTap: () => Navigator.of(sheetContext).pop(location),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 12),
                TextButton.icon(
                  onPressed: () {
                    Navigator.of(sheetContext).pop();
                    unawaited(_promptToAddStudyLocation());
                  },
                  icon: const Icon(Icons.add_location_alt_rounded),
                  label: const Text('Add a new study location'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _stopCapture() {
    setState(() {
      _isCapturing = false;
      _clearCaptureBuffers();
      _releaseSessionLock();
    });
    _stopCaptureLoop();
    unawaited(_stopBackgroundCollectionMode());
  }

  void _clearCaptureBuffers() {
    _capturedSamples.clear();
    _windowStartedMs = null;
  }

  CapturedReportDraft _buildDraft({
    required List<double> rawSamples,
    DateTime? createdAt,
  }) {
    final location = _selectedLocation;
    if (location == null) {
      throw StateError('Select a study location before recording.');
    }

    return widget.draftBuilder.build(
      location: location,
      occupancy: _occupancy!,
      rawSamples: rawSamples,
      createdAt: createdAt,
    );
  }

  Future<void> _queueCompletedWindowIfReady(SurfaceFrameState frame) async {
    final startedAtMs = _windowStartedMs;
    if (!_isCapturing || startedAtMs == null) {
      return;
    }

    final elapsedMs = frame.signal.elapsed.inMilliseconds;
    if (elapsedMs - startedAtMs < _reportWindow.inMilliseconds) {
      return;
    }

    try {
      final draft = _buildDraft(
        rawSamples: List<double>.from(_capturedSamples),
        createdAt: DateTime.now(),
      );

      setState(() {
        _capturedSamples.clear();
        _windowStartedMs = elapsedMs;
      });

      await _draftRepository.saveDraft(draft);
      if (!mounted) {
        return;
      }

      unawaited(_flushQueuedDrafts());
    } on StateError catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _capturedSamples.clear();
        _windowStartedMs = elapsedMs;
      });
      _showMessage(error.message);
    }
  }

  Future<void> _promptToAddStudyLocation() async {
    if (_isCapturing || _isCreatingLocation) {
      return;
    }

    final currentGroup = _currentLocationGroup;
    final coords = _lastKnownCoordinates;
    if (currentGroup == null || coords == null) {
      _showMessage(
        'Move into a supported location group before adding a new study area.',
      );
      return;
    }

    final result = await showDialog<_NewStudyLocationInput>(
      context: context,
      builder: (context) =>
          _NewStudyLocationDialog(buildingName: currentGroup.buildingName),
    );
    if (!mounted || result == null) {
      return;
    }

    setState(() => _isCreatingLocation = true);

    try {
      final createdLocation = await _backendClient.createStudyLocation(
        locationGroupId: currentGroup.locationGroupId,
        name: result.name,
        floorLabel: result.floorLabel,
        sublocationLabel: result.description,
        latitude: coords.latitude,
        longitude: coords.longitude,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _studyLocations =
            <DataCollectionStudyLocation>[
              ..._studyLocations.where(
                (location) =>
                    location.studyLocationId != createdLocation.studyLocationId,
              ),
              createdLocation,
            ]..sort(
              (left, right) => left.displayLabel.compareTo(right.displayLabel),
            );
        _selectedLocation = createdLocation;
      });
      _showMessage(
        'Added ${createdLocation.locationName} to ${currentGroup.buildingName}.',
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      final message = error is HttpException
          ? error.message
          : error.toString().replaceFirst('Exception: ', '');
      _showMessage(message);
    } finally {
      if (mounted) {
        setState(() => _isCreatingLocation = false);
      }
    }
  }

  Future<void> _promptToCreateGroupAndLocation() async {
    if (_isCapturing || _isCreatingGroup || _isCreatingLocation) {
      return;
    }

    final coords = _lastKnownCoordinates;
    if (coords == null) {
      _showMessage(
        'Current coordinates are required before creating a location group.',
      );
      return;
    }

    final result = await showDialog<_NewLocationGroupInput>(
      context: context,
      builder: (context) => _NewLocationGroupDialog(
        initialCenterLatitude: coords.latitude,
        initialCenterLongitude: coords.longitude,
      ),
    );
    if (!mounted || result == null) {
      return;
    }

    setState(() => _isCreatingGroup = true);

    try {
      final createdGroup = await _backendClient.createLocationGroup(
        name: result.groupName,
        centerLatitude: result.centerLatitude,
        centerLongitude: result.centerLongitude,
        creatorLatitude: coords.latitude,
        creatorLongitude: coords.longitude,
      );
      final createdLocation = await _backendClient.createStudyLocation(
        locationGroupId: createdGroup.locationGroupId,
        name: result.studyAreaName,
        floorLabel: result.floorLabel,
        sublocationLabel: result.description,
        latitude: coords.latitude,
        longitude: coords.longitude,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _studyLocations =
            <DataCollectionStudyLocation>[
              ..._studyLocations.where(
                (location) =>
                    location.studyLocationId != createdLocation.studyLocationId,
              ),
              createdLocation,
            ]..sort(
              (left, right) => left.displayLabel.compareTo(right.displayLabel),
            );
        _availableLocationGroupId = createdGroup.locationGroupId;
        _selectedLocation = createdLocation;
        _locationStatusMessage =
            'Currently inside ${createdGroup.buildingName}. Choose one of 1 study areas before recording.';
      });
      _showMessage(
        'Created ${createdGroup.buildingName} and added ${createdLocation.locationName}.',
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      final message = error is HttpException
          ? error.message
          : error.toString().replaceFirst('Exception: ', '');
      _showMessage(message);
    } finally {
      if (mounted) {
        setState(() => _isCreatingGroup = false);
      }
    }
  }

  DataCollectionStudyLocation? _findLocationById(
    String? studyLocationId,
    List<DataCollectionStudyLocation> locations,
  ) {
    if (locations.isEmpty) {
      return null;
    }

    if (studyLocationId == null || studyLocationId.isEmpty) {
      return locations.first;
    }

    for (final location in locations) {
      if (location.studyLocationId == studyLocationId) {
        return location;
      }
    }

    return locations.first;
  }

  Future<void> _hydrateStudyLocations() async {
    try {
      final backendLocations = await _backendClient.fetchStudyLocations();
      if (!mounted || backendLocations.isEmpty) {
        return;
      }

      setState(() {
        _studyLocations = backendLocations;
        if (_hasLockedSession) {
          final lockedGroup = _currentLocationGroup;
          if (lockedGroup != null) {
            _selectedLocation = _selectLocationForGroup(
              lockedGroup,
              preferredLocationId: _selectedLocation?.studyLocationId,
            );
          }
        } else if (_lastKnownCoordinates != null) {
          _updateAvailableGroupForCoordinates(
            _lastKnownCoordinates!,
            preferredLocationId:
                _selectedLocation?.studyLocationId ??
                widget.initialStudyLocationId,
          );
        } else {
          _selectedLocation = _findLocationById(
            _selectedLocation?.studyLocationId ?? widget.initialStudyLocationId,
            _studyLocations,
          );
        }
      });
    } catch (_) {}
  }

  Future<void> _flushQueuedDrafts({bool announceSuccess = false}) async {
    if (_isSyncingQueue || _draftRepository.drafts.isEmpty) {
      return;
    }

    _queueRetryTimer?.cancel();
    _queueRetryTimer = null;
    _isSyncingQueue = true;
    var syncedCount = 0;
    final queuedDrafts = List<CapturedReportDraft>.from(
      _draftRepository.drafts.reversed,
    );

    try {
      for (final draft in queuedDrafts) {
        await _backendClient.submitReport(draft);
        await _draftRepository.removeDraft(draft.reportId);
        syncedCount += 1;

      }
    } catch (_) {
      _queueRetryTimer = Timer(_queueRetryDelay, () {
        if (mounted) {
          unawaited(_flushQueuedDrafts());
        }
      });
    } finally {
      _isSyncingQueue = false;
    }

    if (!mounted || syncedCount == 0) {
      return;
    }

    setState(() {});
    if (announceSuccess) {
      final noun = syncedCount == 1 ? 'report' : 'reports';
      _showMessage('Synced $syncedCount queued $noun to the backend.');
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _logout() async {
    final shouldLogout = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Log out?'),
          content: const Text(
            'This will clear the saved session on this device and return to the login screen.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Log out'),
            ),
          ],
        );
      },
    );

    if (shouldLogout != true || !mounted) {
      return;
    }

    await Provider.of<AuthService>(context, listen: false).logout();
  }

  @override
  Widget build(BuildContext context) {
    final signal = _frame.signal;
    final showPermissionGate = !_isDataCollectionEnabled;

    return Scaffold(
      backgroundColor: const Color(0xFF0C1A49),
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: Colors.white,
        title: const Text('Data Collection'),
        actions: [
          IconButton(
            tooltip: 'Account Center',
            onPressed: () {
              Navigator.of(context).pushNamed('/account-center');
            },
            icon: const Icon(Icons.account_circle_outlined),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilledButton.tonalIcon(
              onPressed: () {
                Navigator.of(context).pushNamed('/map');
              },
              icon: const Icon(Icons.map_rounded),
              label: const Text('Map'),
            ),
          ),
          IconButton(
            tooltip: 'Log out',
            onPressed: _logout,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: Stack(
        key: const Key('data-collection-screen'),
        children: [
          Positioned.fill(
            child: Image.asset(
              'assets/data_collection/spiral.png',
              fit: BoxFit.cover,
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.07),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Stack(
                children: [
                  IgnorePointer(
                    ignoring: showPermissionGate,
                    child: Opacity(
                      opacity: showPermissionGate ? 0.42 : 1.0,
                      child: LayoutBuilder(
                        builder: (context, constraints) {
                          final isWide = constraints.maxWidth >= 920;

                          if (isWide) {
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Expanded(
                                  child: Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Expanded(
                                        child: _noiseColumn(signal),
                                      ),
                                      const SizedBox(width: 16),
                                      Expanded(
                                        flex: 2,
                                        child: _micColumn(
                                          signal,
                                          compact: false,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 12),
                                _belowGridExtras(),
                              ],
                            );
                          }

                          return SingleChildScrollView(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _micColumn(signal, compact: true),
                                const SizedBox(height: 12),
                                _noiseColumn(signal),
                                const SizedBox(height: 12),
                                _belowGridExtras(),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  if (showPermissionGate)
                    Positioned.fill(
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 420),
                          child: _MicrophonePermissionGateCard(
                            permissionState: _microphonePermissionState,
                            permanentlyDenied: _microphonePermanentlyDenied,
                            onRetry: _initMicrophone,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _micColumn(AudioSignalSnapshot signal, {required bool compact}) {
    final markerSize = compact ? 168.0 : 220.0;
    final micCta = Transform.translate(
      offset: Offset(-markerSize * 0.150, markerSize * -0.45),
      child: _SessionMicCta(
        decibels: signal.decibels,
        isCapturing: _isCapturing,
        enabled: _isDataCollectionEnabled,
        compact: compact,
        onTap: () {
          if (_isCapturing) {
            _stopCapture();
          } else {
            unawaited(_handleSessionStartRequested());
          }
        },
      ),
    );

    const micTopPadding = 150.0;

    return Column(
      mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
      mainAxisAlignment: MainAxisAlignment.start,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          _isCapturing ? 'Recording' : 'Start Session',
          style: TextStyle(
            color: Colors.white,
            fontSize: compact ? 24 : 28,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            'Help other students by reporting noise and occupancy at your study spot.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.78),
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        const SizedBox(height: 18),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: _OccupancyCard(
            occupancy: _occupancy,
            onChanged: (value) => setState(() => _occupancy = value),
          ),
        ),
        SizedBox(height: micTopPadding),
        if (compact) micCta else Expanded(child: Center(child: micCta)),
      ],
    );
  }

  Widget _noiseColumn(AudioSignalSnapshot signal) {
    final showMicNeeded =
        _microphonePermissionState != _MicrophonePermissionState.granted;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _NoiseLevelCard(
          decibels: signal.decibels,
          descriptor: signal.descriptor,
        ),
        if (showMicNeeded) ...[
          const SizedBox(height: 8),
          Text(
            'Mic needed',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.72),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ],
    );
  }

  Widget _belowGridExtras() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SessionLocationBanner(
          isCapturing: _isCapturing,
          selectedLocation: _selectedLocation,
          locationGroup: _currentLocationGroup,
          locationPermissionState: _locationPermissionState,
          statusMessage: _locationStatusMessage,
        ),
        const SizedBox(height: 12),
        const _PrivacyStatementsCard(),
      ],
    );
  }
}

class _NoiseLevelCard extends StatelessWidget {
  const _NoiseLevelCard({required this.decibels, required this.descriptor});

  final double decibels;
  final NoiseDescriptor descriptor;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'NOISE LEVEL',
            style: TextStyle(
              color: const Color(0xFFBDEBFF),
              fontSize: 12,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          RichText(
            key: const Key('decibel-readout'),
            text: TextSpan(
              text: decibels.toStringAsFixed(1),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 42,
                fontWeight: FontWeight.w800,
              ),
              children: const [
                TextSpan(
                  text: ' dB',
                  style: TextStyle(
                    color: Color(0xFFB9D2E7),
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            descriptor.label,
            key: const Key('noise-label'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            key: const Key('noise-bar'),
            height: 28,
            child: CustomPaint(
              painter: NoiseBarPainter(descriptor: descriptor),
              child: const SizedBox.expand(),
            ),
          ),
        ],
      ),
    );
  }
}

class _NewStudyLocationInput {
  const _NewStudyLocationInput({
    required this.name,
    required this.floorLabel,
    required this.description,
  });

  final String name;
  final String floorLabel;
  final String description;
}

class _NewLocationGroupInput {
  const _NewLocationGroupInput({
    required this.groupName,
    required this.centerLatitude,
    required this.centerLongitude,
    required this.studyAreaName,
    required this.floorLabel,
    required this.description,
  });

  final String groupName;
  final double centerLatitude;
  final double centerLongitude;
  final String studyAreaName;
  final String floorLabel;
  final String description;
}

class _NewStudyLocationDialog extends StatefulWidget {
  const _NewStudyLocationDialog({required this.buildingName});

  final String buildingName;

  @override
  State<_NewStudyLocationDialog> createState() =>
      _NewStudyLocationDialogState();
}

class _NewStudyLocationDialogState extends State<_NewStudyLocationDialog> {
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _floorController = TextEditingController();
  final TextEditingController _sublocationController = TextEditingController();
  String? _errorText;

  @override
  void dispose() {
    _nameController.dispose();
    _floorController.dispose();
    _sublocationController.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _nameController.text.trim();
    final floorLabel = _floorController.text.trim();
    final description = _sublocationController.text.trim();

    if (name.isEmpty) {
      setState(() {
        _errorText = 'Study area name is required.';
      });
      return;
    }

    Navigator.of(context).pop(
      _NewStudyLocationInput(
        name: name,
        floorLabel: floorLabel,
        description: description,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF0D1E2E),
      title: const Text(
        'Add Study Area',
        style: TextStyle(color: Colors.white),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'This new study area will be added inside ${widget.buildingName} using your current location.',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.76),
                height: 1.35,
              ),
            ),
            const SizedBox(height: 16),
            _DialogTextField(
              controller: _nameController,
              label: 'Study area name',
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),
            _DialogTextField(
              controller: _floorController,
              label: 'Floor / level (optional)',
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),
            _DialogTextField(
              controller: _sublocationController,
              label: 'Description (optional)',
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
            ),
            if (_errorText != null) ...[
              const SizedBox(height: 12),
              Text(
                _errorText!,
                style: const TextStyle(
                  color: Color(0xFFFB7185),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _submit, child: const Text('Add')),
      ],
    );
  }
}

class _NewLocationGroupDialog extends StatefulWidget {
  const _NewLocationGroupDialog({
    required this.initialCenterLatitude,
    required this.initialCenterLongitude,
  });

  final double initialCenterLatitude;
  final double initialCenterLongitude;

  @override
  State<_NewLocationGroupDialog> createState() =>
      _NewLocationGroupDialogState();
}

class _NewLocationGroupDialogState extends State<_NewLocationGroupDialog> {
  late final TextEditingController _groupNameController;
  late final TextEditingController _centerLatitudeController;
  late final TextEditingController _centerLongitudeController;
  final TextEditingController _studyAreaNameController =
      TextEditingController();
  final TextEditingController _floorController = TextEditingController();
  final TextEditingController _sublocationController = TextEditingController();
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _groupNameController = TextEditingController();
    _centerLatitudeController = TextEditingController(
      text: widget.initialCenterLatitude.toStringAsFixed(6),
    );
    _centerLongitudeController = TextEditingController(
      text: widget.initialCenterLongitude.toStringAsFixed(6),
    );
  }

  @override
  void dispose() {
    _groupNameController.dispose();
    _centerLatitudeController.dispose();
    _centerLongitudeController.dispose();
    _studyAreaNameController.dispose();
    _floorController.dispose();
    _sublocationController.dispose();
    super.dispose();
  }

  void _submit() {
    final groupName = _groupNameController.text.trim();
    final studyAreaName = _studyAreaNameController.text.trim();
    final floorLabel = _floorController.text.trim();
    final description = _sublocationController.text.trim();
    final centerLatitude = double.tryParse(
      _centerLatitudeController.text.trim(),
    );
    final centerLongitude = double.tryParse(
      _centerLongitudeController.text.trim(),
    );

    if (groupName.isEmpty || studyAreaName.isEmpty) {
      setState(() {
        _errorText = 'Group name and study area name are required.';
      });
      return;
    }

    if (centerLatitude == null || centerLongitude == null) {
      setState(() {
        _errorText = 'Center latitude and longitude must be valid numbers.';
      });
      return;
    }

    Navigator.of(context).pop(
      _NewLocationGroupInput(
        groupName: groupName,
        centerLatitude: centerLatitude,
        centerLongitude: centerLongitude,
        studyAreaName: studyAreaName,
        floorLabel: floorLabel,
        description: description,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF0D1E2E),
      title: const Text(
        'Create Location Group',
        style: TextStyle(color: Colors.white),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'This creates a new 60 meter hexagonal group and the first study area inside it. You can adjust the group center, but your current position must still be inside the new boundary.',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.76),
                height: 1.35,
              ),
            ),
            const SizedBox(height: 16),
            _DialogTextField(
              controller: _groupNameController,
              label: 'Group / building name',
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),
            _DialogTextField(
              controller: _centerLatitudeController,
              label: 'Group center latitude',
              textInputAction: TextInputAction.next,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
            ),
            const SizedBox(height: 12),
            _DialogTextField(
              controller: _centerLongitudeController,
              label: 'Group center longitude',
              textInputAction: TextInputAction.next,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
            ),
            const SizedBox(height: 12),
            _DialogTextField(
              controller: _studyAreaNameController,
              label: 'First study area name',
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),
            _DialogTextField(
              controller: _floorController,
              label: 'Floor / level (optional)',
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),
            _DialogTextField(
              controller: _sublocationController,
              label: 'Description (optional)',
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
            ),
            if (_errorText != null) ...[
              const SizedBox(height: 12),
              Text(
                _errorText!,
                style: const TextStyle(
                  color: Color(0xFFFB7185),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _submit, child: const Text('Create')),
      ],
    );
  }
}

class _DialogTextField extends StatelessWidget {
  const _DialogTextField({
    required this.controller,
    required this.label,
    this.textInputAction,
    this.onSubmitted,
    this.keyboardType,
  });

  final TextEditingController controller;
  final String label;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      onSubmitted: onSubmitted,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.72)),
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.08),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }
}

const List<List<String>> _noiseTierMarkerAssets = <List<String>>[
  <String>[
    'assets/map_markers/animated/1-1.svg',
    'assets/map_markers/animated/1-2.svg',
    'assets/map_markers/animated/1-3.svg',
  ],
  <String>[
    'assets/map_markers/animated/2-1.svg',
    'assets/map_markers/animated/2-2.svg',
    'assets/map_markers/animated/2-3.svg',
  ],
  <String>[
    'assets/map_markers/animated/3-1.svg',
    'assets/map_markers/animated/3-2.svg',
    'assets/map_markers/animated/3-3.svg',
  ],
  <String>[
    'assets/map_markers/animated/4-1.svg',
    'assets/map_markers/animated/4-2.svg',
    'assets/map_markers/animated/4-3.svg',
  ],
  <String>[
    'assets/map_markers/animated/5-1.svg',
    'assets/map_markers/animated/5-2.svg',
    'assets/map_markers/animated/5-3.svg',
  ],
];

int _dbToTierIndex(double db) {
  if (db < 40) return 0;
  if (db < 55) return 1;
  if (db < 65) return 2;
  if (db < 75) return 3;
  return 4;
}

class _SessionMicCta extends StatefulWidget {
  const _SessionMicCta({
    required this.decibels,
    required this.isCapturing,
    required this.enabled,
    required this.onTap,
    required this.compact,
  });

  final double decibels;
  final bool isCapturing;
  final bool enabled;
  final VoidCallback onTap;
  final bool compact;

  @override
  State<_SessionMicCta> createState() => _SessionMicCtaState();
}

class _SessionMicCtaState extends State<_SessionMicCta>
    with SingleTickerProviderStateMixin {
  Timer? _variantTimer;
  int _variant = 0;
  late final AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _variantTimer = Timer.periodic(const Duration(milliseconds: 750), (_) {
      if (!mounted) return;
      setState(() => _variant = (_variant + 1) % 3);
    });
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    if (widget.isCapturing) {
      _pulseController.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(covariant _SessionMicCta oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isCapturing && !_pulseController.isAnimating) {
      _pulseController.repeat(reverse: true);
    } else if (!widget.isCapturing && _pulseController.isAnimating) {
      _pulseController.stop();
      _pulseController.value = 0;
    }
  }

  @override
  void dispose() {
    _variantTimer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tier = _dbToTierIndex(widget.decibels);
    final markerAsset = _noiseTierMarkerAssets[tier][_variant];
    final markerSize = widget.compact ? 168.0 : 220.0;
    final micSize = markerSize * 0.45;

    return Semantics(
      label: widget.isCapturing ? 'End Session' : 'Start Session',
      button: true,
      enabled: widget.enabled,
      child: GestureDetector(
        key: const Key('session-mic-cta'),
        behavior: HitTestBehavior.opaque,
        onTap: widget.enabled ? widget.onTap : null,
        child: Opacity(
          opacity: widget.enabled ? 1.0 : 0.55,
          child: SizedBox(
            width: markerSize + 48,
            height: markerSize + 48,
            child: Stack(
              alignment: Alignment.center,
              children: [
                if (widget.isCapturing)
                  AnimatedBuilder(
                    animation: _pulseController,
                    builder: (context, _) {
                      final t = _pulseController.value;
                      return Container(
                        width: markerSize + 48 * t + 12,
                        height: markerSize + 48 * t + 12,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: const Color(
                            0xFF69D8FF,
                          ).withValues(alpha: 0.32 * (1 - t)),
                        ),
                      );
                    },
                  ),
                SizedBox(
                  width: markerSize,
                  height: markerSize,
                  child: SvgPicture.asset(
                    markerAsset,
                    fit: BoxFit.contain,
                  ),
                ),
                SvgPicture.asset(
                  'assets/data_collection/microphone.svg',
                  width: micSize,
                  height: micSize,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OccupancyCard extends StatelessWidget {
  const _OccupancyCard({required this.occupancy, required this.onChanged});

  final OccupancyLevel? occupancy;
  final ValueChanged<OccupancyLevel> onChanged;

  @override
  Widget build(BuildContext context) {
    final levels = OccupancyLevel.values;
    final hasSelection = occupancy != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          hasSelection ? occupancy!.label : 'Select occupancy',
          key: const Key('occupancy-label'),
          textAlign: TextAlign.center,
          style: TextStyle(
            color: hasSelection
                ? Colors.white
                : Colors.white.withValues(alpha: 0.55),
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 6),
        Stack(
          alignment: Alignment.center,
          children: [
            Container(
              height: 10,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                gradient: const LinearGradient(
                  colors: [
                    Color(0xFF34D399),
                    Color(0xFFF59E0B),
                    Color(0xFFDC2626),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: List.generate(
                  levels.length,
                  (index) => Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(
                        alpha: 0.85 - (index * 0.06),
                      ),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ),
            ),
            SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 14,
                activeTrackColor: Colors.transparent,
                inactiveTrackColor: Colors.transparent,
                thumbColor: const Color(0xFFFFF7DA),
                overlayColor: const Color(0xFFFACC15).withValues(alpha: 0.16),
                thumbShape: RoundSliderThumbShape(
                  enabledThumbRadius: hasSelection ? 14 : 0,
                ),
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 20),
              ),
              child: Slider(
                key: const Key('occupancy-slider'),
                min: 0,
                max: 4,
                divisions: 4,
                value: occupancy?.sliderValue ?? 0,
                onChanged: (value) {
                  onChanged(OccupancyLevelX.fromSliderValue(value));
                },
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _PrivacyStatementsCard extends StatelessWidget {
  const _PrivacyStatementsCard();

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      key: const Key('privacy-statements-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _PrivacyStatementHeader(),
          SizedBox(height: 12),
          _PrivacyStatementRow(
            icon: Icons.mic_none_rounded,
            message:
                'Microphone audio is never saved. The app only keeps derived noise metrics for each 15-second report window.',
          ),
          SizedBox(height: 10),
          _PrivacyStatementRow(
            icon: Icons.stop_circle_outlined,
            message:
                'Use Stop to end collection. If a background session is running, fully closing the app will also stop collection.',
          ),
          SizedBox(height: 10),
          _PrivacyStatementRow(
            icon: Icons.location_searching_rounded,
            message:
                'Collection stops automatically when the device leaves the locked study location group boundary.',
          ),
          SizedBox(height: 10),
          _PrivacyStatementRow(
            icon: Icons.notifications_active_outlined,
            message:
                'Android keeps a persistent notification visible whenever screen-off collection is active.',
          ),
        ],
      ),
    );
  }
}

class _PrivacyStatementHeader extends StatelessWidget {
  const _PrivacyStatementHeader();

  @override
  Widget build(BuildContext context) {
    return Text(
      'PRIVACY + SAFETY',
      style: TextStyle(
        color: const Color(0xFFBDEBFF),
        fontSize: 12,
        letterSpacing: 1.5,
        fontWeight: FontWeight.w800,
      ),
    );
  }
}

class _PrivacyStatementRow extends StatelessWidget {
  const _PrivacyStatementRow({required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Icon(icon, color: const Color(0xFF7CE8FF), size: 18),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            message,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.78),
              fontWeight: FontWeight.w600,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}

class _MicrophonePermissionGateCard extends StatelessWidget {
  const _MicrophonePermissionGateCard({
    required this.permissionState,
    required this.permanentlyDenied,
    required this.onRetry,
  });

  final _MicrophonePermissionState permissionState;
  final bool permanentlyDenied;
  final Future<void> Function() onRetry;

  String get _headline {
    switch (permissionState) {
      case _MicrophonePermissionState.requesting:
        return 'Checking microphone permission';
      case _MicrophonePermissionState.granted:
        return 'Microphone ready';
      case _MicrophonePermissionState.denied:
        return 'Microphone permission required';
      case _MicrophonePermissionState.unavailable:
        return 'Microphone unavailable';
    }
  }

  String get _body {
    switch (permissionState) {
      case _MicrophonePermissionState.requesting:
        return 'This workflow stays locked until microphone access is confirmed.';
      case _MicrophonePermissionState.granted:
        return 'Microphone access is available.';
      case _MicrophonePermissionState.denied:
        return 'Noise reports stay disabled until the app can record live microphone input. Occupancy-only submissions are intentionally blocked.';
      case _MicrophonePermissionState.unavailable:
        return 'The app could not access live microphone input, so report collection is disabled until microphone access works again.';
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: _GlassCard(
        key: const Key('microphone-permission-gate'),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _headline,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              _body,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.82),
                fontWeight: FontWeight.w600,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                FilledButton.tonalIcon(
                  key: const Key('retry-microphone-permission-button'),
                  onPressed:
                      permissionState == _MicrophonePermissionState.requesting
                      ? null
                      : () {
                          unawaited(onRetry());
                        },
                  icon: const Icon(Icons.mic_rounded),
                  label: Text(
                    permissionState == _MicrophonePermissionState.requesting
                        ? 'Checking...'
                        : 'Retry access',
                  ),
                ),
                if (permanentlyDenied)
                  FilledButton.icon(
                    key: const Key('open-app-settings-button'),
                    onPressed: () {
                      unawaited(openAppSettings());
                    },
                    icon: const Icon(Icons.settings_outlined),
                    label: const Text('Open Settings'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SessionLocationBanner extends StatelessWidget {
  const _SessionLocationBanner({
    required this.isCapturing,
    required this.selectedLocation,
    required this.locationGroup,
    required this.locationPermissionState,
    required this.statusMessage,
  });

  final bool isCapturing;
  final DataCollectionStudyLocation? selectedLocation;
  final DataCollectionLocationGroup? locationGroup;
  final _LocationPermissionState locationPermissionState;
  final String? statusMessage;

  @override
  Widget build(BuildContext context) {
    final String label;
    final IconData icon;
    final Color accent;

    if (isCapturing && selectedLocation != null) {
      label = 'Recording at ${selectedLocation!.displayLabel}';
      icon = Icons.fiber_manual_record_rounded;
      accent = const Color(0xFFFB7185);
    } else if (locationPermissionState != _LocationPermissionState.granted) {
      label = statusMessage ?? 'Location access needed to start a session.';
      icon = Icons.location_off_rounded;
      accent = const Color(0xFFFB923C);
    } else if (locationGroup == null) {
      label =
          statusMessage ??
          'Move into a supported study area, or create one when you tap the mic.';
      icon = Icons.explore_off_rounded;
      accent = const Color(0xFFFFD564);
    } else {
      label =
          'Ready in ${locationGroup!.buildingName}. Tap the mic to choose a study location.';
      icon = Icons.place_rounded;
      accent = const Color(0xFF6EE7B7);
    }

    return _GlassCard(
      key: const Key('session-location-banner'),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(icon, color: accent, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GlassCard extends StatelessWidget {
  const _GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        color: Colors.white.withValues(alpha: 0.1),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.16),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

class NoiseBarPainter extends CustomPainter {
  NoiseBarPainter({required this.descriptor});

  final NoiseDescriptor descriptor;

  @override
  void paint(Canvas canvas, Size size) {
    final model = buildNoiseBarRenderModel(size: size, descriptor: descriptor);
    final rect = Offset.zero & size;
    final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(14));
    final background = Paint()..color = const Color(0xFF17324A);
    canvas.drawRRect(rrect, background);

    final gradientRect = Rect.fromLTWH(0, 0, model.fillWidth, size.height);
    final gradientPaint = Paint()
      ..shader = const LinearGradient(
        colors: [
          Color(0xFF2563EB),
          Color(0xFF06B6D4),
          Color(0xFFFACC15),
          Color(0xFFDC2626),
        ],
      ).createShader(gradientRect);
    canvas.drawRRect(
      RRect.fromRectAndRadius(gradientRect, const Radius.circular(14)),
      gradientPaint,
    );

    final markerPaint = Paint()..color = Colors.white.withValues(alpha: 0.92);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(model.markerX, size.height / 2),
          width: 4,
          height: size.height + 10,
        ),
        const Radius.circular(2),
      ),
      markerPaint,
    );
  }

  @override
  bool shouldRepaint(covariant NoiseBarPainter oldDelegate) {
    return oldDelegate.descriptor.label != descriptor.label ||
        oldDelegate.descriptor.progress != descriptor.progress;
  }
}

