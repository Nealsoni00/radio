import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const pg = await import('pg');
    const { Client } = pg.default || pg;

    const connectionString = process.env.POSTGRES_URL || 'NOT_SET';
    const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/gi, '');

    // Just try to connect
    const client = new Client({
      connectionString: cleanConnectionString,
      ssl: false,
    });

    await client.connect();
    const result = await client.query('SELECT NOW() as time');
    await client.end();

    return res.status(200).json({
      success: true,
      time: result.rows[0].time,
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
