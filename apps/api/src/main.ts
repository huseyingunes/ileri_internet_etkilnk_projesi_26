import './instrument.js';
import { createApp } from './app.factory.js';
import { armShutdownDeadline } from './common/shutdown.js';
import { loadEnv } from './config/env.js';

const env = loadEnv(process.env);
const app = await createApp(env);

armShutdownDeadline(env, () => {
  process.stderr.write('Graceful shutdown timed out; exiting.\n');
  process.exit(1);
});

await app.listen(env.API_PORT, '0.0.0.0');
