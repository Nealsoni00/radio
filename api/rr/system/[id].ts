import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getClient } from '../../lib/db-helper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await getClient();

  try {
    const id = parseInt(req.query.id as string);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid system ID' });
    }

    // Get system details
    const systemResult = await client.query(`
      SELECT
        s.id, s.name, s.type, s.flavor, s.voice, s.system_id as "systemId",
        s.wacn, s.nac, s.rfss, s.state_id as "stateId", s.county_id as "countyId",
        s.city, s.description, s.is_active as "isActive",
        st.name as "stateName", st.abbreviation as "stateAbbrev",
        c.name as "countyName"
      FROM rr_systems s
      LEFT JOIN rr_states st ON s.state_id = st.id
      LEFT JOIN rr_counties c ON s.county_id = c.id
      WHERE s.id = $1
    `, [id]);

    if (systemResult.rows.length === 0) {
      return res.status(404).json({ error: 'System not found' });
    }

    // Get sites
    const sitesResult = await client.query(`
      SELECT
        id, system_id as "systemId", name, description, rfss,
        site_id as "siteId", county_id as "countyId",
        latitude, longitude, range_miles as "rangeMiles"
      FROM rr_sites
      WHERE system_id = $1
      ORDER BY name
    `, [id]);

    // Get frequencies
    const frequenciesResult = await client.query(`
      SELECT
        f.id, f.site_id as "siteId", f.system_id as "systemId",
        f.frequency, f.channel_type as "channelType", f.lcn,
        f.is_primary as "isPrimary",
        s.name as "siteName"
      FROM rr_frequencies f
      LEFT JOIN rr_sites s ON f.site_id = s.id
      WHERE f.system_id = $1
      ORDER BY f.frequency
    `, [id]);

    // Get talkgroups
    const talkgroupsResult = await client.query(`
      SELECT
        id, system_id as "systemId", talkgroup_id as "talkgroupId",
        alpha_tag as "alphaTag", description, mode, category, tag
      FROM rr_talkgroups
      WHERE system_id = $1
      ORDER BY talkgroup_id
      LIMIT 1000
    `, [id]);

    const talkgroupCountResult = await client.query(`
      SELECT COUNT(*) as total
      FROM rr_talkgroups
      WHERE system_id = $1
    `, [id]);

    return res.status(200).json({
      system: systemResult.rows[0],
      sites: sitesResult.rows,
      frequencies: frequenciesResult.rows,
      talkgroups: talkgroupsResult.rows,
      talkgroupCount: parseInt(talkgroupCountResult.rows[0].total),
    });
  } catch (error: any) {
    console.error('Error fetching system:', error);
    return res.status(500).json({ error: 'Failed to fetch system', message: error.message });
  } finally {
    await client.end();
  }
}
