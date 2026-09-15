export class ServerClock {
  private timestamp = 0;
  private latestServerTime = 0;
  private sampledAt = 0;
  sample(
    timestamp: number | undefined,
    localNow = performance.now(),
    roundTrip = 0,
  ) {
    // A delayed receipt can be newer than the last sample but older than our elapsed estimate.
    if (timestamp && timestamp > this.latestServerTime) {
      this.latestServerTime = timestamp;
      // Approximate the return trip using symmetric network latency.
      const estimate = timestamp + Math.max(0, roundTrip) / 2;
      this.timestamp = this.timestamp
        ? Math.max(estimate, this.now(localNow))
        : estimate;
      this.sampledAt = localNow;
    }
  }
  now(localNow = performance.now()) {
    return this.timestamp
      ? this.timestamp + localNow - this.sampledAt
      : Date.now();
  }
}
