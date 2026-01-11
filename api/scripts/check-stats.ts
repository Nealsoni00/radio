import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    const states = await client.query('SELECT COUNT(*) as count FROM rr_states');
    const counties = await client.query('SELECT COUNT(*) as count FROM rr_counties');
    const systems = await client.query('SELECT COUNT(*) as count FROM rr_systems');
    const sites = await client.query('SELECT COUNT(*) as count FROM rr_sites');
    const talkgroups = await client.query('SELECT COUNT(*) as count FROM rr_talkgroups');

    console.log('Database Stats:');
    console.log('States:', states.rows[0].count);
    console.log('Counties:', counties.rows[0].count);
    console.log('Systems:', systems.rows[0].count);
    console.log('Sites:', sites.rows[0].count);
    console.log('Talkgroups:', talkgroups.rows[0].count);

    // Sample systems
    const sampleSystems = await client.query(`
      SELECT s.id, s.name, s.type, s.wacn, s.system_id, st.name as state_name
      FROM rr_systems s
      LEFT JOIN rr_states st ON s.state_id = st.id
      ORDER BY s.id
      LIMIT 10
    `);
    console.log('\nSample Systems:');
    sampleSystems.rows.forEach(s => {
      console.log(`  ${s.id}: ${s.name} (${s.state_name}) - ${s.type}`);
    });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
