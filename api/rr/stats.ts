import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStats } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await getStats();
    return res.status(200).json({
      stats: {
        totalSystems: parseInt(stats.total_systems) || 0,
        totalTalkgroups: parseInt(stats.total_talkgroups) || 0,
        totalSites: parseInt(stats.total_sites) || 0,
        p25Systems: parseInt(stats.p25_systems) || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
