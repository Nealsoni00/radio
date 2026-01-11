import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCounties } from '../../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stateId = parseInt(req.query.stateId as string);
    if (isNaN(stateId)) {
      return res.status(400).json({ error: 'Invalid state ID' });
    }

    const counties = await getCounties(stateId);
    return res.status(200).json({ counties });
  } catch (error) {
    console.error('Error fetching counties:', error);
    return res.status(500).json({ error: 'Failed to fetch counties' });
  }
}
