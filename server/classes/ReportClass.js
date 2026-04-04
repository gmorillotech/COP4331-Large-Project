class Report {
  constructor({ reportId, user, location, createdAt, avgNoise, maxNoise, variance, occupancy }) {
    this.reportId = reportId;
    this.user = user;           // a User object (from the class diagram)
    this.location = location;   // a StudyLocation object (from the class diagram)
    this.createdAt = createdAt ?? new Date();
    this.avgNoise = avgNoise;
    this.maxNoise = maxNoise;
    this.variance = variance;
    this.occupancy = occupancy;
  }

  calculateNoiseStats() {
    // Clamp avgNoise so it never exceeds maxNoise
    if (this.avgNoise > this.maxNoise) {
      this.avgNoise = this.maxNoise;
    }
    // Clamp variance to non-negative
    if (this.variance < 0) {
      this.variance = 0;
    }
    // Derived stat: spread between peak and average noise
    this._noiseRange = this.maxNoise - this.avgNoise;
  }
}

module.exports = Report;