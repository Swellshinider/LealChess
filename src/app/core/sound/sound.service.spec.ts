import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundService } from './sound.service';

describe('SoundService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scales event gain by the configured volume', () => {
    const audio = createAudioContext();
    vi.stubGlobal('AudioContext', function AudioContextMock() {
      return audio.context;
    });
    const service = new SoundService();

    service.setVolume(50);
    service.unlock();
    service.play('move');

    expect(audio.gain.gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(1, 0.04, 2.008);
    expect(audio.oscillator.start).toHaveBeenCalledWith(2);
  });

  it('clamps volume and does not create sounds when muted or set to zero', () => {
    const audio = createAudioContext();
    vi.stubGlobal('AudioContext', function AudioContextMock() {
      return audio.context;
    });
    const service = new SoundService();
    service.unlock();

    service.setVolume(-10);
    service.play('move');
    service.setVolume(150);
    service.setEnabled(false);
    service.play('move');
    expect(audio.context.createOscillator).not.toHaveBeenCalled();

    service.setEnabled(true);
    service.play('move');
    expect(audio.gain.gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(1, 0.08, 2.008);
  });

  it('does nothing until browser audio has been unlocked', () => {
    const audio = createAudioContext();
    vi.stubGlobal('AudioContext', function AudioContextMock() {
      return audio.context;
    });
    const service = new SoundService();

    service.play('capture');

    expect(audio.context.createOscillator).not.toHaveBeenCalled();
  });
});

function createAudioContext() {
  const oscillator = {
    type: 'sine' as OscillatorType,
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  const context = {
    currentTime: 2,
    destination: {},
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    resume: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;
  return { context, gain, oscillator };
}
