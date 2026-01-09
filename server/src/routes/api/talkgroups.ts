import type { FastifyInstance } from 'fastify';
import { getTalkgroups, getTalkgroup } from '../../db/index.js';

interface TalkgroupParams {
  id: string;
}

export async function talkgroupRoutes(app: FastifyInstance): Promise<void> {
  // Get all talkgroups
  app.get('/api/talkgroups', async () => {
    const talkgroups = getTalkgroups();
    return { talkgroups };
  });

  // Get single talkgroup
  app.get<{ Params: TalkgroupParams }>(
    '/api/talkgroups/:id',
    async (request, reply) => {
      const { id } = request.params;

      const talkgroup = getTalkgroup(parseInt(id, 10));
      if (!talkgroup) {
        return reply.status(404).send({ error: 'Talkgroup not found' });
      }

      return { talkgroup };
    }
  );
}
