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

    const result = await client.query(`
      SELECT
        f.id, f.site_id as "siteId", f.system_id as "systemId",
        f.frequency, f.channel_type as "channelType", f.lcn,
        f.is_primary as "isPrimary",
        s.name as "siteName"
      FROM rr_frequencies f
      LEFT JOIN rr_sites s ON f.site_id = s.id
      WHERE f.system_id = $1
      ORDER BY f.frequency
    `, [systemId]);

    return res.status(200).json({ frequencies: result.rows });
  } catch (error: any) {
    console.error('Error fetching frequencies:', error);
    return res.status(500).json({ error: 'Failed to fetch frequencies', message: error.message });
  } finally {
    await client.end();
  }
}
