import { FastifyInstance } from 'fastify';
import type { FFTRecorder, RecordingMetadata } from '../../services/spectrum/fft-recorder.js';
import type { FFTReplayer } from '../../services/spectrum/fft-replayer.js';
import { frequencyScanner } from '../../services/spectrum/frequency-scanner.js';

interface SpectrumRouteDeps {
  recorder: FFTRecorder;
  replayer: FFTReplayer;
}

export function spectrumRoutes(deps: SpectrumRouteDeps) {
  return async function (app: FastifyInstance) {
    const { recorder, replayer } = deps;

    // Get all recordings
    app.get('/api/spectrum/recordings', async () => {
      const recordings = recorder.getRecordings();
      return { recordings };
    });

    // Get recording status
    app.get('/api/spectrum/recording/status', async () => {
      return recorder.getRecordingStatus();
    });

    // Start a new recording
    app.post<{
      Body: { duration: number; name?: string };
    }>('/api/spectrum/recording/start', async (request, reply) => {
      const { duration, name } = request.body;

      if (!duration || duration < 1 || duration > 3600) {
        return reply.code(400).send({ error: 'Duration must be between 1 and 3600 seconds' });
      }

      try {
        const id = recorder.startRecording(duration, name);
        return { success: true, id, duration };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    });

    // Stop current recording
    app.post('/api/spectrum/recording/stop', async () => {
      const metadata = recorder.stopRecording();
      if (metadata) {
        return { success: true, metadata };
      }
      return { success: false, message: 'No recording in progress' };
    });

    // Get a specific recording metadata and events
    app.get<{
      Params: { id: string };
      Querystring: { includeEvents?: string };
    }>('/api/spectrum/recordings/:id', async (request, reply) => {
      const recording = recorder.getRecording(request.params.id);
      if (!recording) {
        return reply.code(404).send({ error: 'Recording not found' });
      }
      // Include events if requested (exclude packets to save bandwidth)
      if (request.query.includeEvents === 'true') {
        return {
          metadata: recording.metadata,
          controlChannelEvents: recording.controlChannelEvents,
        };
      }
      return { metadata: recording.metadata };
    });

    // Delete a recording
    app.delete<{
      Params: { id: string };
    }>('/api/spectrum/recordings/:id', async (request, reply) => {
      const success = recorder.deleteRecording(request.params.id);
      if (!success) {
        return reply.code(404).send({ error: 'Recording not found' });
      }
      return { success: true };
    });

    // Get replay status
    app.get('/api/spectrum/replay/status', async () => {
      return replayer.getReplayStatus();
    });

    // Start replay
    app.post<{
      Body: { recordingId: string; loop?: boolean };
    }>('/api/spectrum/replay/start', async (request, reply) => {
      const { recordingId, loop = false } = request.body;

      if (!recordingId) {
        return reply.code(400).send({ error: 'recordingId is required' });
      }

      const success = replayer.startReplay(recordingId, loop);
      if (!success) {
        return reply.code(404).send({ error: 'Recording not found' });
      }

      return { success: true, recordingId, loop };
    });

    // Stop replay
    app.post('/api/spectrum/replay/stop', async () => {
      replayer.stopReplay();
      return { success: true };
    });

    // Pause replay
    app.post('/api/spectrum/replay/pause', async () => {
      replayer.pauseReplay();
      return { success: true };
    });

    // Resume replay
    app.post('/api/spectrum/replay/resume', async () => {
      replayer.resumeReplay();
      return { success: true };
    });

    // Get combined status (recording + replay)
    app.get('/api/spectrum/status', async () => {
      return {
        recording: recorder.getRecordingStatus(),
        replay: replayer.getReplayStatus(),
        recordings: recorder.getRecordings(),
      };
    });

    // ===== Frequency Scanner Endpoints =====

    // Get scanner status and SDR coverage
    app.get('/api/spectrum/scanner/status', async () => {
      const coverage = frequencyScanner.getCoverage();
      const hasData = frequencyScanner.hasData();
      const dataAge = frequencyScanner.getDataAge();

      return {
        hasData,
        dataAge,
        coverage,
        ready: hasData && dataAge !== null && dataAge < 5000, // Data is fresh (< 5 seconds old)
      };
    });

    // Scan a list of frequencies for signal presence
    app.post<{
      Body: { frequencies: number[] };
    }>('/api/spectrum/scanner/scan', async (request, reply) => {
      const { frequencies } = request.body;

      if (!frequencies || !Array.isArray(frequencies) || frequencies.length === 0) {
        return reply.code(400).send({ error: 'frequencies array is required' });
      }

      if (frequencies.length > 1000) {
        return reply.code(400).send({ error: 'Too many frequencies (max 1000)' });
      }

      const results = frequencyScanner.scanFrequencies(frequencies);

      if (!results) {
        return reply.code(503).send({
          error: 'No FFT data available. Make sure trunk-recorder is running and sending FFT data.',
        });
      }

      return results;
    });

    // Get signal strength at a single frequency
    app.get<{
      Params: { frequency: string };
    }>('/api/spectrum/scanner/signal/:frequency', async (request, reply) => {
      const frequency = parseInt(request.params.frequency, 10);

      if (isNaN(frequency)) {
        return reply.code(400).send({ error: 'Invalid frequency' });
      }

      const coverage = frequencyScanner.getCoverage();
      if (!coverage) {
        return reply.code(503).send({ error: 'No FFT data available' });
      }

      const inRange = frequencyScanner.isFrequencyInRange(frequency);
      if (!inRange) {
        return {
          frequency,
          inRange: false,
          coverage,
          message: `Frequency ${frequency / 1e6} MHz is outside current SDR range (${coverage.minFreq / 1e6} - ${coverage.maxFreq / 1e6} MHz)`,
        };
      }

      const signal = frequencyScanner.getSignalStrength(frequency);
      return {
        frequency,
        inRange: true,
        signal,
        coverage,
      };
    });
  };
}
