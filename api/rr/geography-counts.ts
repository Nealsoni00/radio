import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGeographyCounts } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const counts = await getGeographyCounts();
    return res.status(200).json(counts);
  } catch (error) {
    console.error('Error fetching geography counts:', error);
    return res.status(500).json({ error: 'Failed to fetch geography counts' });
  }
}
