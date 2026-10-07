/**
 * CalcInk Synthesized Audio & Haptic Feedback Engine
 *
 * 100% offline procedural sound synthesis using the Web Audio API (zero audio files).
 * Emits a subtle, crisp "ink tick" and triggers haptic vibration when an equation
 * result is recognized and rendered.
 *
 * AudioContext is initialized lazily upon the user's first gesture to comply
 * with browser autoplay policies.
 */

export class SoundService {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private boundGestureUnlock: (() => void) | null = null;
  private isUnlocked: boolean = false;

  constructor() {
    // Restore user mute preference from localStorage if available
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('calcink_muted');
        if (saved !== null) {
          this.muted = saved === 'true';
        }
      } catch {
        this.muted = false;
      }
    }

    // Prepare lazy unlock listener
    if (typeof window !== 'undefined') {
      this.boundGestureUnlock = this.unlockAudioContext.bind(this);
      window.addEventListener('pointerdown', this.boundGestureUnlock, { passive: true });
      window.addEventListener('keydown', this.boundGestureUnlock, { passive: true });
    }
  }

  /**
   * Lazily unlocks the Web Audio AudioContext upon first user interaction.
   */
  private unlockAudioContext(): void {
    if (this.isUnlocked) return;

    try {
      if (typeof window !== 'undefined') {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass && !this.ctx) {
          this.ctx = new AudioCtxClass();
        }

        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      }

      this.isUnlocked = true;
    } catch {
      // AudioContext unavailable or denied
    }

    // Remove one-time unlock listeners
    if (typeof window !== 'undefined' && this.boundGestureUnlock) {
      window.removeEventListener('pointerdown', this.boundGestureUnlock);
      window.removeEventListener('keydown', this.boundGestureUnlock);
    }
  }

  /**
   * Synthesizes a delicate "tick / ink drop" sound and triggers light vibration.
   */
  public playAnswerTick(): void {
    if (this.muted) return;

    // Haptic vibration feedback for mobile/tablet devices
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(12);
      } catch {
        // Ignore haptic errors on unsupported devices
      }
    }

    // Lazy initialization if unlock handler hasn't fired yet
    if (!this.ctx) {
      this.unlockAudioContext();
    }

    if (!this.ctx || this.ctx.state === 'suspended') {
      return;
    }

    try {
      const now = this.ctx.currentTime;

      // Dual-oscillator tiny tick: a fast transient pop + gentle resonance
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      // Pitch drops quickly: 950Hz down to 420Hz in 35ms (simulates pen tapping parchment)
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.035);

      // Volume envelope: rapid attack and exponential decay
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Audio playback safety (Rule 5: never throw unhandled exceptions)
    }
  }

  /**
   * Sets the mute state and persists preference in localStorage.
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('calcink_muted', String(muted));
      } catch {
        // LocalStorage access may be restricted
      }
    }
  }

  /**
   * Toggles the mute state.
   */
  public toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Returns current mute status.
   */
  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Closes the AudioContext and removes listeners to prevent memory leaks (Rule 7).
   */
  public destroy(): void {
    if (typeof window !== 'undefined' && this.boundGestureUnlock) {
      window.removeEventListener('pointerdown', this.boundGestureUnlock);
      window.removeEventListener('keydown', this.boundGestureUnlock);
    }

    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.ctx.close().catch(() => {});
      } catch {
        // Ignore
      }
      this.ctx = null;
    }
  }
}
