import knex from 'knex';
import { lightdashConfig } from '../../config/lightdashConfig';
import knexConfig from '../../knexfile';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { runConnectionNameBackfillCli } from './cli';

async function main() {
    const database = knex(
        knexConfig[
            (process.env.NODE_ENV as 'production' | 'development') ||
                'production'
        ],
    );
    try {
        await runConnectionNameBackfillCli(process.argv.slice(2), {
            database,
            encryptionUtil: new EncryptionUtil({ lightdashConfig }),
        });
    } finally {
        await database.destroy();
    }
}

main().catch((error: unknown) => {
    const name = error instanceof Error ? error.name : typeof error;
    const code =
        error && typeof error === 'object' && 'code' in error
            ? `, code ${String((error as { code: unknown }).code)}`
            : '';
    console.error(`Connection name backfill failed: ${name}${code}`);
    process.exit(1);
});
