import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeDatabase } from './lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST for security
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for secret key (set in environment)
  const secret = req.headers['x-init-secret'] || req.query.secret;
  if (secret !== process.env.INIT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await initializeDatabase();
    return res.status(200).json({ message: 'Database initialized successfully' });
  } catch (error) {
    console.error('Error initializing database:', error);
    return res.status(500).json({ error: 'Failed to initialize database', details: String(error) });
  }
}
