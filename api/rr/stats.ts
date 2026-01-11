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

  try {
    const client = await getClient();
    const result = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM rr_systems) as total_systems,
        (SELECT COUNT(*) FROM rr_talkgroups) as total_talkgroups,
        (SELECT COUNT(*) FROM rr_sites) as total_sites,
        (SELECT COUNT(*) FROM rr_systems WHERE type ILIKE '%P25%' OR type ILIKE '%Project 25%') as p25_systems
    `);
    await client.end();

    const stats = result.rows[0];
    return res.status(200).json({
      stats: {
        totalSystems: parseInt(stats.total_systems) || 0,
        totalTalkgroups: parseInt(stats.total_talkgroups) || 0,
        totalSites: parseInt(stats.total_sites) || 0,
        p25Systems: parseInt(stats.p25_systems) || 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ error: 'Failed to fetch stats', message: error.message });
  }
}
