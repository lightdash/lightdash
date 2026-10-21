import knex from 'knex';
import path from 'node:path';
import config from '../../knexfile';

async function main() {
    const database = knex(config.development);
    const result = await database.migrate.latest({
        directory: [
            path.resolve(__dirname, '../../database/migrations'),
            path.resolve(__dirname, '../../ee/database/migrations'),
        ],
        loadExtensions: ['.ts'],
    });
    console.log(`Migrated ${result[1].length} migrations`);
    await database.destroy();
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
