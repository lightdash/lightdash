import knex from 'knex';
import knexConfig from '../../knexfile';
import { formatReport, INVENTORY_NOTICE, parseArguments, run } from './cli';

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const database = knex(
        knexConfig[
            (process.env.NODE_ENV as 'production' | 'development') ||
                'production'
        ],
    );
    try {
        const report = await run(database, options);
        if (options.format === 'csv') console.error(INVENTORY_NOTICE);
        console.log(formatReport(report, options.format));
    } finally {
        await database.destroy();
    }
}

main().catch(() => {
    console.error(
        'Token inventory failed. Check the database connection and arguments: --before <ISO timestamp> [--organization <uuid>] [--format json|csv].',
    );
    process.exitCode = 1;
});
