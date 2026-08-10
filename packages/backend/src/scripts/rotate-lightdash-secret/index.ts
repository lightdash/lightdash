/**
 * Migrates LIGHTDASH_SECRET-derived state toward the active secret during a
 * secret rotation, and reports every blocker that must clear before an old
 * fallback secret can be removed.
 *
 * Dry-run by default: reports without modifying anything. With --execute,
 * re-encrypts fallback-encrypted ciphertext (registered tables and queued
 * createProjectWithCompile jobs) with the active secret using
 * compare-and-swap updates. Never deletes unreadable values and never
 * revokes credentials.
 *
 * Usage:
 *   pnpm -F backend rotate-lightdash-secret [--execute]
 *       [--batch-size 500] [--table <registry-table>]
 */
import knex from 'knex';
import { lightdashConfig } from '../../config/lightdashConfig';
import knexConfig from '../../knexfile';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { runRotationCli } from './cli';

async function main() {
    const database = knex(
        knexConfig[
            (process.env.NODE_ENV as 'production' | 'development') ||
                'production'
        ],
    );
    try {
        process.exitCode = await runRotationCli(process.argv.slice(2), {
            database,
            encryptionUtil: new EncryptionUtil({ lightdashConfig }),
            lightdashSecrets: lightdashConfig.lightdashSecrets,
        });
    } finally {
        await database.destroy();
    }
}

main().catch((error: unknown) => {
    // Deliberately not the full message: driver errors can embed SQL and
    // bindings, including token hashes and ciphertext
    const name = error instanceof Error ? error.name : typeof error;
    const code =
        error && typeof error === 'object' && 'code' in error
            ? `, code ${String((error as { code: unknown }).code)}`
            : '';
    console.error(`Secret rotation command failed: ${name}${code}`);
    process.exit(1);
});
