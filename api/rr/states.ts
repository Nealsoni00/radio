import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../lib/db-helper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await query(`
      SELECT id, name, abbreviation, country_id as "countryId"
      FROM rr_states
      ORDER BY name
    `);
    return res.status(200).json({ states: result.rows });
  } catch (error: any) {
    console.error('Error fetching states:', error);
    return res.status(500).json({ error: 'Failed to fetch states', message: error.message });
  }
}
