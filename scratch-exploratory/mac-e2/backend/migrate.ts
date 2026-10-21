import knex from 'knex';
import path from 'node:path';
import config from '../src/knexfile';
import {runMigrations} from 'graphile-worker';
const db = knex(config.development);
async function main() {
 const result = await db.migrate.latest({directory:[path.resolve('src/database/migrations'),path.resolve('src/ee/database/migrations')]});
 console.log('Migrations applied', result[1].length);
 await runMigrations({connectionString:process.env.PGCONNECTIONURI});
 await db.destroy();
}
main().catch(e=>{console.error(e.message);process.exit(1)});
