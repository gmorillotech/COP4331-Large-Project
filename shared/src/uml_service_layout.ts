export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface User {
  userId: string;
  email?: string;
  firstName?: string;
  favorites?: string[];
  displayName?: string;
  userNoiseWF: number;
  userOccupancyWF: number;
}

export type ReportKind = "live" | "archive_summary";

export interface Report {
  reportId: string;
  reportKind: "live";
  userId: string;
  studyLocationId: string;
  createdAt: Date;
  avgNoise: number;
  maxNoise: number;
  variance: number;
  occupancy: number; // expected scale: 1..5
}

export interface ArchivedReportSummary {
  reportId: string;
  reportKind: "archive_summary";
  studyLocationId: string;
  createdAt: Date;
  avgNoise: number;
  occupancy: number;
  windowStart: Date;
  windowEnd: Date;
}

export interface ReportTagMetadata {
  reportId: string;
  decayFactor: number;
  varianceCorrectionWF: number;
  sessionCorrectionNoiseWF: number;
  noiseWeightFactor: number;
  occupancyWeightFactor: number;
  lastEvaluatedAt: Date;
}

export interface ReportRecord {
  report: Report;
  // Newly submitted reports should receive metadata immediately.
  // This remains optional only to tolerate legacy rows that still need backfill.
  metadata?: ReportTagMetadata;
}

export interface StudyLocation {
  studyLocationId: string;
  locationGroupId: string;
  name: string;
  latitude: number;
  longitude: number;
  currentNoiseLevel: number | null;
  currentOccupancyLevel: number | null;
  updatedAt: Date | null;
}

export interface LocationGroup {
  locationGroupId: string;
  name: string;
  currentNoiseLevel: number | null;
  currentOccupancyLevel: number | null;
  updatedAt: Date | null;
}

export type ArchivedSummary = ArchivedReportSummary;

export interface SessionState {
  userId: string;
  studyLocationId: string;
  startedAt: Date;
  lastSampleTime: Date | null;
  occupancyLevel: number | null;
  noiseWindow: number[];
}

// Canonical report object exchanged between SessionService.buildReport()
// and ReportService.submitNewReport(). It contains only user/session-authored
// report fields and deliberately excludes A1-owned metadata.
export interface ReportSubmission {
  userId: string;
  studyLocationId: string;
  avgNoise: number;
  maxNoise: number;
  variance: number;
  occupancy: number;
  createdAt: Date;
}

// Backwards-compatible alias used by the in-memory test harnesses.
export type BuiltReportData = ReportSubmission;

export interface NoiseSummary {
  sampleCount: number;
  avgNoise: number;
  maxNoise: number;
  variance: number;
  processedSamples: number[];
}

export interface RequestLike<TBody = unknown, TParams = Record<string, string>, TQuery = Record<string, string>> {
  body: TBody;
  params: TParams;
  query: TQuery;
  userId?: string;
}

export interface ResponseLike {
  status(code: number): ResponseLike;
  json(payload: unknown): void;
}

export interface RegisterUserInput {
  login: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

export interface LoginInput {
  login: string;
  password: string;
}

export interface AuthenticationResult {
  user: User;
  token: string;
}

export interface AuthUserRepository {
  createUser(userData: RegisterUserInput): Promise<User>;
  authenticate(loginData: LoginInput): Promise<AuthenticationResult | null>;
  verifyEmail(token: string): Promise<User | null>;
  generateResetToken(email: string): Promise<boolean>;
  resetPassword(token: string, newPassword: string): Promise<boolean>;
}

export interface SessionUserRepository {
  findUserById(userId: string): Promise<User | null>;
}

export interface A1UserRepository {
  findUsersByIds(userIds: string[]): Promise<User[]>;
  updateUser(user: User): Promise<User>;
}

export interface UserRepository
  extends AuthUserRepository, SessionUserRepository, A1UserRepository {}

export interface ReportWriteRepository {
  createReport(reportData: ReportSubmission): Promise<Report>;
}

export interface ReportReadRepository {
  getRecentReports(): Promise<ReportRecord[]>;
  getReportsByLocation(studyLocationId: string): Promise<ReportRecord[]>;
}

export interface A1ReportRepository {
  getReportsByLocation(studyLocationId: string): Promise<ReportRecord[]>;
  getAllReportsWithMetadata(): Promise<ReportRecord[]>;
  upsertReportMetadata(records: ReportTagMetadata[]): Promise<void>;
  createArchivedReports(records: ArchivedReportSummary[]): Promise<void>;
  deleteReports(reportIds: string[]): Promise<void>;
}

export interface ReportRepository
  extends ReportWriteRepository, ReportReadRepository, A1ReportRepository {}

export interface ArchivedSummaryRepository {
  createArchivedReports(summaries: ArchivedSummary[]): Promise<void>;
}

export interface LocationQueryRepository {
  getAllStudyLocations(): Promise<StudyLocation[]>;
  getStudyLocationById(studyLocationId: string): Promise<StudyLocation | null>;
}

export interface A1StudyLocationRepository extends LocationQueryRepository {
  updateStudyLocation(location: StudyLocation): Promise<StudyLocation>;
  bulkUpdateStudyLocations(locations: StudyLocation[]): Promise<void>;
}

export interface StudyLocationRepository
  extends LocationQueryRepository, A1StudyLocationRepository {}

export interface LocationGroupQueryRepository {
  getAllLocationGroups(): Promise<LocationGroup[]>;
  getLocationGroupById(locationGroupId: string): Promise<LocationGroup | null>;
}

export interface A1LocationGroupRepository extends LocationGroupQueryRepository {
  updateLocationGroup(group: LocationGroup): Promise<LocationGroup>;
  bulkUpdateLocationGroups(groups: LocationGroup[]): Promise<void>;
}

export interface LocationGroupRepository
  extends LocationGroupQueryRepository, A1LocationGroupRepository {}

export interface SessionServiceConfig {
  minimumSampleCount: number;
  smoothingWindowSize: number;
  winsorizeLowerQuantile: number;
  winsorizeUpperQuantile: number;
}

export interface A1Config {
  initialDecayWF: number;
  reportHalfLifeMs: number;
  minWeightThreshold: number;
  archiveThresholdMs: number;
  archiveBucketMinutes: number;
  groupFreshnessWindowMs: number;
  varianceSoftCap: number;
  minReportsForTrustUpdate: number;
  noiseTrustRangeDb: number;
  minUserNoiseWF: number;
  maxUserNoiseWF: number;
  minUserOccupancyWF: number;
  maxUserOccupancyWF: number;
  occupancyOverreportRate: number;
  occupancyUnderreportRate: number;
  noiseOverreportRate: number;
  noiseUnderreportRate: number;
  trustExponent: number;
  trustDeadband: number;
  peerWindowMs: number;
  historicalLookbackDays: number;
  historicalBucketToleranceMinutes: number;
  minPeerCountForPeerScore: number;
  peerToleranceDb: number;
  historicalToleranceDb: number;
  minSessionCorrectionWF: number;
  userNoiseWFNeutral: number;
  userNoiseWFSoftRange: number;
  componentWeights: {
    historical: number;
    user: number;
    peer: number;
  };
  historicalHalfLifeDays: number;
  historicalMaxAgeDays: number;
  minimumHistoricalWeight: number;
  occupancyTrustNormalizationDivisor: number;
  neutralUserWeight: number;
}

export interface HistoricalBaseline {
  usualNoise: number;
  usualOccupancy: number;
}

export interface A1PollingCycleResult {
  evaluatedAt: Date;
  activeReportCount: number;
  compressedReportIds: string[];
  staleReportIds: string[];
  updatedStudyLocations: StudyLocation[];
  updatedLocationGroups: LocationGroup[];
  updatedUsers: User[];
  archivedSummaries: ArchivedReportSummary[];
}

export interface SessionCorrectionNoiseWFDiagnostics {
  sessionCorrectionNoiseWF: number;
  historicalScore: number;
  userScore: number;
  peerScore: number;
  historicalBaselineNoise: number | null;
  peerBaselineNoise: number | null;
  historicalPeerCount: number;
  currentPeerCount: number;
}

export const defaultSessionServiceConfig: SessionServiceConfig = {
  minimumSampleCount: 10,
  smoothingWindowSize: 5,
  winsorizeLowerQuantile: 0.05,
  winsorizeUpperQuantile: 0.95,
};

export const defaultA1Config: A1Config = {
  initialDecayWF: 1.0,
  reportHalfLifeMs: 5 * 60 * 1000,
  minWeightThreshold: 0.05,
  archiveThresholdMs: 3 * 60 * 60 * 1000,
  archiveBucketMinutes: 30,
  groupFreshnessWindowMs: 3 * 60 * 1000,
  varianceSoftCap: 25,
  minReportsForTrustUpdate: 3,
  noiseTrustRangeDb: 12,
  minUserNoiseWF: 0.5,
  maxUserNoiseWF: 1.5,
  minUserOccupancyWF: 0.5,
  maxUserOccupancyWF: 1.5,
  occupancyOverreportRate: 0.12,
  occupancyUnderreportRate: 0.05,
  noiseOverreportRate: 0.06,
  noiseUnderreportRate: 0.12,
  trustExponent: 1.5,
  trustDeadband: 0.08,
  peerWindowMs: 10 * 60 * 1000,
  historicalLookbackDays: 28,
  historicalBucketToleranceMinutes: 45,
  minPeerCountForPeerScore: 2,
  peerToleranceDb: 10,
  historicalToleranceDb: 14,
  minSessionCorrectionWF: 0.35,
  userNoiseWFNeutral: 1.0,
  userNoiseWFSoftRange: 0.6,
  componentWeights: {
    historical: 0.4,
    user: 0.2,
    peer: 0.4,
  },
  historicalHalfLifeDays: 14,
  historicalMaxAgeDays: 30,
  minimumHistoricalWeight: 0.2,
  occupancyTrustNormalizationDivisor: 4,
  neutralUserWeight: 1.0,
  // Tune these later after calibration with real report data.
};

export class AuthService {
  constructor(private readonly userRepository: AuthUserRepository) {}

  async registerUser(userData: RegisterUserInput): Promise<User> {
    return this.userRepository.createUser(userData);
  }

  async authenticateUser(loginData: LoginInput): Promise<AuthenticationResult> {
    const result = await this.userRepository.authenticate(loginData);

    if (!result) {
      throw new Error("Invalid login credentials");
    }

    return result;
  }

  async verifyEmail(token: string): Promise<User> {
    const user = await this.userRepository.verifyEmail(token);

    if (!user) {
      throw new Error("Invalid or expired verification token");
    }

    return user;
  }

  async generateResetToken(email: string): Promise<boolean> {
    return this.userRepository.generateResetToken(email);
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    return this.userRepository.resetPassword(token, newPassword);
  }
}

export class LocationService {
  constructor(
    private readonly studyLocationRepository: LocationQueryRepository,
    private readonly locationGroupRepository: LocationGroupQueryRepository,
    private readonly maxResolutionDistanceMeters: number = 150,
  ) {}

  async getAllGroups(): Promise<LocationGroup[]> {
    return this.locationGroupRepository.getAllLocationGroups();
  }

  async listLocationsByGroup(groupId: string): Promise<StudyLocation[]> {
    const allLocations = await this.studyLocationRepository.getAllStudyLocations();
    return allLocations.filter((location) => location.locationGroupId === groupId);
  }

  async getLocationById(locationId: string): Promise<StudyLocation> {
    const location = await this.studyLocationRepository.getStudyLocationById(locationId);

    if (!location) {
      throw new Error(`StudyLocation not found for id ${locationId}`);
    }

    return location;
  }

  async getLocationGroup(locationId: string): Promise<LocationGroup> {
    const location = await this.getLocationById(locationId);
    const group = await this.locationGroupRepository.getLocationGroupById(location.locationGroupId);

    if (!group) {
      throw new Error(`LocationGroup not found for id ${location.locationGroupId}`);
    }

    return group;
  }

  async getClosestLocation(coords: Coordinates): Promise<StudyLocation> {
    const studyLocations = await this.studyLocationRepository.getAllStudyLocations();

    if (studyLocations.length === 0) {
      throw new Error("No study locations are configured");
    }

    let closestLocation: StudyLocation | null = null;
    let closestDistanceMeters = Number.POSITIVE_INFINITY;

    for (const location of studyLocations) {
      const distanceMeters = haversineDistanceMeters(coords, {
        latitude: location.latitude,
        longitude: location.longitude,
      });

      if (distanceMeters < closestDistanceMeters) {
        closestLocation = location;
        closestDistanceMeters = distanceMeters;
      }
    }

    if (!closestLocation || closestDistanceMeters > this.maxResolutionDistanceMeters) {
      throw new Error("No study location found within the allowed resolution distance");
    }

    return closestLocation;
  }
}

export class SessionService {
  constructor(
    private readonly locationService: LocationService,
    private readonly userRepository: SessionUserRepository,
    private readonly config: SessionServiceConfig = defaultSessionServiceConfig,
  ) {}

  async initializeSession(
    userId: string,
    coords: Coordinates,
  ): Promise<SessionState> {
    const studyLocation = await this.fetchStudyLocation(coords);
    await this.loadUserContext(userId);

    return {
      userId,
      studyLocationId: studyLocation.studyLocationId,
      startedAt: new Date(),
      lastSampleTime: null,
      occupancyLevel: null,
      noiseWindow: [],
    };
  }

  async fetchStudyLocation(coords: Coordinates): Promise<StudyLocation> {
    return this.locationService.getClosestLocation(coords);
  }

  async loadUserContext(userId: string): Promise<User> {
    const user = await this.userRepository.findUserById(userId);

    if (!user) {
      throw new Error(`User not found for id ${userId}`);
    }

    return user;
  }

  getDecibelReading(sessionState: SessionState, reading: number): void {
    if (!Number.isFinite(reading) || reading < 0) {
      throw new Error("Decibel reading must be a non-negative finite number");
    }

    sessionState.noiseWindow.push(reading);
    sessionState.lastSampleTime = new Date();
  }

  updateOccupancy(sessionState: SessionState, level: number, _timestamp: Date = new Date()): void {
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      throw new Error("Occupancy level must be an integer in the range 1..5");
    }

    sessionState.occupancyLevel = level;
  }

  buildReport(sessionState: SessionState): ReportSubmission {
    if (sessionState.occupancyLevel === null) {
      throw new Error("Cannot build report without an occupancy level");
    }

    const summary = this.summarizeNoiseWindow(sessionState.noiseWindow);

    return {
      userId: sessionState.userId,
      studyLocationId: sessionState.studyLocationId,
      avgNoise: summary.avgNoise,
      maxNoise: summary.maxNoise,
      variance: summary.variance,
      occupancy: sessionState.occupancyLevel,
      createdAt: new Date(),
    };
  }

  resetWindowVariables(sessionState: SessionState): void {
    sessionState.noiseWindow = [];
  }

  advanceWindow(sessionState: SessionState): void {
    this.resetWindowVariables(sessionState);
  }

  private summarizeNoiseWindow(rawSamples: number[]): NoiseSummary {
    const sanitizedSamples = rawSamples.filter(
      (sample) => Number.isFinite(sample) && sample >= 0,
    );

    if (sanitizedSamples.length < this.config.minimumSampleCount) {
      throw new Error(
        `At least ${this.config.minimumSampleCount} valid noise samples are required`,
      );
    }

    const smoothedSamples = movingAverageSmooth(
      sanitizedSamples,
      this.config.smoothingWindowSize,
    );
    const processedSamples = winsorizeSamples(
      smoothedSamples,
      this.config.winsorizeLowerQuantile,
      this.config.winsorizeUpperQuantile,
    );

    return {
      sampleCount: processedSamples.length,
      avgNoise: mean(processedSamples),
      maxNoise: Math.max(...processedSamples),
      variance: computeVariance(processedSamples),
      processedSamples,
    };
  }
}

export class A1Service {
  constructor(
    private readonly reportRepository: A1ReportRepository,
    private readonly userRepository: A1UserRepository,
    private readonly studyLocationRepository: A1StudyLocationRepository,
    private readonly locationGroupRepository: A1LocationGroupRepository,
    private readonly config: A1Config = defaultA1Config,
    private readonly archivedSummaryRepository?: ArchivedSummaryRepository,
  ) {}

  async runPollingCycle(now: Date = new Date()): Promise<A1PollingCycleResult> {
    const [reportRecords, studyLocations, locationGroups] = await Promise.all([
      this.reportRepository.getAllReportsWithMetadata(),
      this.studyLocationRepository.getAllStudyLocations(),
      this.locationGroupRepository.getAllLocationGroups(),
    ]);

    const userIds = unique(reportRecords.map((record) => record.report.userId));
    const fetchedUsers = await this.userRepository.findUsersByIds(userIds);
    const userMap = new Map<string, User>(fetchedUsers.map((user) => [user.userId, { ...user }]));

    const metadataUpdates: ReportTagMetadata[] = [];
    const evaluatedRecords: Array<{ report: Report; metadata: ReportTagMetadata; user: User }> = [];
    const activeRecords: Array<{ report: Report; metadata: ReportTagMetadata; user: User }> = [];

    for (const record of reportRecords) {
      const user = getOrCreateUser(userMap, record.report.userId, this.config);
      const metadata = this.evaluateReportMetadata(record.report, reportRecords, user, now);
      metadataUpdates.push(metadata);
      evaluatedRecords.push({ report: record.report, metadata, user });

      if (metadata.decayFactor <= this.config.minWeightThreshold) {
        continue;
      }

      activeRecords.push({ report: record.report, metadata, user });
    }

    if (metadataUpdates.length > 0) {
      await this.reportRepository.upsertReportMetadata(metadataUpdates);
    }

    const { compressedReportIds, deletedSourceReportIds } =
      await this.compressHistoricalReports(evaluatedRecords, now);

    if (deletedSourceReportIds.length > 0) {
      await this.reportRepository.deleteReports(deletedSourceReportIds);
    }

    const updatedStudyLocations = this.recalculateAllStudyLocations(studyLocations, activeRecords, now);
    await this.studyLocationRepository.bulkUpdateStudyLocations(updatedStudyLocations);

    const updatedLocationGroups = this.recalculateAllLocationGroups(
      locationGroups,
      updatedStudyLocations,
      now,
    );
    await this.locationGroupRepository.bulkUpdateLocationGroups(updatedLocationGroups);

    const updatedUsers = this.updateUserTrustFactors(activeRecords, updatedStudyLocations);
    if (updatedUsers.length > 0) {
      await this.userRepository.updateUser(updatedUsers[0]);
      if (updatedUsers.length > 1) {
        await Promise.all(updatedUsers.slice(1).map((user) => this.userRepository.updateUser(user)));
      }
    }

    const archivedSummaries = this.buildArchivedSummaries(reportRecords, now);
    if (archivedSummaries.length > 0 && this.archivedSummaryRepository) {
      await this.archivedSummaryRepository.createArchivedReports(archivedSummaries);
    }

    return {
      evaluatedAt: now,
      activeReportCount: activeRecords.length,
      compressedReportIds,
      staleReportIds: deletedSourceReportIds,
      updatedStudyLocations,
      updatedLocationGroups,
      updatedUsers,
      archivedSummaries,
    };
  }

  evaluateReportMetadata(
    report: Report,
    reportHistory: ReportRecord[],
    user: User,
    now: Date,
  ): ReportTagMetadata {
    const decayFactor = computeReportDecayFactor(
      report.createdAt,
      now,
      this.config.initialDecayWF,
      this.config.reportHalfLifeMs,
    );

    const varianceCorrectionWF = computeVarianceCorrectionWF(
      report.variance,
      this.config.varianceSoftCap,
    );

    const diagnostics = this.evaluateSessionCorrection(report, reportHistory, user);
    const noiseWeightFactor = Math.max(
      0,
      decayFactor * varianceCorrectionWF * diagnostics.sessionCorrectionNoiseWF * user.userNoiseWF,
    );
    const occupancyWeightFactor = Math.max(0, decayFactor * user.userOccupancyWF);

    return {
      reportId: report.reportId,
      decayFactor,
      varianceCorrectionWF,
      sessionCorrectionNoiseWF: diagnostics.sessionCorrectionNoiseWF,
      noiseWeightFactor,
      occupancyWeightFactor,
      lastEvaluatedAt: now,
    };
  }

  async initializeMetadataForNewReport(
    report: Report,
    evaluatedAt: Date = report.createdAt,
  ): Promise<ReportTagMetadata> {
    const [reportsAtLocation, fetchedUsers] = await Promise.all([
      this.reportRepository.getReportsByLocation(report.studyLocationId),
      this.userRepository.findUsersByIds([report.userId]),
    ]);

    const userMap = new Map<string, User>(fetchedUsers.map((user) => [user.userId, { ...user }]));
    const user = getOrCreateUser(userMap, report.userId, this.config);
    const metadata = this.evaluateReportMetadata(report, reportsAtLocation, user, evaluatedAt);

    await this.reportRepository.upsertReportMetadata([metadata]);

    return metadata;
  }

  async recalculateLocationStatus(locationId: string): Promise<void> {
    const [location, reports] = await Promise.all([
      this.studyLocationRepository.getStudyLocationById(locationId),
      this.reportRepository.getReportsByLocation(locationId),
    ]);

    if (!location) {
      throw new Error(`StudyLocation not found for id ${locationId}`);
    }

    const userIds = unique(reports.map((record) => record.report.userId));
    const users = await this.userRepository.findUsersByIds(userIds);
    const userMap = new Map(users.map((user) => [user.userId, user]));

    const activeRecords = reports
      .map((record) => {
        const user = getOrCreateUser(userMap, record.report.userId, this.config);
        const metadata = this.evaluateReportMetadata(record.report, reports, user, new Date());

        if (metadata.decayFactor <= this.config.minWeightThreshold) {
          return null;
        }

        return { report: record.report, metadata, user };
      })
      .filter(isDefined);

    const [updatedLocation] = this.recalculateAllStudyLocations([location], activeRecords, new Date());
    await this.studyLocationRepository.updateStudyLocation(updatedLocation);
  }

  async updateGroupStatus(groupId: string): Promise<void> {
    const [group, allLocations] = await Promise.all([
      this.locationGroupRepository.getLocationGroupById(groupId),
      this.studyLocationRepository.getAllStudyLocations(),
    ]);

    if (!group) {
      throw new Error(`LocationGroup not found for id ${groupId}`);
    }

    const relevantLocations = allLocations.filter((location) => location.locationGroupId === groupId);
    const [updatedGroup] = this.recalculateAllLocationGroups([group], relevantLocations, new Date());
    await this.locationGroupRepository.updateLocationGroup(updatedGroup);
  }

  async pruneExpiredReports(locationId: string): Promise<void> {
    const reportRecords = await this.reportRepository.getReportsByLocation(locationId);
    const staleReportIds = reportRecords
      .map((record) => {
        const decayFactor = computeReportDecayFactor(
          record.report.createdAt,
          new Date(),
          this.config.initialDecayWF,
          this.config.reportHalfLifeMs,
        );

        return decayFactor <= this.config.minWeightThreshold ? record.report.reportId : null;
      })
      .filter(isDefined);

    if (staleReportIds.length > 0) {
      await this.reportRepository.deleteReports(staleReportIds);
    }
  }

  buildArchivedSummaries(reportRecords: ReportRecord[], now: Date): ArchivedReportSummary[] {
    const archiveCutoff = new Date(now.getTime() - this.config.archiveThresholdMs);
    const archiveEligible = reportRecords.filter(
      (record) => record.report.createdAt.getTime() < archiveCutoff.getTime(),
    );

    if (archiveEligible.length === 0) {
      return [];
    }

    const bucketMs = this.config.archiveBucketMinutes * 60 * 1000;
    const byLocation = groupBy(archiveEligible, (record) => record.report.studyLocationId);
    const archivedSummaries: ArchivedReportSummary[] = [];

    for (const [studyLocationId, records] of byLocation) {
      const buckets = new Map<number, ReportRecord[]>();

      for (const record of records) {
        const bucketKey = Math.floor(record.report.createdAt.getTime() / bucketMs) * bucketMs;
        const bucket = buckets.get(bucketKey);
        if (bucket) {
          bucket.push(record);
        } else {
          buckets.set(bucketKey, [record]);
        }
      }

      for (const [bucketKey, bucketRecords] of buckets) {
        const windowStart = new Date(bucketKey);
        const windowEnd = new Date(bucketKey + bucketMs);

        const noiseWeightBasis = bucketRecords.reduce(
          (sum, record) => sum + (record.metadata?.noiseWeightFactor ?? 0),
          0,
        );
        const noiseContributionBasis = bucketRecords.reduce(
          (sum, record) =>
            sum + record.report.avgNoise * (record.metadata?.noiseWeightFactor ?? 0),
          0,
        );
        const occupancyWeightBasis = bucketRecords.reduce(
          (sum, record) => sum + (record.metadata?.occupancyWeightFactor ?? 0),
          0,
        );
        const occupancyContributionBasis = bucketRecords.reduce(
          (sum, record) =>
            sum + record.report.occupancy * (record.metadata?.occupancyWeightFactor ?? 0),
          0,
        );

        archivedSummaries.push({
          reportId: `archive-${studyLocationId}-${windowStart.toISOString()}`,
          reportKind: "archive_summary",
          studyLocationId,
          createdAt: new Date(windowStart.getTime() + this.config.archiveThresholdMs + this.config.archiveBucketMinutes * 60 * 1000),
          avgNoise:
            noiseWeightBasis > 0
              ? noiseContributionBasis / noiseWeightBasis
              : mean(bucketRecords.map((record) => record.report.avgNoise)),
          occupancy:
            occupancyWeightBasis > 0
              ? occupancyContributionBasis / occupancyWeightBasis
              : mean(bucketRecords.map((record) => record.report.occupancy)),
          windowStart,
          windowEnd,
        });
      }
    }

    return archivedSummaries;
  }

  private evaluateSessionCorrection(
    _report: Report,
    _reportHistory: ReportRecord[],
    _user: User,
  ): SessionCorrectionNoiseWFDiagnostics {
    return {
      sessionCorrectionNoiseWF: 1.0,
      historicalScore: 1.0,
      userScore: 1.0,
      peerScore: 1.0,
      historicalBaselineNoise: null,
      peerBaselineNoise: null,
      historicalPeerCount: 0,
      currentPeerCount: 0,
    };
  }

  private async compressHistoricalReports(
    evaluatedRecords: Array<{ report: Report; metadata: ReportTagMetadata; user: User }>,
    now: Date,
  ): Promise<{ compressedReportIds: string[]; deletedSourceReportIds: string[] }> {
    const archiveCutoff = new Date(now.getTime() - this.config.archiveThresholdMs);
    const buckets = new Map<
      string,
      Array<{ report: Report; metadata: ReportTagMetadata }>
    >();

    for (const record of evaluatedRecords) {
      const bucketStart = floorToBucketStart(
        record.report.createdAt,
        this.config.archiveBucketMinutes,
      );
      const bucketEnd = new Date(
        bucketStart.getTime() + this.config.archiveBucketMinutes * 60 * 1000,
      );

      if (bucketEnd.getTime() > archiveCutoff.getTime()) {
        continue;
      }

      const bucketKey = `${record.report.studyLocationId}|${bucketStart.toISOString()}`;
      const bucket = buckets.get(bucketKey);

      if (bucket) {
        bucket.push({ report: record.report, metadata: record.metadata });
      } else {
        buckets.set(bucketKey, [{ report: record.report, metadata: record.metadata }]);
      }
    }

    const archivedSummaries: ArchivedReportSummary[] = [];
    const deletedSourceReportIds: string[] = [];

    for (const [bucketKey, records] of buckets.entries()) {
      if (records.length === 0) {
        continue;
      }

      const [studyLocationId, bucketStartIso] = bucketKey.split("|");
      const windowStart = new Date(bucketStartIso);
      const windowEnd = new Date(
        windowStart.getTime() + this.config.archiveBucketMinutes * 60 * 1000,
      );

      const noiseWeightBasis = records.reduce(
        (sum, record) => sum + record.metadata.noiseWeightFactor,
        0,
      );
      const occupancyWeightBasis = records.reduce(
        (sum, record) => sum + record.metadata.occupancyWeightFactor,
        0,
      );
      const noiseContributionBasis = records.reduce(
        (sum, record) => sum + record.report.avgNoise * record.metadata.noiseWeightFactor,
        0,
      );
      const occupancyContributionBasis = records.reduce(
        (sum, record) => sum + record.report.occupancy * record.metadata.occupancyWeightFactor,
        0,
      );

      archivedSummaries.push({
        reportId: `archive-${studyLocationId}-${windowStart.toISOString()}`,
        reportKind: "archive_summary",
        studyLocationId,
        createdAt: new Date(windowStart.getTime() + this.config.archiveThresholdMs + this.config.archiveBucketMinutes * 60 * 1000),
        avgNoise:
          noiseWeightBasis > 0
            ? noiseContributionBasis / noiseWeightBasis
            : mean(records.map((record) => record.report.avgNoise)),
        occupancy:
          occupancyWeightBasis > 0
            ? occupancyContributionBasis / occupancyWeightBasis
            : mean(records.map((record) => record.report.occupancy)),
        windowStart,
        windowEnd,
      });

      deletedSourceReportIds.push(...records.map((record) => record.report.reportId));
    }

    if (archivedSummaries.length > 0) {
      await this.reportRepository.createArchivedReports(archivedSummaries);
    }

    return {
      compressedReportIds: archivedSummaries.map((summary) => summary.reportId),
      deletedSourceReportIds,
    };
  }

  private recalculateAllStudyLocations(
    studyLocations: StudyLocation[],
    activeRecords: Array<{ report: Report; metadata: ReportTagMetadata; user: User }>,
    now: Date,
  ): StudyLocation[] {
    const reportsByLocationId = groupBy(activeRecords, (record) => record.report.studyLocationId);

    return studyLocations.map((location) => {
      const locationRecords = reportsByLocationId.get(location.studyLocationId) ?? [];

      if (locationRecords.length === 0) {
        return {
          ...location,
          currentNoiseLevel: null,
          currentOccupancyLevel: null,
          updatedAt: location.updatedAt,
        };
      }

      const noiseNumerator = locationRecords.reduce(
        (sum, record) => sum + record.report.avgNoise * record.metadata.noiseWeightFactor,
        0,
      );
      const noiseDenominator = locationRecords.reduce(
        (sum, record) => sum + record.metadata.noiseWeightFactor,
        0,
      );
      const occupancyNumerator = locationRecords.reduce(
        (sum, record) => sum + record.report.occupancy * record.metadata.occupancyWeightFactor,
        0,
      );
      const occupancyDenominator = locationRecords.reduce(
        (sum, record) => sum + record.metadata.occupancyWeightFactor,
        0,
      );

      return {
        ...location,
        currentNoiseLevel: noiseDenominator > 0 ? noiseNumerator / noiseDenominator : null,
        currentOccupancyLevel:
          occupancyDenominator > 0 ? occupancyNumerator / occupancyDenominator : null,
        updatedAt: now,
      };
    });
  }

  private recalculateAllLocationGroups(
    groups: LocationGroup[],
    locations: StudyLocation[],
    now: Date,
  ): LocationGroup[] {
    const locationsByGroupId = groupBy(locations, (location) => location.locationGroupId);

    return groups.map((group) => {
      const childLocations = (locationsByGroupId.get(group.locationGroupId) ?? []).filter(
        (location) =>
          location.updatedAt !== null &&
          location.currentNoiseLevel !== null &&
          location.currentOccupancyLevel !== null,
      );

      if (childLocations.length === 0) {
        return {
          ...group,
          currentNoiseLevel: null,
          currentOccupancyLevel: null,
          updatedAt: group.updatedAt,
        };
      }

      const weightedChildren = childLocations.map((location) => ({
        location,
        recencyWeight: computeLocationRecencyWeight(
          location.updatedAt as Date,
          now,
          this.config.groupFreshnessWindowMs,
        ),
      }));

      const activeWeightedChildren = weightedChildren.filter((entry) => entry.recencyWeight > 0);
      if (activeWeightedChildren.length === 0) {
        return {
          ...group,
          currentNoiseLevel: null,
          currentOccupancyLevel: null,
          updatedAt: group.updatedAt,
        };
      }

      const noiseNumerator = activeWeightedChildren.reduce(
        (sum, entry) => sum + (entry.location.currentNoiseLevel as number) * entry.recencyWeight,
        0,
      );
      const occupancyNumerator = activeWeightedChildren.reduce(
        (sum, entry) =>
          sum + (entry.location.currentOccupancyLevel as number) * entry.recencyWeight,
        0,
      );
      const denominator = activeWeightedChildren.reduce(
        (sum, entry) => sum + entry.recencyWeight,
        0,
      );

      const newestUpdatedAt = activeWeightedChildren.reduce((latest, entry) => {
        const updatedAt = entry.location.updatedAt as Date;
        return updatedAt.getTime() > latest.getTime() ? updatedAt : latest;
      }, activeWeightedChildren[0].location.updatedAt as Date);

      return {
        ...group,
        currentNoiseLevel: denominator > 0 ? noiseNumerator / denominator : null,
        currentOccupancyLevel: denominator > 0 ? occupancyNumerator / denominator : null,
        updatedAt: newestUpdatedAt,
      };
    });
  }

  private updateUserTrustFactors(
    activeRecords: Array<{ report: Report; metadata: ReportTagMetadata; user: User }>,
    studyLocations: StudyLocation[],
  ): User[] {
    const locationMap = new Map(studyLocations.map((location) => [location.studyLocationId, location]));
    const userBuckets = new Map<
      string,
      {
        user: User;
        occupancySignedErrorTotal: number;
        noiseSignedErrorTotal: number;
        sampleCount: number;
      }
    >();

    for (const activeRecord of activeRecords) {
      const location = locationMap.get(activeRecord.report.studyLocationId);

      if (!location) continue;
      if (location.currentNoiseLevel === null || location.currentOccupancyLevel === null) continue;

      const occupancySignedError = clamp(
        (activeRecord.report.occupancy - location.currentOccupancyLevel) /
          this.config.occupancyTrustNormalizationDivisor,
        -1,
        1,
      );
      const noiseSignedError = clamp(
        (activeRecord.report.avgNoise - location.currentNoiseLevel) / this.config.noiseTrustRangeDb,
        -1,
        1,
      );

      const bucket = userBuckets.get(activeRecord.user.userId) ?? {
        user: { ...activeRecord.user },
        occupancySignedErrorTotal: 0,
        noiseSignedErrorTotal: 0,
        sampleCount: 0,
      };

      bucket.occupancySignedErrorTotal += occupancySignedError;
      bucket.noiseSignedErrorTotal += noiseSignedError;
      bucket.sampleCount += 1;
      userBuckets.set(activeRecord.user.userId, bucket);
    }

    const updatedUsers: User[] = [];

    for (const bucket of userBuckets.values()) {
      if (bucket.sampleCount < this.config.minReportsForTrustUpdate) {
        continue;
      }

      const avgOccupancySignedError = bucket.occupancySignedErrorTotal / bucket.sampleCount;
      const avgNoiseSignedError = bucket.noiseSignedErrorTotal / bucket.sampleCount;

      bucket.user.userOccupancyWF = applyAsymmetricTrustUpdate(
        bucket.user.userOccupancyWF,
        avgOccupancySignedError,
        this.config.occupancyOverreportRate,
        this.config.occupancyUnderreportRate,
        this.config.minUserOccupancyWF,
        this.config.maxUserOccupancyWF,
        this.config.trustExponent,
        this.config.trustDeadband,
      );

      bucket.user.userNoiseWF = applyAsymmetricTrustUpdate(
        bucket.user.userNoiseWF,
        avgNoiseSignedError,
        this.config.noiseOverreportRate,
        this.config.noiseUnderreportRate,
        this.config.minUserNoiseWF,
        this.config.maxUserNoiseWF,
        this.config.trustExponent,
        this.config.trustDeadband,
      );

      updatedUsers.push(bucket.user);
    }

    return updatedUsers;
  }
}

export class ReportService {
  constructor(
    private readonly reportRepository: ReportWriteRepository,
    private readonly a1Service: A1Service,
  ) {}

  // Accepts the exact ReportSubmission object produced by SessionService.buildReport().
  // The client submits only report fields; the server initializes A1 metadata immediately.
  async submitNewReport(reportData: ReportSubmission): Promise<Report> {
    const report = await this.reportRepository.createReport(reportData);
    await this.a1Service.initializeMetadataForNewReport(report, report.createdAt);
    return report;
  }

  async recalculateLocationStatus(locationId: string): Promise<void> {
    await this.a1Service.recalculateLocationStatus(locationId);
  }

  async updateGroupStatus(groupId: string): Promise<void> {
    await this.a1Service.updateGroupStatus(groupId);
  }

  async pruneExpiredReports(locationId: string): Promise<void> {
    await this.a1Service.pruneExpiredReports(locationId);
  }
}

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  async register(req: RequestLike<RegisterUserInput>, res: ResponseLike): Promise<void> {
    const user = await this.authService.registerUser(req.body);
    res.status(201).json(user);
  }

  async login(req: RequestLike<LoginInput>, res: ResponseLike): Promise<void> {
    const result = await this.authService.authenticateUser(req.body);
    res.status(200).json(result);
  }

  async verifyEmail(req: RequestLike<unknown, { token: string }>, res: ResponseLike): Promise<void> {
    const user = await this.authService.verifyEmail(req.params.token);
    res.status(200).json(user);
  }

  async forgotPassword(req: RequestLike<{ email: string }>, res: ResponseLike): Promise<void> {
    const ok = await this.authService.generateResetToken(req.body.email);
    res.status(200).json({ ok });
  }

  async resetPassword(
    req: RequestLike<{ token: string; newPassword: string }>,
    res: ResponseLike,
  ): Promise<void> {
    const ok = await this.authService.resetPassword(req.body.token, req.body.newPassword);
    res.status(200).json({ ok });
  }

  async getProfile(req: RequestLike, res: ResponseLike): Promise<void> {
    res.status(501).json({ message: "Not yet implemented" });
  }

  async updateProfile(req: RequestLike, res: ResponseLike): Promise<void> {
    res.status(501).json({ message: "Not yet implemented" });
  }
}

export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  async getAllGroups(_req: RequestLike, res: ResponseLike): Promise<void> {
    const groups = await this.locationService.getAllGroups();
    res.status(200).json(groups);
  }

  async getLocationByGroup(
    req: RequestLike<unknown, { groupId: string }>,
    res: ResponseLike,
  ): Promise<void> {
    const locations = await this.locationService.listLocationsByGroup(req.params.groupId);
    res.status(200).json(locations);
  }

  async getLocationById(
    req: RequestLike<unknown, { locationId: string }>,
    res: ResponseLike,
  ): Promise<void> {
    const location = await this.locationService.getLocationById(req.params.locationId);
    res.status(200).json(location);
  }

  async getClosestLocation(
    req: RequestLike<unknown, Record<string, string>, { latitude: string; longitude: string }>,
    res: ResponseLike,
  ): Promise<void> {
    const location = await this.locationService.getClosestLocation({
      latitude: Number(req.query.latitude),
      longitude: Number(req.query.longitude),
    });

    res.status(200).json(location);
  }
}

export class ReportController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly reportService: ReportService,
    private readonly reportRepository: ReportReadRepository,
  ) {}

  async createReport(req: RequestLike<{ sessionState: SessionState }>, res: ResponseLike): Promise<void> {
    const reportData = this.sessionService.buildReport(req.body.sessionState);
    const report = await this.reportService.submitNewReport(reportData);
    res.status(201).json(report);
  }

  async getReportsByLocation(
    req: RequestLike<unknown, { locationId: string }>,
    res: ResponseLike,
  ): Promise<void> {
    const reports = await this.reportRepository.getReportsByLocation(req.params.locationId);
    res.status(200).json(reports);
  }

  async getRecentReports(_req: RequestLike, res: ResponseLike): Promise<void> {
    const reports = await this.reportRepository.getRecentReports();
    res.status(200).json(reports);
  }
}

export function computeHistoricalBaseline(
  summaries: ArchivedReportSummary[],
  now: Date,
  config: A1Config,
): HistoricalBaseline | null {
  const currentBucketStart = floorToBucketStart(now, config.archiveBucketMinutes);
  const currentBucketHour = currentBucketStart.getUTCHours();
  const currentBucketMinute = currentBucketStart.getUTCMinutes();

  const maxAgeMs = config.historicalMaxAgeDays * 24 * 60 * 60 * 1000;
  const lambda = Math.log(2) / config.historicalHalfLifeDays;

  const matching: Array<{ summary: ArchivedReportSummary; weight: number }> = [];

  for (const summary of summaries) {
    const ageMs = Math.max(0, now.getTime() - summary.windowStart.getTime());
    if (ageMs > maxAgeMs) {
      continue;
    }

    if (
      summary.windowStart.getUTCHours() !== currentBucketHour ||
      summary.windowStart.getUTCMinutes() !== currentBucketMinute
    ) {
      continue;
    }

    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const weight = Math.exp(-lambda * ageDays);
    matching.push({ summary, weight });
  }

  if (matching.length === 0) {
    return null;
  }

  const totalWeight = matching.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight < config.minimumHistoricalWeight) {
    return null;
  }

  const usualNoise =
    matching.reduce((sum, entry) => sum + entry.summary.avgNoise * entry.weight, 0) / totalWeight;
  const usualOccupancy =
    matching.reduce((sum, entry) => sum + entry.summary.occupancy * entry.weight, 0) / totalWeight;

  return { usualNoise, usualOccupancy };
}

function haversineDistanceMeters(a: Coordinates, b: Coordinates): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDeltaRadians = toRadians(b.latitude - a.latitude);
  const longitudeDeltaRadians = toRadians(b.longitude - a.longitude);
  const aLatitudeRadians = toRadians(a.latitude);
  const bLatitudeRadians = toRadians(b.latitude);

  const haversineComponent =
    Math.sin(latitudeDeltaRadians / 2) ** 2 +
    Math.cos(aLatitudeRadians) *
      Math.cos(bLatitudeRadians) *
      Math.sin(longitudeDeltaRadians / 2) ** 2;

  const angularDistance =
    2 * Math.atan2(Math.sqrt(haversineComponent), Math.sqrt(1 - haversineComponent));

  return earthRadiusMeters * angularDistance;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function movingAverageSmooth(samples: number[], windowSize: number): number[] {
  if (windowSize <= 1) {
    return [...samples];
  }

  const smoothed: number[] = [];

  for (let index = 0; index < samples.length; index += 1) {
    const startIndex = Math.max(0, index - windowSize + 1);
    const window = samples.slice(startIndex, index + 1);
    smoothed.push(mean(window));
  }

  return smoothed;
}

function winsorizeSamples(
  samples: number[],
  lowerQuantile: number,
  upperQuantile: number,
): number[] {
  if (samples.length === 0) {
    return [];
  }

  if (lowerQuantile < 0 || upperQuantile > 1 || lowerQuantile >= upperQuantile) {
    throw new Error("Winsorize quantiles must satisfy 0 <= lower < upper <= 1");
  }

  const sortedSamples = [...samples].sort((left, right) => left - right);
  const lowerBound = quantile(sortedSamples, lowerQuantile);
  const upperBound = quantile(sortedSamples, upperQuantile);

  return samples.map((sample) => clamp(sample, lowerBound, upperBound));
}

function quantile(sortedSamples: number[], q: number): number {
  if (sortedSamples.length === 1) {
    return sortedSamples[0];
  }

  const position = (sortedSamples.length - 1) * q;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const interpolationWeight = position - lowerIndex;

  if (lowerIndex === upperIndex) {
    return sortedSamples[lowerIndex];
  }

  return (
    sortedSamples[lowerIndex] * (1 - interpolationWeight) +
    sortedSamples[upperIndex] * interpolationWeight
  );
}

function computeVariance(values: number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute variance of an empty array");
  }

  const average = mean(values);
  const squaredDeviationSum = values.reduce(
    (sum, value) => sum + (value - average) ** 2,
    0,
  );

  return squaredDeviationSum / values.length;
}

function computeReportDecayFactor(
  createdAt: Date,
  now: Date,
  initialDecayWF: number,
  reportHalfLifeMs: number,
): number {
  if (reportHalfLifeMs <= 0) {
    throw new Error("reportHalfLifeMs must be > 0");
  }

  const ageMs = Math.max(0, now.getTime() - createdAt.getTime());
  const lambda = Math.log(2) / reportHalfLifeMs;
  return initialDecayWF * Math.exp(-lambda * ageMs);
}

function computeVarianceCorrectionWF(variance: number, varianceSoftCap: number): number {
  if (varianceSoftCap <= 0) {
    throw new Error("varianceSoftCap must be > 0");
  }

  const safeVariance = Math.max(0, variance);
  const normalizedVariance = safeVariance / varianceSoftCap;
  return 1 / (1 + normalizedVariance);
}

function computeLocationRecencyWeight(
  updatedAt: Date,
  now: Date,
  groupFreshnessWindowMs: number,
): number {
  if (groupFreshnessWindowMs <= 0) {
    throw new Error("groupFreshnessWindowMs must be > 0");
  }

  const ageMs = Math.max(0, now.getTime() - updatedAt.getTime());
  return clamp(1 - ageMs / groupFreshnessWindowMs, 0, 1);
}

function applyAsymmetricTrustUpdate(
  currentWF: number,
  signedError: number,
  overreportRate: number,
  underreportRate: number,
  minWF: number,
  maxWF: number,
  exponent: number,
  deadband: number,
): number {
  if (exponent <= 0) {
    throw new Error("trustExponent must be > 0");
  }

  if (Math.abs(signedError) <= deadband) {
    return currentWF;
  }

  const magnitude = Math.pow(Math.abs(signedError), exponent);

  if (signedError > 0) {
    return clamp(currentWF * (1 - overreportRate * magnitude), minWF, maxWF);
  }

  return clamp(currentWF * (1 + underreportRate * magnitude), minWF, maxWF);
}

function scoreDeviation(deviationDb: number, toleranceDb: number): number {
  if (toleranceDb <= 0) {
    throw new Error("Tolerance dB values must be > 0");
  }

  return clamp(1 - deviationDb / toleranceDb, 0, 1);
}

function computeUserNoiseScore(
  user: User,
  userNoiseWFNeutral: number,
  userNoiseWFSoftRange: number,
): number {
  if (userNoiseWFSoftRange <= 0) {
    throw new Error("userNoiseWFSoftRange must be > 0");
  }

  const deviationFromNeutral = Math.abs(user.userNoiseWF - userNoiseWFNeutral);
  return clamp(1 - deviationFromNeutral / userNoiseWFSoftRange, 0, 1);
}

function minuteOfWeek(date: Date): number {
  const dayOfWeek = date.getDay();
  const minutesOfDay = date.getHours() * 60 + date.getMinutes();
  return dayOfWeek * 24 * 60 + minutesOfDay;
}

function circularMinuteDistance(left: number, right: number, cycleLength: number): number {
  const directDistance = Math.abs(left - right);
  return Math.min(directDistance, cycleLength - directDistance);
}

function floorToBucketStart(date: Date, bucketMinutes: number): Date {
  if (bucketMinutes <= 0) {
    throw new Error("archive bucket minutes must be > 0");
  }

  const bucketMs = bucketMinutes * 60 * 1000;
  const flooredMs = Math.floor(date.getTime() / bucketMs) * bucketMs;
  return new Date(flooredMs);
}

function mean(values: number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute mean of an empty array");
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedAverage(values: number[], weights: number[]): number {
  if (values.length !== weights.length || values.length === 0) {
    throw new Error("Weighted average requires equally sized non-empty arrays");
  }

  const denominator = weights.reduce((sum, weight) => sum + weight, 0);
  if (denominator <= 0) {
    throw new Error("Weighted average requires total weight > 0");
  }

  const numerator = values.reduce(
    (sum, value, index) => sum + value * weights[index],
    0,
  );

  return numerator / denominator;
}

function groupBy<T, K>(items: T[], getKey: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const bucket = map.get(key);

    if (bucket) {
      bucket.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  return map;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function getOrCreateUser(userMap: Map<string, User>, userId: string, config: A1Config): User {
  const existingUser = userMap.get(userId);
  if (existingUser) {
    return existingUser;
  }

  const createdUser: User = {
    userId,
    userNoiseWF: clamp(config.neutralUserWeight, config.minUserNoiseWF, config.maxUserNoiseWF),
    userOccupancyWF: clamp(config.neutralUserWeight, config.minUserOccupancyWF, config.maxUserOccupancyWF),
  };

  userMap.set(userId, createdUser);
  return createdUser;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/*
Layout notes:
1. This file follows the UML service structure: AuthService, SessionService, ReportService, and LocationService.
2. A1Service is kept separate because it owns the timed aggregation / decay / trust-adjustment algorithm.
3. Location resolution logic now lives inside LocationService.
4. Noise summarization logic now lives inside SessionService.
5. This UML-aligned file is the source of truth for A1Service and its asymmetric trust update flow.
6. Session-correction logic here should stay behaviorally aligned with support_services.ts.
7. Repositories remain abstract on purpose; database implementations are still pending.
*/
