import { Injectable } from '@angular/core';

export type SoundEvent = 'move' | 'capture' | 'check' | 'castle' | 'promotion' | 'game-end';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private context: AudioContext | null = null;
  private unlocked = false;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  unlock(): void {
    if (this.unlocked || typeof AudioContext === 'undefined') {
      return;
    }
    this.context = new AudioContext();
    void this.context.resume();
    this.unlocked = true;
  }

  play(event: SoundEvent): void {
    if (!this.enabled || !this.unlocked || !this.context) {
      return;
    }

    const profile = this.profile(event);
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = profile.wave;
    oscillator.frequency.setValueAtTime(profile.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(profile.endFrequency, now + profile.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(profile.volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + profile.duration);
  }

  private profile(event: SoundEvent): {
    frequency: number;
    endFrequency: number;
    duration: number;
    volume: number;
    wave: OscillatorType;
  } {
    switch (event) {
      case 'capture':
        return { frequency: 190, endFrequency: 95, duration: 0.09, volume: 0.13, wave: 'square' };
      case 'check':
        return { frequency: 740, endFrequency: 520, duration: 0.16, volume: 0.1, wave: 'triangle' };
      case 'castle':
        return {
          frequency: 260,
          endFrequency: 180,
          duration: 0.16,
          volume: 0.11,
          wave: 'triangle',
        };
      case 'promotion':
        return { frequency: 440, endFrequency: 880, duration: 0.22, volume: 0.1, wave: 'sine' };
      case 'game-end':
        return {
          frequency: 360,
          endFrequency: 180,
          duration: 0.35,
          volume: 0.12,
          wave: 'triangle',
        };
      case 'move':
        return { frequency: 230, endFrequency: 180, duration: 0.055, volume: 0.08, wave: 'sine' };
    }
  }
}
