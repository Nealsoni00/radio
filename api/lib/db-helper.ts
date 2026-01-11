// Shared database helper for serverless functions
// Uses dynamic import to avoid bundling issues

export async function getClient(): Promise<any> {
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

export async function query(text: string, params?: any[]): Promise<any> {
  const client = await getClient();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}
