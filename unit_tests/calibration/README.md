## A1 Calibration Harness

Run the default calibration pass:

```bash
npm run calibrate
```

Run with a config override file:

```bash
npm run calibrate -- .\calibration\tuning_profile.example.json
```

What it checks:

- step-response speed after a sudden noise shift
- outlier damping strength and the outlier's metadata weights
- trust drift over repeated biased reports
- report-decay timing for locations and groups
- location-group freshness weighting as child locations get stale

Useful knobs to tune in the override file:

- `reportHalfLifeMs`
- `varianceSoftCap`
- `peerToleranceDb`
- `historicalToleranceDb`
- `minSessionCorrectionWF`
- `componentWeights`
- `occupancyOverreportRate`
- `occupancyUnderreportRate`
- `noiseOverreportRate`
- `noiseUnderreportRate`
- `trustDeadband`
- `trustExponent`
