import type { FastifyInstance } from 'fastify';
import { getChannels, getChannelByFrequency, upsertChannel } from '../../db/index.js';

interface ChannelParams {
  id: string;
}

interface CreateChannelBody {
  frequency: number;
  alphaTag: string;
  description?: string;
  groupName?: string;
  groupTag?: string;
  mode?: string;
}

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  // Get all channels (for conventional systems)
  app.get('/api/channels', async () => {
    const channels = getChannels();
    return { channels };
  });

  // Get channel by frequency
  app.get<{ Params: ChannelParams }>(
    '/api/channels/:id',
    async (request, reply) => {
      const { id } = request.params;

      // Try to parse as frequency first (in Hz)
      const frequency = parseInt(id, 10);
      if (!isNaN(frequency)) {
        const channel = getChannelByFrequency(frequency);
        if (channel) {
          return { channel };
        }
      }

      return reply.status(404).send({ error: 'Channel not found' });
    }
  );

  // Create or update a channel
  app.post<{ Body: CreateChannelBody }>(
    '/api/channels',
    async (request) => {
      const { frequency, alphaTag, description, groupName, groupTag, mode } = request.body;

      const id = upsertChannel(
        frequency,
        alphaTag,
        description || null,
        groupName || null,
        groupTag || null,
        mode || 'D'
      );

      const channel = getChannelByFrequency(frequency);
      return { channel, id };
    }
  );
}
