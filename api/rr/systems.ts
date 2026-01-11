import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSystems } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const state = req.query.state ? parseInt(req.query.state as string) : undefined;
    const county = req.query.county ? parseInt(req.query.county as string) : undefined;
    const type = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const result = await getSystems({ state, county, type, search, limit, offset });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching systems:', error);
    return res.status(500).json({ error: 'Failed to fetch systems' });
  }
}
