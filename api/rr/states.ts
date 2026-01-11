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
      SELECT id, name, abbreviation, country_id as "countryId"
      FROM rr_states
      ORDER BY name
    `);
    await client.end();
    return res.status(200).json({ states: result.rows });
  } catch (error: any) {
    console.error('Error fetching states:', error);
    return res.status(500).json({ error: 'Failed to fetch states', message: error.message });
  }
}
