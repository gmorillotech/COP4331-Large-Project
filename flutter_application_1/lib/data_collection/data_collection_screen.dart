import 'dart:async';
import 'dart:io';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
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

enum _BackgroundLocationPermissionState {
  checking,
  granted,
  denied,
  unavailable,
}

class DataCollectionScreen extends StatefulWidget {
  const DataCollectionScreen({
    super.key,
    this.signalSampler = demoSignalLevel,
    this.config = const SurfaceConfig(),
    this.initialOccupancy = OccupancyLevel.busy,
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
  final OccupancyLevel initialOccupancy;
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
  late OccupancyLevel _occupancy;
  late SurfaceFrameState _frame;
  late DataCollectionStudyLocation? _selectedLocation;
  late List<DataCollectionStudyLocation> _studyLocations;
  final List<double> _capturedSamples = <double>[];
  Duration _captureElapsed = Duration.zero;

  bool _isCapturing = false;
  bool _isBackgroundCollectionActive = false;
  bool _isSyncingQueue = false;
  bool _isCreatingLocation = false;
  bool _isCreatingGroup = false;
  int _lastRecordedSampleMs = -1;
  int? _windowStartedMs;
  Timer? _captureTimer;
  Timer? _queueRetryTimer;
  CapturedReportDraft? _lastProcessedDraft;
  String? _lastSubmissionSummary;
  bool _lastSubmissionQueued = false;
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
  bool _locationPermanentlyDenied = false;
  _BackgroundLocationPermissionState _backgroundLocationPermissionState =
      _BackgroundLocationPermissionState.checking;
  bool _backgroundLocationPermanentlyDenied = false;
  SessionCoordinates? _lastKnownCoordinates;
  String? _availableLocationGroupId;
  String? _sessionLockedLocationGroupId;
  String? _locationStatusMessage;

  int get _minimumSamplesRequired =>
      widget.draftBuilder.summaryService.config.minimumSampleCount;

  Duration get _capturedDuration => Duration(
    milliseconds: _capturedSamples.length * _sampleInterval.inMilliseconds,
  );

  bool get _isDataCollectionEnabled =>
      _microphonePermissionState == _MicrophonePermissionState.granted;

  bool get _hasLockedSession => _sessionLockedLocationGroupId != null;

  bool get _isAndroidBackgroundModeEnabled =>
      _backgroundCollectionController.isSupported;

  bool get _isBackgroundLocationGranted =>
      _backgroundLocationPermissionState ==
      _BackgroundLocationPermissionState.granted;

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

  List<DataCollectionStudyLocation> get _availableLocations {
    final groupId = _sessionLockedLocationGroupId ?? _availableLocationGroupId;
    if (groupId == null || groupId.isEmpty) {
      return const <DataCollectionStudyLocation>[];
    }

    final filteredLocations = _studyLocations
        .where((location) => location.locationGroupId == groupId)
        .toList(growable: false);
    if (filteredLocations.isEmpty && !_hasLockedSession) {
      return _studyLocations;
    }

    return filteredLocations;
  }

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

  String get _captureAvailabilityLabel {
    switch (_microphonePermissionState) {
      case _MicrophonePermissionState.requesting:
        return 'Awaiting microphone access';
      case _MicrophonePermissionState.granted:
        return _isCapturing ? 'Collecting live samples' : 'Ready to capture';
      case _MicrophonePermissionState.denied:
        return 'Microphone access required';
      case _MicrophonePermissionState.unavailable:
        return 'Microphone unavailable';
    }
  }

  Color get _captureAvailabilityColor {
    switch (_microphonePermissionState) {
      case _MicrophonePermissionState.requesting:
        return const Color(0xFF38BDF8);
      case _MicrophonePermissionState.granted:
        return _isCapturing ? const Color(0xFF34D399) : const Color(0xFFF59E0B);
      case _MicrophonePermissionState.denied:
      case _MicrophonePermissionState.unavailable:
        return const Color(0xFFFB7185);
    }
  }

  Future<void> _syncBackgroundCollectionState() async {
    if (!_backgroundCollectionController.isSupported || !mounted) {
      return;
    }

    try {
      final isActive = await _backgroundCollectionController.isSessionActive();
      if (!mounted) {
        return;
      }

      setState(() {
        _isBackgroundCollectionActive = isActive;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _isBackgroundCollectionActive = false;
      });
    }
  }

  Future<void> _refreshBackgroundLocationPermissionStatus() async {
    if (!_backgroundCollectionController.isSupported || !mounted) {
      return;
    }

    try {
      final status = await widget.backgroundLocationPermissionStatusProvider();
      if (!mounted) {
        return;
      }

      setState(() {
        _backgroundLocationPermissionState =
            _mapBackgroundLocationPermissionState(status);
        _backgroundLocationPermanentlyDenied =
            status.isPermanentlyDenied || status.isRestricted;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _backgroundLocationPermissionState =
            _BackgroundLocationPermissionState.unavailable;
        _backgroundLocationPermanentlyDenied = false;
      });
    }
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

      setState(() {
        _backgroundLocationPermissionState =
            _mapBackgroundLocationPermissionState(status);
        _backgroundLocationPermanentlyDenied =
            status.isPermanentlyDenied || status.isRestricted;
      });

      return status.isGranted;
    } catch (_) {
      if (!mounted) {
        return false;
      }

      setState(() {
        _backgroundLocationPermissionState =
            _BackgroundLocationPermissionState.unavailable;
        _backgroundLocationPermanentlyDenied = false;
      });
      return false;
    }
  }

  _BackgroundLocationPermissionState _mapBackgroundLocationPermissionState(
    PermissionStatus status,
  ) {
    if (status.isGranted) {
      return _BackgroundLocationPermissionState.granted;
    }

    if (status.isDenied ||
        status.isPermanentlyDenied ||
        status.isRestricted ||
        status.isLimited) {
      return _BackgroundLocationPermissionState.denied;
    }

    return _BackgroundLocationPermissionState.unavailable;
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

      setState(() {
        _isBackgroundCollectionActive = true;
      });
      return true;
    } on StateError catch (error) {
      if (!mounted) {
        return false;
      }

      setState(() {
        _isBackgroundCollectionActive = false;
      });
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

    if (!mounted) {
      return;
    }

    setState(() {
      _isBackgroundCollectionActive = false;
    });
  }

  Future<void> _initLocationAccess() async {
    await _coordinatesSubscription?.cancel();
    _coordinatesSubscription = null;

    if (mounted) {
      setState(() {
        _locationPermissionState = _LocationPermissionState.requesting;
        _locationPermanentlyDenied = false;
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

        unawaited(_refreshBackgroundLocationPermissionStatus());
        await _refreshCurrentCoordinates();
        return;
      }

      setState(() {
        _locationPermissionState = _LocationPermissionState.denied;
        _locationPermanentlyDenied =
            status.isPermanentlyDenied || status.isRestricted;
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
      _isBackgroundCollectionActive = false;
      _capturedSamples.clear();
      _lastRecordedSampleMs = -1;
      _windowStartedMs = null;
      _lastProcessedDraft = null;
      _lastSubmissionSummary = null;
      _lastSubmissionQueued = false;
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
    unawaited(_refreshBackgroundLocationPermissionStatus());
    unawaited(_syncBackgroundCollectionState());
    unawaited(_hydrateStudyLocations());
    if (_draftRepository.drafts.isNotEmpty) {
      _lastSubmissionQueued = true;
      _lastSubmissionSummary =
          'Resuming with ${_draftRepository.drafts.length} queued report(s).';
    }
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
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_syncBackgroundCollectionState());
      unawaited(_refreshBackgroundLocationPermissionStatus());
    }
  }

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
              _isBackgroundCollectionActive = false;
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
        _isBackgroundCollectionActive = false;
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
        _isBackgroundCollectionActive = false;
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
    _lastRecordedSampleMs = initialFrame.signal.elapsed.inMilliseconds;
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
          _lastRecordedSampleMs = frame.signal.elapsed.inMilliseconds;
        });
      } else {
        _capturedSamples.add(frame.signal.decibels);
        _lastRecordedSampleMs = frame.signal.elapsed.inMilliseconds;
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
      _lastProcessedDraft = null;
      _lastSubmissionSummary = _draftRepository.drafts.isEmpty
          ? null
          : 'Pending queued uploads will retry in the background.';
      _lastSubmissionQueued = _draftRepository.drafts.isNotEmpty;
    });
    _startCaptureLoop();

    unawaited(_flushQueuedDrafts());
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
    _lastRecordedSampleMs = -1;
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
      occupancy: _occupancy,
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
        _lastRecordedSampleMs = elapsedMs;
        _windowStartedMs = elapsedMs;
      });

      final queuedDraft = await _draftRepository.saveDraft(draft);
      if (!mounted) {
        return;
      }

      setState(() {
        _lastProcessedDraft = queuedDraft;
        _lastSubmissionSummary = 'Queued a 15-second report window for upload.';
        _lastSubmissionQueued = true;
      });
      unawaited(_flushQueuedDrafts());
    } on StateError catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _capturedSamples.clear();
        _lastRecordedSampleMs = elapsedMs;
        _windowStartedMs = elapsedMs;
        _lastSubmissionSummary = error.message;
        _lastSubmissionQueued = false;
      });
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
        _lastProcessedDraft = null;
        _lastSubmissionSummary = null;
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
        _lastProcessedDraft = null;
        _lastSubmissionSummary = null;
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

        if (mounted) {
          setState(() {
            _lastProcessedDraft = draft.copyWith(
              deliveryStatus: ReportDeliveryStatus.submittedToApi,
              deliveryDetail: 'Synced from the local retry queue.',
            );
            _lastSubmissionSummary = 'Uploaded queued report to backend';
            _lastSubmissionQueued = false;
          });
        }
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
      backgroundColor: const Color(0xFF04121F),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
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
            child: RepaintBoundary(
              child: CustomPaint(
                painter: ProceduralSurfacePainter(
                  frame: _frame,
                  config: widget.config,
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.white.withValues(alpha: 0.04),
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.18),
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: _GlassCard(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: _captureAvailabilityColor,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _captureAvailabilityLabel,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.92),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  _DecibelReadoutCard(decibels: signal.decibels),
                  const SizedBox(height: 12),
                  _NoiseBarCard(descriptor: signal.descriptor),
                  const SizedBox(height: 12),
                  Expanded(
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
                                  return Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Expanded(child: _leftColumn(signal)),
                                      const SizedBox(width: 16),
                                      SizedBox(
                                        width: 340,
                                        child: _rightColumn(compact: false),
                                      ),
                                    ],
                                  );
                                }

                                return SingleChildScrollView(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      _leftColumn(signal, compact: true),
                                      const SizedBox(height: 16),
                                      _rightColumn(compact: true),
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
                                constraints: const BoxConstraints(
                                  maxWidth: 420,
                                ),
                                child: _MicrophonePermissionGateCard(
                                  permissionState: _microphonePermissionState,
                                  permanentlyDenied:
                                      _microphonePermanentlyDenied,
                                  onRetry: _initMicrophone,
                                ),
                              ),
                            ),
                          ),
                      ],
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

  Widget _leftColumn(AudioSignalSnapshot signal, {bool compact = false}) {
    final micOrb = SizedBox(
      height: compact ? 220 : null,
      child: Center(
        child: _StableMicOrb(
          intensity: signal.smoothedLevel,
          ripples: _frame.ripples.length,
          compact: compact,
        ),
      ),
    );

    if (compact) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          micOrb,
          const SizedBox(height: 14),
          _CaptureStatusCard(
            sampleCount: _capturedSamples.length,
            queueCount: _draftRepository.drafts.length,
            captureStateLabel: _isCapturing ? 'Capturing' : 'Stopped',
            lastReadingDb: signal.decibels,
            minSamples: _minimumSamplesRequired,
            capturedDuration: _capturedDuration,
          ),
          const SizedBox(height: 12),
          _SignalHistoryCard(
            samples: _capturedSamples,
            minSamples: _minimumSamplesRequired,
          ),
        ],
      );
    }

    return Column(
      children: [
        Expanded(child: micOrb),
        const SizedBox(height: 14),
        _CaptureStatusCard(
          sampleCount: _capturedSamples.length,
          queueCount: _draftRepository.drafts.length,
          captureStateLabel: _isCapturing ? 'Capturing' : 'Stopped',
          lastReadingDb: signal.decibels,
          minSamples: _minimumSamplesRequired,
          capturedDuration: _capturedDuration,
        ),
        const SizedBox(height: 12),
        _SignalHistoryCard(
          samples: _capturedSamples,
          minSamples: _minimumSamplesRequired,
        ),
      ],
    );
  }

  Widget _rightColumn({required bool compact}) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _LocationCard(
          locations: _availableLocations,
          selectedLocation: _selectedLocation,
          currentCoordinates: _lastKnownCoordinates,
          isLocked: _hasLockedSession,
          isCreatingLocation: _isCreatingLocation,
          isCreatingGroup: _isCreatingGroup,
          canAddLocation:
              !_hasLockedSession &&
              !_isCapturing &&
              _locationPermissionState == _LocationPermissionState.granted &&
              _currentLocationGroup != null,
          canCreateGroup:
              !_hasLockedSession &&
              !_isCapturing &&
              !_isCreatingLocation &&
              _locationPermissionState == _LocationPermissionState.granted &&
              _currentLocationGroup == null &&
              _lastKnownCoordinates != null,
          locationPermissionState: _locationPermissionState,
          locationPermanentlyDenied: _locationPermanentlyDenied,
          statusMessage: _locationStatusMessage,
          locationGroup: _currentLocationGroup,
          onRetryLocationAccess: _initLocationAccess,
          onAddLocation: () {
            unawaited(_promptToAddStudyLocation());
          },
          onCreateGroup: () {
            unawaited(_promptToCreateGroupAndLocation());
          },
          onChanged: (location) {
            setState(() {
              _selectedLocation = location;
              _lastProcessedDraft = null;
              _lastSubmissionSummary = null;
            });
          },
        ),
        const SizedBox(height: 12),
        _OccupancyCard(
          occupancy: _occupancy,
          compact: compact,
          onChanged: (value) {
            setState(() => _occupancy = value);
          },
        ),
        const SizedBox(height: 12),
        _CaptureControlsCard(
          enabled: _isDataCollectionEnabled,
          isCapturing: _isCapturing,
          onStart: () {
            unawaited(_startCapture());
          },
          onStop: _stopCapture,
        ),
        if (_isAndroidBackgroundModeEnabled) ...[
          const SizedBox(height: 12),
          _AndroidBackgroundModeCard(
            permissionState: _backgroundLocationPermissionState,
            isCapturing: _isCapturing,
            backgroundCollectionActive: _isBackgroundCollectionActive,
            permanentlyDenied: _backgroundLocationPermanentlyDenied,
            onRetryPermission: _refreshBackgroundLocationPermissionStatus,
          ),
        ],
        const SizedBox(height: 12),
        const _PrivacyStatementsCard(),
        if (_lastProcessedDraft != null) ...[
          const SizedBox(height: 12),
          _DraftReviewCard(
            draft: _lastProcessedDraft!,
            submissionSummary: _lastSubmissionSummary ?? 'Prepared on device',
            wasQueued: _lastSubmissionQueued,
          ),
        ],
      ],
    );
  }
}

class _DecibelReadoutCard extends StatelessWidget {
  const _DecibelReadoutCard({required this.decibels});

  final double decibels;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'DECIBEL READOUT',
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
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
            ),
            child: Text(
              'Live microphone input',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.84),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NoiseBarCard extends StatelessWidget {
  const _NoiseBarCard({required this.descriptor});

  final NoiseDescriptor descriptor;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'QUALITATIVE NOISE',
            style: TextStyle(
              color: const Color(0xFFBDEBFF),
              fontSize: 12,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            descriptor.label,
            key: const Key('noise-label'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 26,
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
          const SizedBox(height: 8),
          Row(
            children: [
              Text(
                'Quiet',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.72),
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              Text(
                'Loud',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.72),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CaptureStatusCard extends StatelessWidget {
  const _CaptureStatusCard({
    required this.sampleCount,
    required this.queueCount,
    required this.captureStateLabel,
    required this.lastReadingDb,
    required this.minSamples,
    required this.capturedDuration,
  });

  final int sampleCount;
  final int queueCount;
  final String captureStateLabel;
  final double lastReadingDb;
  final int minSamples;
  final Duration capturedDuration;

  @override
  Widget build(BuildContext context) {
    final progress = sampleCount == 0
        ? 0.0
        : (sampleCount / minSamples).clamp(0.0, 1.0);

    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'CAPTURE STATUS',
            style: TextStyle(
              color: const Color(0xFFBDEBFF),
              fontSize: 12,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _MetricChip(
                label: 'Samples',
                value: '$sampleCount / $minSamples',
              ),
              _MetricChip(label: 'State', value: captureStateLabel),
              _MetricChip(
                label: 'Elapsed',
                value: _formatDuration(capturedDuration),
              ),
              _MetricChip(
                label: 'Last dB',
                value: lastReadingDb.toStringAsFixed(1),
              ),
              _MetricChip(label: 'Offline queue', value: '$queueCount'),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            sampleCount >= minSamples
                ? 'Current 15-second window is ready for automatic upload.'
                : 'Collect ${minSamples - sampleCount} more samples to complete the current upload window.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.76),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            key: const Key('capture-progress-bar'),
            height: 12,
            child: CustomPaint(
              painter: _ProgressBarPainter(progress: progress),
              child: const SizedBox.expand(),
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.68),
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _LocationCard extends StatelessWidget {
  const _LocationCard({
    required this.locations,
    required this.selectedLocation,
    required this.currentCoordinates,
    required this.isLocked,
    required this.isCreatingLocation,
    required this.isCreatingGroup,
    required this.canAddLocation,
    required this.canCreateGroup,
    required this.locationPermissionState,
    required this.locationPermanentlyDenied,
    required this.statusMessage,
    required this.locationGroup,
    required this.onRetryLocationAccess,
    required this.onAddLocation,
    required this.onCreateGroup,
    required this.onChanged,
  });

  final List<DataCollectionStudyLocation> locations;
  final DataCollectionStudyLocation? selectedLocation;
  final SessionCoordinates? currentCoordinates;
  final bool isLocked;
  final bool isCreatingLocation;
  final bool isCreatingGroup;
  final bool canAddLocation;
  final bool canCreateGroup;
  final _LocationPermissionState locationPermissionState;
  final bool locationPermanentlyDenied;
  final String? statusMessage;
  final DataCollectionLocationGroup? locationGroup;
  final Future<void> Function() onRetryLocationAccess;
  final VoidCallback onAddLocation;
  final VoidCallback onCreateGroup;
  final ValueChanged<DataCollectionStudyLocation?> onChanged;

  @override
  Widget build(BuildContext context) {
    final canChangeLocation =
        !isLocked &&
        locationPermissionState == _LocationPermissionState.granted &&
        locations.isNotEmpty;
    final effectiveSelectedLocation =
        locations.any(
          (location) =>
              location.studyLocationId == selectedLocation?.studyLocationId,
        )
        ? selectedLocation
        : null;

    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'STUDY LOCATION',
            style: TextStyle(
              color: const Color(0xFFBDEBFF),
              fontSize: 12,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<DataCollectionStudyLocation>(
            key: const Key('location-dropdown'),
            isExpanded: true,
            initialValue: effectiveSelectedLocation,
            dropdownColor: const Color(0xFF102235),
            hint: Text(
              locations.isEmpty
                  ? 'Waiting for a nearby location group'
                  : 'Choose a study location',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.72)),
            ),
            decoration: InputDecoration(
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.08),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
                borderSide: BorderSide.none,
              ),
            ),
            items: locations
                .map(
                  (location) => DropdownMenuItem<DataCollectionStudyLocation>(
                    value: location,
                    child: Text(
                      location.displayLabel,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                )
                .toList(growable: false),
            onChanged: canChangeLocation ? onChanged : null,
          ),
          const SizedBox(height: 12),
          Text(
            statusMessage ??
                'Location access is required before the app can lock a recording session to a study location group.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.78),
              fontWeight: FontWeight.w600,
              height: 1.35,
            ),
          ),
          if (locationGroup != null) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _MetricChip(
                  label: isLocked ? 'Locked group' : 'Detected group',
                  value: locationGroup!.buildingName,
                ),
                _MetricChip(
                  label: 'Selectable spots',
                  value: locationGroup!.studyLocations.length.toString(),
                ),
                _MetricChip(
                  label: 'Boundary radius',
                  value: '${locationGroup!.radiusMeters.round()} m',
                ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          FilledButton.tonalIcon(
            key: const Key('add-study-location-button'),
            onPressed: canAddLocation && !isCreatingLocation
                ? onAddLocation
                : null,
            icon: const Icon(Icons.add_location_alt_outlined),
            label: Text(
              isCreatingLocation ? 'Adding...' : 'Add Study Area Here',
            ),
          ),
          if (canCreateGroup || isCreatingGroup) ...[
            const SizedBox(height: 10),
            FilledButton.icon(
              key: const Key('create-location-group-button'),
              onPressed: canCreateGroup && !isCreatingGroup
                  ? onCreateGroup
                  : null,
              icon: const Icon(Icons.add_home_work_outlined),
              label: Text(
                isCreatingGroup
                    ? 'Creating Group...'
                    : 'Create Group + First Study Area',
              ),
            ),
          ],
          if (locationPermissionState != _LocationPermissionState.granted) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                FilledButton.tonalIcon(
                  key: const Key('retry-location-permission-button'),
                  onPressed:
                      locationPermissionState ==
                          _LocationPermissionState.requesting
                      ? null
                      : () {
                          unawaited(onRetryLocationAccess());
                        },
                  icon: const Icon(Icons.my_location_rounded),
                  label: Text(
                    locationPermissionState ==
                            _LocationPermissionState.requesting
                        ? 'Checking...'
                        : 'Retry location',
                  ),
                ),
                if (locationPermanentlyDenied)
                  FilledButton.icon(
                    key: const Key('open-location-settings-button'),
                    onPressed: () {
                      unawaited(openAppSettings());
                    },
                    icon: const Icon(Icons.settings_outlined),
                    label: const Text('Open Settings'),
                  ),
              ],
            ),
          ],
          if (effectiveSelectedLocation != null) ...[
            const SizedBox(height: 12),
            Text(
              effectiveSelectedLocation.detailLabel,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.92),
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'This studyLocationId is sent directly with each backend report submission.',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.7),
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                if (currentCoordinates != null)
                  _MetricChip(
                    label: 'App coordinates',
                    value:
                        '${currentCoordinates!.latitude.toStringAsFixed(4)}, ${currentCoordinates!.longitude.toStringAsFixed(4)}',
                  ),
                _MetricChip(
                  label: 'Study location ID',
                  value: effectiveSelectedLocation.studyLocationId,
                ),
                _MetricChip(
                  label: 'Study area coordinates',
                  value:
                      '${effectiveSelectedLocation.latitude.toStringAsFixed(4)}, ${effectiveSelectedLocation.longitude.toStringAsFixed(4)}',
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _SignalHistoryCard extends StatelessWidget {
  const _SignalHistoryCard({required this.samples, required this.minSamples});

  final List<double> samples;
  final int minSamples;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'CAPTURE HISTORY',
            style: TextStyle(
              color: const Color(0xFFBDEBFF),
              fontSize: 12,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            key: const Key('signal-history-chart'),
            height: 96,
            child: CustomPaint(
              painter: _SignalHistoryPainter(samples: samples),
              child: const SizedBox.expand(),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            samples.isEmpty
                ? 'No samples recorded yet. Start capture to build the current 15-second report window.'
                : 'Showing the most recent ${samples.length.clamp(0, minSamples * 2)} captured decibel samples.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.74),
              fontWeight: FontWeight.w600,
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

class _StableMicOrb extends StatelessWidget {
  const _StableMicOrb({
    required this.intensity,
    required this.ripples,
    required this.compact,
  });

  final double intensity;
  final int ripples;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final haloOpacity = lerpDouble(0.2, 0.38, intensity) ?? 0.24;
    final minSize = compact ? 164.0 : 218.0;
    final maxSize = compact ? 184.0 : 242.0;
    final orbSize = lerpDouble(minSize, maxSize, intensity) ?? minSize;
    final iconSize = compact ? 76.0 : 102.0;

    return Stack(
      alignment: Alignment.center,
      children: [
        Container(
          width: orbSize + 44,
          height: orbSize + 44,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [
                const Color(0xFF69D8FF).withValues(alpha: haloOpacity),
                Colors.transparent,
              ],
            ),
          ),
        ),
        Container(
          key: const Key('stable-mic'),
          width: orbSize,
          height: orbSize,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF8CCBEE), Color(0xFF6D9AC8)],
            ),
            border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.22),
                blurRadius: 28,
                offset: const Offset(0, 14),
              ),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.mic_rounded,
                size: iconSize,
                color: const Color(0xFF04121F),
              ),
              const SizedBox(height: 8),
              Text(
                '$ripples active ripples',
                style: TextStyle(
                  color: const Color(0xFF04121F).withValues(alpha: 0.72),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _OccupancyCard extends StatelessWidget {
  const _OccupancyCard({
    required this.occupancy,
    required this.onChanged,
    required this.compact,
  });

  final OccupancyLevel occupancy;
  final ValueChanged<OccupancyLevel> onChanged;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final sliderValue = occupancy.sliderValue;

    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'OCCUPANCY',
            style: TextStyle(
              color: const Color(0xFFBDEBFF),
              fontSize: 12,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            occupancy.label,
            key: const Key('occupancy-label'),
            style: TextStyle(
              color: Colors.white,
              fontSize: compact ? 24 : 28,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Stored as a 1-5 A1/report value',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.74),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: SizedBox(
                  height: compact ? 176 : 220,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Container(
                        width: compact ? 46 : 54,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(999),
                          gradient: const LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Color(0xFFDC2626),
                              Color(0xFFF59E0B),
                              Color(0xFF34D399),
                            ],
                          ),
                        ),
                      ),
                      Column(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: List.generate(
                          OccupancyLevel.values.length,
                          (index) => Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(
                                alpha: 0.9 - (index * 0.06),
                              ),
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                      ),
                      RotatedBox(
                        quarterTurns: 3,
                        child: SliderTheme(
                          data: SliderTheme.of(context).copyWith(
                            trackHeight: compact ? 48 : 56,
                            activeTrackColor: Colors.transparent,
                            inactiveTrackColor: Colors.transparent,
                            thumbColor: const Color(0xFFFFF7DA),
                            overlayColor: const Color(
                              0xFFFACC15,
                            ).withValues(alpha: 0.16),
                            thumbShape: RoundSliderThumbShape(
                              enabledThumbRadius: compact ? 14 : 16,
                            ),
                            overlayShape: RoundSliderOverlayShape(
                              overlayRadius: compact ? 18 : 22,
                            ),
                          ),
                          child: Slider(
                            key: const Key('occupancy-slider'),
                            min: 0,
                            max: 4,
                            divisions: 4,
                            value: sliderValue,
                            onChanged: (value) {
                              onChanged(OccupancyLevelX.fromSliderValue(value));
                            },
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 18),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: OccupancyLevel.values.reversed
                    .map(
                      (level) => Padding(
                        padding: EdgeInsets.only(bottom: compact ? 11 : 20),
                        child: Text(
                          level.label,
                          style: TextStyle(
                            color: level == occupancy
                                ? Colors.white
                                : Colors.white.withValues(alpha: 0.64),
                            fontWeight: level == occupancy
                                ? FontWeight.w800
                                : FontWeight.w600,
                            fontSize: compact ? 13 : 14,
                          ),
                        ),
                      ),
                    )
                    .toList(growable: false),
              ),
            ],
          ),
          Text(
            'Current selection: ${occupancy.label}',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.86),
              fontSize: compact ? 15 : 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _CaptureControlsCard extends StatelessWidget {
  const _CaptureControlsCard({
    required this.enabled,
    required this.isCapturing,
    required this.onStart,
    required this.onStop,
  });

  final bool enabled;
  final bool isCapturing;
  final VoidCallback onStart;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'CAPTURE CONTROLS',
            style: TextStyle(
              color: const Color(0xFFBDEBFF),
              fontSize: 12,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Collect samples in 15-second windows. Android background mode keeps active capture alive with the screen off, and failed uploads stay queued in memory while this app session remains open.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.74),
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              FilledButton.icon(
                key: const Key('start-capture-button'),
                onPressed: enabled && !isCapturing ? onStart : null,
                icon: const Icon(Icons.play_arrow_rounded),
                label: const Text('Start'),
              ),
              FilledButton.tonalIcon(
                key: const Key('stop-capture-button'),
                onPressed: enabled && isCapturing ? onStop : null,
                icon: const Icon(Icons.stop_rounded),
                label: const Text('Stop'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AndroidBackgroundModeCard extends StatelessWidget {
  const _AndroidBackgroundModeCard({
    required this.permissionState,
    required this.isCapturing,
    required this.backgroundCollectionActive,
    required this.permanentlyDenied,
    required this.onRetryPermission,
  });

  final _BackgroundLocationPermissionState permissionState;
  final bool isCapturing;
  final bool backgroundCollectionActive;
  final bool permanentlyDenied;
  final Future<void> Function() onRetryPermission;

  String get _headline {
    if (isCapturing && backgroundCollectionActive) {
      return 'ANDROID BACKGROUND MODE: ACTIVE';
    }

    switch (permissionState) {
      case _BackgroundLocationPermissionState.checking:
        return 'ANDROID BACKGROUND MODE: CHECKING';
      case _BackgroundLocationPermissionState.granted:
        return 'ANDROID BACKGROUND MODE: READY';
      case _BackgroundLocationPermissionState.denied:
        return 'ANDROID BACKGROUND MODE: NEEDS ACCESS';
      case _BackgroundLocationPermissionState.unavailable:
        return 'ANDROID BACKGROUND MODE: UNAVAILABLE';
    }
  }

  String get _body {
    if (isCapturing && backgroundCollectionActive) {
      return 'Screen-off collection is live. A persistent Android notification stays visible while microphone and location tracking remain active.';
    }

    switch (permissionState) {
      case _BackgroundLocationPermissionState.checking:
        return 'Checking whether Android background location is ready for screen-off collection.';
      case _BackgroundLocationPermissionState.granted:
        return 'Background location is ready. Starting capture will also start an Android foreground service so collection can continue when the screen turns off.';
      case _BackgroundLocationPermissionState.denied:
        return 'Allow Android location access all the time so the app can keep collecting with the screen off and stop automatically if you leave the study area.';
      case _BackgroundLocationPermissionState.unavailable:
        return 'Android background mode could not be verified on this device yet. Retry after confirming location services are enabled.';
    }
  }

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      key: const Key('android-background-mode-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _headline,
            style: TextStyle(
              color: const Color(0xFFBDEBFF),
              fontSize: 12,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            _body,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.78),
              fontWeight: FontWeight.w600,
              height: 1.35,
            ),
          ),
          if (permissionState != _BackgroundLocationPermissionState.granted ||
              permanentlyDenied) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                FilledButton.tonalIcon(
                  key: const Key('retry-background-location-button'),
                  onPressed: () {
                    unawaited(onRetryPermission());
                  },
                  icon: const Icon(Icons.my_location_rounded),
                  label: const Text('Refresh Access'),
                ),
                if (permanentlyDenied)
                  FilledButton.icon(
                    key: const Key('open-background-location-settings-button'),
                    onPressed: () {
                      unawaited(openAppSettings());
                    },
                    icon: const Icon(Icons.settings_outlined),
                    label: const Text('Open Settings'),
                  ),
              ],
            ),
          ],
        ],
      ),
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

class _DraftReviewCard extends StatelessWidget {
  const _DraftReviewCard({
    required this.draft,
    required this.submissionSummary,
    required this.wasQueued,
  });

  final CapturedReportDraft draft;
  final String submissionSummary;
  final bool wasQueued;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        key: const Key('draft-review-card'),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'LAST REPORT SNAPSHOT',
            style: TextStyle(
              color: const Color(0xFFBDEBFF),
              fontSize: 12,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            draft.studyLocationName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _MetricChip(
                label: 'Avg noise',
                value: draft.avgNoise.toStringAsFixed(1),
              ),
              _MetricChip(
                label: 'Max noise',
                value: draft.maxNoise.toStringAsFixed(1),
              ),
              _MetricChip(
                label: 'Variance',
                value: draft.variance.toStringAsFixed(2),
              ),
              _MetricChip(
                label: 'Occupancy',
                value: draft.occupancy.toString(),
              ),
              _MetricChip(
                label: 'Samples',
                value: draft.sampleCount.toString(),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            wasQueued
                ? '$submissionSummary. This report will retry while the app stays open.'
                : '$submissionSummary. Backend accepted this capture.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.78),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
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

class _SignalHistoryPainter extends CustomPainter {
  _SignalHistoryPainter({required this.samples});

  final List<double> samples;

  @override
  void paint(Canvas canvas, Size size) {
    final backgroundPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.04);
    final background = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(18),
    );
    canvas.drawRRect(background, backgroundPaint);

    final gridPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.08)
      ..strokeWidth = 1;
    for (var line = 1; line <= 3; line += 1) {
      final y = size.height * (line / 4);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    if (samples.isEmpty) {
      return;
    }

    final visibleSamples = samples.length > 24
        ? samples.sublist(samples.length - 24)
        : samples;
    final minSample = visibleSamples.reduce((a, b) => a < b ? a : b);
    final maxSample = visibleSamples.reduce((a, b) => a > b ? a : b);
    final range = (maxSample - minSample).abs() < 0.01
        ? 1.0
        : maxSample - minSample;

    final path = Path();
    for (var index = 0; index < visibleSamples.length; index += 1) {
      final x = visibleSamples.length == 1
          ? size.width / 2
          : size.width * (index / (visibleSamples.length - 1));
      final normalizedY = (visibleSamples[index] - minSample) / range;
      final y = size.height - (normalizedY * (size.height - 10)) - 5;

      if (index == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    final linePaint = Paint()
      ..shader = const LinearGradient(
        colors: [Color(0xFF7CE8FF), Color(0xFFFF91DD), Color(0xFFFFD564)],
      ).createShader(Offset.zero & size)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(path, linePaint);
  }

  @override
  bool shouldRepaint(covariant _SignalHistoryPainter oldDelegate) {
    return oldDelegate.samples.length != samples.length ||
        !listEquals(oldDelegate.samples, samples);
  }
}

class _ProgressBarPainter extends CustomPainter {
  const _ProgressBarPainter({required this.progress});

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final background = Paint()..color = const Color(0xFF17324A);
    final fill = Paint()
      ..shader = const LinearGradient(
        colors: [Color(0xFF2563EB), Color(0xFF06B6D4), Color(0xFF34D399)],
      ).createShader(Offset.zero & size);
    final rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(999),
    );
    canvas.drawRRect(rrect, background);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 0, size.width * progress.clamp(0.0, 1.0), size.height),
        const Radius.circular(999),
      ),
      fill,
    );
  }

  @override
  bool shouldRepaint(covariant _ProgressBarPainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}

String _formatDuration(Duration duration) {
  final minutes = duration.inMinutes;
  final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
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

class ProceduralSurfacePainter extends CustomPainter {
  ProceduralSurfacePainter({required this.frame, required this.config});

  final SurfaceFrameState frame;
  final SurfaceConfig config;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final model = buildSurfaceRenderModel(
      size: size,
      frame: frame,
      config: config,
    );

    final backgroundPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          model.quietColor,
          Color.lerp(model.quietColor, model.activeTint, 0.36)!,
          const Color(0xFF103744),
        ],
      ).createShader(rect);
    canvas.drawRect(rect, backgroundPaint);

    final glowPaint = Paint()
      ..shader =
          RadialGradient(
            colors: [
              model.activeTint.withValues(alpha: 0.24),
              const Color(0xFF6DDCFF).withValues(alpha: 0.08),
              Colors.transparent,
            ],
          ).createShader(
            Rect.fromCircle(center: model.glowCenter, radius: model.glowRadius),
          );
    canvas.drawCircle(model.glowCenter, model.glowRadius, glowPaint);

    for (final ripple in model.ripples) {
      final ripplePaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = ripple.strokeWidth
        ..color = ripple.color;
      canvas.drawOval(ripple.bounds, ripplePaint);
    }

    for (final line in model.lines) {
      final path = Path();
      for (var pointIndex = 0; pointIndex < line.points.length; pointIndex++) {
        final point = line.points[pointIndex];
        if (pointIndex == 0) {
          path.moveTo(point.dx, point.dy);
        } else {
          path.lineTo(point.dx, point.dy);
        }
      }

      final linePaint = Paint()
        ..color = line.color
        ..style = PaintingStyle.stroke
        ..strokeWidth = line.strokeWidth
        ..strokeCap = StrokeCap.round;
      canvas.drawPath(path, linePaint);
    }

    final particlePaint = Paint();
    for (final particle in model.particles) {
      particlePaint.color = particle.color;
      canvas.drawCircle(particle.center, particle.radius, particlePaint);
    }
  }

  @override
  bool shouldRepaint(covariant ProceduralSurfacePainter oldDelegate) {
    return oldDelegate.frame != frame || oldDelegate.config != config;
  }
}
