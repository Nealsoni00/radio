import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const pg = await import('pg');
    const { Client } = pg.default || pg;

    const connectionString = process.env.POSTGRES_URL || 'NOT_SET';
    const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/gi, '');

    // Just try to connect with SSL
    const client = new Client({
      connectionString: cleanConnectionString,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    await client.connect();

    // Test query similar to getStats
    const result = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM rr_systems) as total_systems,
        (SELECT COUNT(*) FROM rr_talkgroups) as total_talkgroups,
        (SELECT COUNT(*) FROM rr_sites) as total_sites,
        (SELECT COUNT(*) FROM rr_systems WHERE type ILIKE '%P25%') as p25_systems
    `);
    await client.end();

    return res.status(200).json({
      success: true,
      stats: result.rows[0],
      connectionStringSet: !!process.env.POSTGRES_URL,
      nodeVersion: process.version,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      connectionStringSet: !!process.env.POSTGRES_URL,
      nodeVersion: process.version,
    });
  }
}
