import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTalkgroups } from '../../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const systemId = parseInt(req.query.systemId as string);
    if (isNaN(systemId)) {
      return res.status(400).json({ error: 'Invalid system ID' });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 1000;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const result = await getTalkgroups(systemId, { limit, offset });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching talkgroups:', error);
    return res.status(500).json({ error: 'Failed to fetch talkgroups' });
  }
}
