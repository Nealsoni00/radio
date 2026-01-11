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
    const state = req.query.state ? parseInt(req.query.state as string) : undefined;
    const county = req.query.county ? parseInt(req.query.county as string) : undefined;
    const type = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    let queryStr = `
      SELECT
        s.id, s.name, s.type, s.flavor, s.voice, s.system_id as "systemId",
        s.wacn, s.nac, s.rfss, s.state_id as "stateId", s.county_id as "countyId",
        s.city, s.description, s.is_active as "isActive",
        st.name as "stateName", st.abbreviation as "stateAbbrev",
        c.name as "countyName",
        (SELECT COUNT(*) FROM rr_talkgroups WHERE system_id = s.id) as "talkgroupCount",
        (SELECT COUNT(*) FROM rr_sites WHERE system_id = s.id) as "siteCount"
      FROM rr_systems s
      LEFT JOIN rr_states st ON s.state_id = st.id
      LEFT JOIN rr_counties c ON s.county_id = c.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (state) {
      queryStr += ` AND s.state_id = $${paramIndex++}`;
      params.push(state);
    }
    if (county) {
      queryStr += ` AND s.county_id = $${paramIndex++}`;
      params.push(county);
    }
    if (type) {
      queryStr += ` AND s.type ILIKE $${paramIndex++}`;
      params.push(`%${type}%`);
    }
    if (search) {
      queryStr += ` AND (s.name ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    queryStr += ` ORDER BY s.name LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    // Count query
    let countQueryStr = `
      SELECT COUNT(*) as total
      FROM rr_systems s
      WHERE 1=1
    `;
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (state) {
      countQueryStr += ` AND s.state_id = $${countParamIndex++}`;
      countParams.push(state);
    }
    if (county) {
      countQueryStr += ` AND s.county_id = $${countParamIndex++}`;
      countParams.push(county);
    }
    if (type) {
      countQueryStr += ` AND s.type ILIKE $${countParamIndex++}`;
      countParams.push(`%${type}%`);
    }
    if (search) {
      countQueryStr += ` AND (s.name ILIKE $${countParamIndex} OR s.description ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }

    const result = await client.query(queryStr, params);
    const countResult = await client.query(countQueryStr, countParams);

    return res.status(200).json({
      systems: result.rows,
      total: parseInt(countResult.rows[0].total),
    });
  } catch (error: any) {
    console.error('Error fetching systems:', error);
    return res.status(500).json({ error: 'Failed to fetch systems', message: error.message });
  } finally {
    await client.end();
  }
}
