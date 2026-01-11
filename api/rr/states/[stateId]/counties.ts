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
    const stateId = parseInt(req.query.stateId as string);
    if (isNaN(stateId)) {
      return res.status(400).json({ error: 'Invalid state ID' });
    }

    const client = await getClient();
    const result = await client.query(`
      SELECT id, name, state_id as "stateId", fips_code as "fipsCode"
      FROM rr_counties
      WHERE state_id = $1
      ORDER BY name
    `, [stateId]);
    await client.end();

    return res.status(200).json({ counties: result.rows });
  } catch (error: any) {
    console.error('Error fetching counties:', error);
    return res.status(500).json({ error: 'Failed to fetch counties', message: error.message });
  }
}
