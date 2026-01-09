import { FastifyInstance } from 'fastify';
import type { FFTRecorder, RecordingMetadata } from '../../services/spectrum/fft-recorder.js';
import type { FFTReplayer } from '../../services/spectrum/fft-replayer.js';

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

    // Get a specific recording metadata
    app.get<{
      Params: { id: string };
    }>('/api/spectrum/recordings/:id', async (request, reply) => {
      const recording = recorder.getRecording(request.params.id);
      if (!recording) {
        return reply.code(404).send({ error: 'Recording not found' });
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
  };
}
