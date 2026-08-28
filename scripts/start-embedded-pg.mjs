/**
 * Starts a local embedded PostgreSQL matching .env defaults
 * (zenith / zenith @ localhost:5432 / zenith_hr).
 * Keep this process running while developing.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(root, '..', 'data', 'pg');

mkdirSync(databaseDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'zenith',
  password: 'zenith',
  port: 5432,
  persistent: true,
});

async function main() {
  try {
    await pg.initialise();
    console.log('Postgres cluster initialised at', databaseDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('Using existing Postgres data directory (or initialise note):', message);
  }

  await pg.start();
  console.log('Postgres listening on localhost:5432 (user=zenith)');

  try {
    await pg.createDatabase('zenith_hr');
    console.log('Created database zenith_hr');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already exists/i.test(message)) {
      console.log('Database zenith_hr already exists');
    } else {
      console.warn('createDatabase:', message);
    }
  }

  console.log('Ready. Leave this process running. Ctrl+C to stop.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
