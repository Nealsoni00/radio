import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSystem, getSites, getFrequencies, getTalkgroups } from '../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = parseInt(req.query.id as string);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid system ID' });
    }

    const system = await getSystem(id);
    if (!system) {
      return res.status(404).json({ error: 'System not found' });
    }

    const [sites, frequencies, talkgroupsResult] = await Promise.all([
      getSites(id),
      getFrequencies(id),
      getTalkgroups(id),
    ]);

    return res.status(200).json({
      system,
      sites,
      frequencies,
      talkgroups: talkgroupsResult.talkgroups,
      talkgroupCount: talkgroupsResult.total,
    });
  } catch (error) {
    console.error('Error fetching system:', error);
    return res.status(500).json({ error: 'Failed to fetch system' });
  }
}
