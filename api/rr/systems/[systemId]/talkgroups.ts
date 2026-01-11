import type { VercelRequest, VercelResponse } from '@vercel/node';

async function getClient(): Promise<any> {
  const pg = await import('pg');
  const { Client } = pg.default || pg;

  const connectionString = process.env.POSTGRES_URL || '';
  const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/gi, '');

  const client = new Client({
    connectionString: cleanConnectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await getClient();

  try {
    const systemId = parseInt(req.query.systemId as string);
    if (isNaN(systemId)) {
      return res.status(400).json({ error: 'Invalid system ID' });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 1000;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const result = await client.query(`
      SELECT
        id, system_id as "systemId", talkgroup_id as "talkgroupId",
        alpha_tag as "alphaTag", description, mode, category, tag
      FROM rr_talkgroups
      WHERE system_id = $1
      ORDER BY talkgroup_id
      LIMIT $2 OFFSET $3
    `, [systemId, limit, offset]);

    const countResult = await client.query(`
      SELECT COUNT(*) as total
      FROM rr_talkgroups
      WHERE system_id = $1
    `, [systemId]);

    return res.status(200).json({
      talkgroups: result.rows,
      total: parseInt(countResult.rows[0].total),
    });
  } catch (error: any) {
    console.error('Error fetching talkgroups:', error);
    return res.status(500).json({ error: 'Failed to fetch talkgroups', message: error.message });
  } finally {
    await client.end();
  }
}
