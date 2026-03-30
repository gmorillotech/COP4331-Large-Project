import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:noise_meter/noise_meter.dart';
import 'package:permission_handler/permission_handler.dart';

import 'data_collection_model.dart';
import 'data_collection_render_model.dart';
import 'data_collection_workflow.dart';

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
  });

  final SignalSampler signalSampler;
  final SurfaceConfig config;
  final OccupancyLevel initialOccupancy;
  final String? initialStudyLocationId;
  final LocalStudyLocationResolver locationResolver;
  final CapturedReportDraftBuilder draftBuilder;
  final ReportDraftRepository? draftRepository;

  @override
  State<DataCollectionScreen> createState() => _DataCollectionScreenState();
}

class _DataCollectionScreenState extends State<DataCollectionScreen>
    with SingleTickerProviderStateMixin {
  static const Duration _sampleInterval = Duration(milliseconds: 250);

  late final Ticker _ticker;
  late final ProceduralSurfaceEngine _engine;
  late final ReportDraftRepository _draftRepository;
  late OccupancyLevel _occupancy;
  late SurfaceFrameState _frame;
  late DataCollectionStudyLocation? _selectedLocation;
  final List<double> _capturedSamples = <double>[];

  bool _isCapturing = false;
  int _lastRecordedSampleMs = -1;
  CapturedReportDraft? _lastSavedDraft;

  // Microphone state
  NoiseMeter? _noiseMeter;
  StreamSubscription<NoiseReading>? _noiseSubscription;
  double _liveAudioLevel = 0.0;
  bool _micActive = false;

  int get _minimumSamplesRequired =>
      widget.draftBuilder.summaryService.config.minimumSampleCount;

  Duration get _capturedDuration =>
      Duration(milliseconds: _capturedSamples.length * _sampleInterval.inMilliseconds);

  @override
  void initState() {
    super.initState();
    _engine = ProceduralSurfaceEngine(config: widget.config);
    _draftRepository =
        widget.draftRepository ?? InMemoryReportDraftRepository.instance;
    _occupancy = widget.initialOccupancy;
    _selectedLocation = widget.locationResolver.findById(
      widget.initialStudyLocationId,
    );
    _frame = _engine.tick(
      rawLevel: widget.signalSampler(Duration.zero),
      elapsed: Duration.zero,
    );
    _ticker = createTicker(_handleTick)..start();
    _initMicrophone();
  }

  @override
  void dispose() {
    _noiseSubscription?.cancel();
    _ticker.dispose();
    super.dispose();
  }

  Future<void> _initMicrophone() async {
    final status = await Permission.microphone.request();
    if (!mounted) return;

    if (status.isGranted) {
      _noiseMeter = NoiseMeter();
      _noiseSubscription = _noiseMeter!.noise.listen(
        (NoiseReading reading) {
          // Convert dB to a 0-1 level using the config's dB range
          final minDb = widget.config.minDecibels.toDouble();
          final maxDb = widget.config.maxDecibels.toDouble();
          _liveAudioLevel =
              ((reading.meanDecibel - minDb) / (maxDb - minDb)).clamp(0.0, 1.0);
          _micActive = true;
        },
        onError: (Object error) {
          _micActive = false;
        },
      );
    }
  }

  void _handleTick(Duration elapsed) {
    if (!mounted) {
      return;
    }

    final rawLevel =
        _micActive ? _liveAudioLevel : widget.signalSampler(elapsed);
    final nextFrame = _engine.tick(
      rawLevel: rawLevel,
      elapsed: elapsed,
    );

    setState(() {
      _frame = nextFrame;
      if (_isCapturing) {
        _recordSampleIfNeeded(nextFrame);
      }
    });
  }

  void _recordSampleIfNeeded(SurfaceFrameState frame) {
    final elapsedMs = frame.signal.elapsed.inMilliseconds;
    if (_lastRecordedSampleMs >= 0 &&
        elapsedMs - _lastRecordedSampleMs < _sampleInterval.inMilliseconds) {
      return;
    }

    _capturedSamples.add(frame.signal.decibels);
    _lastRecordedSampleMs = elapsedMs;
  }

  void _startCapture() {
    setState(() {
      final shouldStartFresh = _lastRecordedSampleMs < 0;
      _isCapturing = true;
      _lastSavedDraft = null;

      if (shouldStartFresh) {
        _capturedSamples.clear();
        _capturedSamples.add(_frame.signal.decibels);
        _lastRecordedSampleMs = _frame.signal.elapsed.inMilliseconds;
      }
    });
  }

  void _pauseCapture() {
    setState(() {
      _isCapturing = false;
    });
  }

  void _resetCapture() {
    setState(() {
      _isCapturing = false;
      _capturedSamples.clear();
      _lastRecordedSampleMs = -1;
      _lastSavedDraft = null;
    });
  }

  Future<void> _saveDraft() async {
    final location = _selectedLocation;
    if (location == null) {
      _showMessage('Select a study location before saving a draft.');
      return;
    }

    try {
      final draft = widget.draftBuilder.build(
        location: location,
        occupancy: _occupancy,
        rawSamples: _capturedSamples,
      );
      final savedDraft = await _draftRepository.saveDraft(draft);
      if (!mounted) {
        return;
      }

      setState(() {
        _lastSavedDraft = savedDraft;
        _isCapturing = false;
      });
      _showMessage(
        'Draft queued locally. It is ready for the future report API.',
      );
    } on StateError catch (error) {
      _showMessage(error.message ?? 'Unable to save this report draft yet.');
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final signal = _frame.signal;

    return Scaffold(
      backgroundColor: const Color(0xFF04121F),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        title: const Text('Data Collection'),
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
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      _GlassCard(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'A1 INPUT PREP',
                              style: TextStyle(
                                color: const Color(0xFFBDEBFF),
                                fontSize: 12,
                                letterSpacing: 1.5,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'Local draft workflow before API hookup',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.96),
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                      _GlassCard(
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
                                color: _isCapturing
                                    ? const Color(0xFF34D399)
                                    : const Color(0xFFF59E0B),
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _isCapturing
                                  ? 'Collecting live samples'
                                  : 'Ready to capture',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.92),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _DecibelReadoutCard(decibels: signal.decibels),
                  const SizedBox(height: 12),
                  _NoiseBarCard(descriptor: signal.descriptor),
                  const SizedBox(height: 12),
                  Expanded(
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final isWide = constraints.maxWidth >= 920;

                        if (isWide) {
                          return Row(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
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
                            crossAxisAlignment: CrossAxisAlignment.stretch,
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
            captureStateLabel: _isCapturing ? 'Capturing' : 'Paused',
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
          captureStateLabel: _isCapturing ? 'Capturing' : 'Paused',
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
          locations: widget.locationResolver.studyLocations,
          selectedLocation: _selectedLocation,
          onChanged: (location) {
            setState(() {
              _selectedLocation = location;
              _lastSavedDraft = null;
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
          canSaveDraft:
              _capturedSamples.length >= _minimumSamplesRequired &&
              _selectedLocation != null,
          isCapturing: _isCapturing,
          onStart: _startCapture,
          onPause: _pauseCapture,
          onReset: _resetCapture,
          onSaveDraft: _saveDraft,
        ),
        if (_lastSavedDraft != null) ...[
          const SizedBox(height: 12),
          _DraftReviewCard(draft: _lastSavedDraft!),
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
              'A1-ready numeric input',
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
    final progress = sampleCount == 0 ? 0.0 : (sampleCount / minSamples).clamp(0.0, 1.0);

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
              _MetricChip(label: 'Draft queue', value: '$queueCount'),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            sampleCount >= minSamples
                ? 'Enough samples collected to save a local draft.'
                : 'Collect ${minSamples - sampleCount} more samples to unlock draft save.',
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
    required this.onChanged,
  });

  final List<DataCollectionStudyLocation> locations;
  final DataCollectionStudyLocation? selectedLocation;
  final ValueChanged<DataCollectionStudyLocation?> onChanged;

  @override
  Widget build(BuildContext context) {
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
            value: selectedLocation,
            dropdownColor: const Color(0xFF102235),
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
            onChanged: onChanged,
          ),
          if (selectedLocation != null) ...[
            const SizedBox(height: 12),
            Text(
              selectedLocation!.detailLabel,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.92),
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Client-side location binding is ready now. The future API only needs this studyLocationId.',
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
                _MetricChip(
                  label: 'Study location ID',
                  value: selectedLocation!.studyLocationId,
                ),
                _MetricChip(
                  label: 'Coordinates',
                  value:
                      '${selectedLocation!.latitude.toStringAsFixed(4)}, ${selectedLocation!.longitude.toStringAsFixed(4)}',
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
  const _SignalHistoryCard({
    required this.samples,
    required this.minSamples,
  });

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
                ? 'No samples recorded yet. Start capture to build a local noise trace.'
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
    required this.canSaveDraft,
    required this.isCapturing,
    required this.onStart,
    required this.onPause,
    required this.onReset,
    required this.onSaveDraft,
  });

  final bool canSaveDraft;
  final bool isCapturing;
  final VoidCallback onStart;
  final VoidCallback onPause;
  final VoidCallback onReset;
  final VoidCallback onSaveDraft;

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
            'This now covers the pre-backend app-side work: collect samples, bind a location, set occupancy, and save an A1-shaped local draft.',
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
                onPressed: isCapturing ? null : onStart,
                icon: const Icon(Icons.play_arrow_rounded),
                label: const Text('Start'),
              ),
              FilledButton.tonalIcon(
                key: const Key('pause-capture-button'),
                onPressed: isCapturing ? onPause : null,
                icon: const Icon(Icons.pause_rounded),
                label: const Text('Pause'),
              ),
              FilledButton.tonalIcon(
                key: const Key('reset-capture-button'),
                onPressed: onReset,
                icon: const Icon(Icons.restart_alt_rounded),
                label: const Text('Reset'),
              ),
              FilledButton.tonalIcon(
                key: const Key('save-draft-button'),
                onPressed: canSaveDraft ? onSaveDraft : null,
                icon: const Icon(Icons.cloud_upload_outlined),
                label: const Text('Save Draft'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DraftReviewCard extends StatelessWidget {
  const _DraftReviewCard({required this.draft});

  final CapturedReportDraft draft;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        key: const Key('draft-review-card'),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'LOCAL DRAFT REVIEW',
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
            'Queued locally until the report API/database are constructed.',
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

class _SignalHistoryPainter extends CustomPainter {
  _SignalHistoryPainter({
    required this.samples,
  });

  final List<double> samples;

  @override
  void paint(Canvas canvas, Size size) {
    final backgroundPaint = Paint()..color = Colors.white.withValues(alpha: 0.04);
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
    final range = (maxSample - minSample).abs() < 0.01 ? 1.0 : maxSample - minSample;

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
        colors: [
          Color(0xFF7CE8FF),
          Color(0xFFFF91DD),
          Color(0xFFFFD564),
        ],
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
  const _ProgressBarPainter({
    required this.progress,
  });

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final background = Paint()..color = const Color(0xFF17324A);
    final fill = Paint()
      ..shader = const LinearGradient(
        colors: [
          Color(0xFF2563EB),
          Color(0xFF06B6D4),
          Color(0xFF34D399),
        ],
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
            Rect.fromCircle(
              center: model.glowCenter,
              radius: model.glowRadius,
            ),
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
