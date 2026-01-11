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
    // Get counts by state
    const stateCountsResult = await client.query(`
      SELECT state_id, COUNT(*) as count
      FROM rr_systems
      WHERE state_id IS NOT NULL
      GROUP BY state_id
    `);

    // Get counts by county
    const countyCountsResult = await client.query(`
      SELECT county_id, COUNT(*) as count
      FROM rr_systems
      WHERE county_id IS NOT NULL
      GROUP BY county_id
    `);

    // Convert to objects
    const byState: Record<number, number> = {};
    for (const row of stateCountsResult.rows) {
      byState[row.state_id] = parseInt(row.count);
    }

    const byCounty: Record<number, number> = {};
    for (const row of countyCountsResult.rows) {
      byCounty[row.county_id] = parseInt(row.count);
    }

    return res.status(200).json({ byState, byCounty });
  } catch (error: any) {
    console.error('Error fetching geography counts:', error);
    return res.status(500).json({ error: 'Failed to fetch geography counts', message: error.message });
  } finally {
    await client.end();
  }
}
