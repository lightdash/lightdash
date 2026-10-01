/**
 * Dry-run by default; prints counts only.
 * Usage: pnpm -F backend backfill-preview-credential-ownership [--execute] [--batch-size 500]
 */
import knex from 'knex';
import { lightdashConfig } from '../../config/lightdashConfig';
import knexConfig from '../../knexfile';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { runBackfillCli } from './cli';

async function main() {
    const database = knex(
        knexConfig[
            (process.env.NODE_ENV as 'production' | 'development') ||
                'production'
        ],
    );
    try {
        process.exitCode = await runBackfillCli(process.argv.slice(2), {
            database,
            encryptionUtil: new EncryptionUtil({ lightdashConfig }),
        });
    } finally {
        await database.destroy();
    }
}

main().catch((error: unknown) => {
    const name = error instanceof Error ? error.name : typeof error;
    console.error(`Preview credential ownership backfill failed: ${name}`);
    process.exit(1);
});
