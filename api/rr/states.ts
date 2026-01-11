import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStates } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const states = await getStates();
    return res.status(200).json({ states });
  } catch (error) {
    console.error('Error fetching states:', error);
    return res.status(500).json({ error: 'Failed to fetch states' });
  }
}
