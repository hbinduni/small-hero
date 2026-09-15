export class GameSound {
  private context: AudioContext | null = null;
  enabled = false;
  async toggle() {
    if (!this.context) this.context = new AudioContext();
    await this.context.resume();
    this.enabled = !this.enabled;
    if (this.enabled) this.play('gather');
    return this.enabled;
  }
  play(event: string) {
    if (!this.enabled || !this.context || event === 'move' || event === 'tick')
      return;
    const ctx = this.context;
    const notes =
      event === 'craft' || event === 'claim' || event === 'dragon_defeat'
        ? [392, 494, 587, 784]
        : event === 'gather' || event === 'defeat'
          ? [523, 659]
          : event === 'heal' || event === 'rest'
            ? [440, 554]
            : event === 'fire_hit'
              ? [95, 65, 40]
              : [180];
    for (const [i, note] of notes.entries()) {
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.075;
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(note, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.21);
    }
  }
}
