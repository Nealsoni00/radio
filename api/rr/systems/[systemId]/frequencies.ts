import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFrequencies } from '../../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const systemId = parseInt(req.query.systemId as string);
    if (isNaN(systemId)) {
      return res.status(400).json({ error: 'Invalid system ID' });
    }

    const frequencies = await getFrequencies(systemId);
    return res.status(200).json({ frequencies });
  } catch (error) {
    console.error('Error fetching frequencies:', error);
    return res.status(500).json({ error: 'Failed to fetch frequencies' });
  }
}
