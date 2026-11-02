// Starts the world server from its config file, which is on the server and never in this repo. Run by systemd: see scripts/geodrive.service.
import { readFileSync } from 'node:fs';
import { startServer } from './app.mjs';

const CONFIG = process.env.GEODRIVE_CONFIG || '/etc/geodrive/config.json';
const config = JSON.parse(readFileSync(CONFIG, 'utf8'));

const server = await startServer({ dir: config.worlds, port: config.port, origins: config.origins });
console.log(`GeoDrive world server on port ${server.port}`);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    await server.close(); // everyone reconnects by themselves once it's back
    process.exit(0);
  });
}
