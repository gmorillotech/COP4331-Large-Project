class MobileCaptureTuning {
  static const int locationDistanceFilterMeters = 15;
  static const Duration sampleInterval = Duration(milliseconds: 250);
  static const Duration reportWindow = Duration(seconds: 15);
  static const Duration queueRetryDelay = Duration(seconds: 5);

  static const double locationResolutionDistanceMeters = 150;
  static const double locationGroupPaddingMeters = 45;
  static const double minimumLocationGroupRadiusMeters = 40;
}

class MobileSummaryTuning {
  static const int minimumSampleCount = 10;
  static const int smoothingWindowSize = 5;
  static const double winsorizeLowerQuantile = 0.05;
  static const double winsorizeUpperQuantile = 0.95;
}

class MobileSurfaceTuning {
  static const double noiseFloor = 0.08;
  static const double smoothingFactor = 0.18;
  static const double peakThreshold = 0.58;
  static const double peakRiseDelta = 0.1;
  static const int peakCooldownMs = 320;
  static const double rippleSpeed = 0.00022;
  static const int rippleDecayMs = 2800;
  static const double rippleWidth = 0.085;
  static const int maxActiveRipples = 6;
  static const double baseAmplitude = 0.02;
  static const double rippleAmplitude = 0.085;
  static const int lineCount = 14;
  static const double minDecibels = 34;
  static const double maxDecibels = 86;
  static const double quietThreshold = 0.26;
  static const double moderateThreshold = 0.5;
  static const double livelyThreshold = 0.74;
}

class MobileMapSearchTuning {
  static const double defaultMaxRadiusMeters = 300;
  static const double maxRadiusMetersCeiling = 500;
  static const Duration searchDebounce = Duration(milliseconds: 180);
  static const Duration filterDebounce = Duration(milliseconds: 250);
}
