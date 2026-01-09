import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default server port when PORT is not set', async () => {
    delete process.env.PORT;
    const { config } = await import('./index.js');
    expect(config.server.port).toBe(3000);
  });

  it('should use PORT environment variable when set', async () => {
    process.env.PORT = '4000';
    const { config } = await import('./index.js');
    expect(config.server.port).toBe(4000);
  });

  it('should use default host when HOST is not set', async () => {
    delete process.env.HOST;
    const { config } = await import('./index.js');
    expect(config.server.host).toBe('0.0.0.0');
  });

  it('should use HOST environment variable when set', async () => {
    process.env.HOST = 'localhost';
    const { config } = await import('./index.js');
    expect(config.server.host).toBe('localhost');
  });

  it('should have correct audio defaults', async () => {
    const { config } = await import('./index.js');
    expect(config.audio.sampleRate).toBe(8000);
    expect(config.audio.channels).toBe(1);
    expect(config.audio.bitDepth).toBe(16);
  });

  it('should use default SDR center frequency', async () => {
    delete process.env.SDR_CENTER_FREQ;
    const { config } = await import('./index.js');
    expect(config.sdr.centerFrequency).toBe(770500000);
  });

  it('should use SDR_CENTER_FREQ environment variable when set', async () => {
    process.env.SDR_CENTER_FREQ = '771000000';
    const { config } = await import('./index.js');
    expect(config.sdr.centerFrequency).toBe(771000000);
  });

  it('should use default SDR sample rate', async () => {
    delete process.env.SDR_SAMPLE_RATE;
    const { config } = await import('./index.js');
    expect(config.sdr.sampleRate).toBe(2400000);
  });

  it('should have trunk-recorder audio port default', async () => {
    delete process.env.TR_AUDIO_PORT;
    const { config } = await import('./index.js');
    expect(config.trunkRecorder.audioPort).toBe(9000);
  });

  it('should have RadioReference sync settings', async () => {
    const { config } = await import('./index.js');
    expect(config.radioReference.syncDelayMs).toBeDefined();
    expect(config.radioReference.syncBatchSize).toBeDefined();
    expect(config.radioReference.wsdlUrl).toContain('radioreference.com');
  });
});
