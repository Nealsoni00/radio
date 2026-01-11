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
        id, system_id as "systemId", name, description, rfss,
        site_id as "siteId", county_id as "countyId",
        latitude, longitude, range_miles as "rangeMiles"
      FROM rr_sites
      WHERE system_id = $1
      ORDER BY name
    `, [systemId]);

    return res.status(200).json({ sites: result.rows });
  } catch (error: any) {
    console.error('Error fetching sites:', error);
    return res.status(500).json({ error: 'Failed to fetch sites', message: error.message });
  } finally {
    await client.end();
  }
}
