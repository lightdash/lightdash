import knex from 'knex';
import knexConfig from '../../knexfile';
import { parseRescueArguments } from './cli';
import { rescueWarehouseConnection } from './rescue';

async function main() {
    const args = parseRescueArguments(process.argv.slice(2));
    const database = knex(
        knexConfig[
            (process.env.NODE_ENV as 'production' | 'development') ||
                'production'
        ],
    );
    try {
        const report = await rescueWarehouseConnection(database, args);
        console.info(JSON.stringify(report, null, 2));
    } finally {
        await database.destroy();
    }
}

main().catch((error: unknown) => {
    console.error(
        `Rescue failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
});
