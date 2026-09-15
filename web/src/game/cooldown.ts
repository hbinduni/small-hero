export class ActionCooldown {
  private busy = false;
  private readyAt = 0;
  constructor(private readonly duration: number) {}
  begin(now: number): boolean {
    if (this.busy || now < this.readyAt) return false;
    this.busy = true;
    return true;
  }
  complete(now: number) {
    this.busy = false;
    // A delayed response must not consume the next server-side attack cooldown.
    this.readyAt = now + this.duration;
  }
}
