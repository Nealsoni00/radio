import type { FastifyInstance } from 'fastify';
import { existsSync } from 'fs';
import { getCall } from '../../db/index.js';

interface AudioParams {
  id: string;
}

export async function audioRoutes(app: FastifyInstance): Promise<void> {
  // Serve audio file for a call
  app.get<{ Params: AudioParams }>(
    '/api/audio/:id',
    async (request, reply) => {
      const { id } = request.params;

      const call = getCall(id);
      if (!call) {
        return reply.status(404).send({ error: 'Call not found' });
      }

      if (!call.audio_file) {
        return reply.status(404).send({ error: 'Audio file not available' });
      }

      if (!existsSync(call.audio_file)) {
        return reply.status(404).send({ error: 'Audio file not found on disk' });
      }

      return reply.sendFile(call.audio_file);
    }
  );
}
