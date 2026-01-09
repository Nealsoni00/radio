import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
  },

  trunkRecorder: {
    statusUrl: process.env.TR_STATUS_URL || 'ws://127.0.0.1:3001',
    audioPort: parseInt(process.env.TR_AUDIO_PORT || '9000', 10),
    audioDir: process.env.TR_AUDIO_DIR || join(__dirname, '../../../trunk-recorder/audio'),
  },

  database: {
    path: process.env.DB_PATH || join(__dirname, '../../data/radio.db'),
  },

  audio: {
    sampleRate: 8000,
    channels: 1,
    bitDepth: 16,
  },

  radioReference: {
    username: process.env.RR_USERNAME || '',
    password: process.env.RR_PASSWORD || '',
    apiKey: process.env.RR_API_KEY || '',
    wsdlUrl: 'http://api.radioreference.com/soap2/?wsdl&v=15&s=rpc',
    syncDelayMs: parseInt(process.env.RR_SYNC_DELAY_MS || '500', 10),
    syncBatchSize: parseInt(process.env.RR_SYNC_BATCH_SIZE || '10', 10),
  },
};
