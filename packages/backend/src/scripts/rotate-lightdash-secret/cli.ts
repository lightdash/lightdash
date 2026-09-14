import { CIPHERTEXT_REGISTRY } from './registry';
import {
    runSecretRotation,
    type RotationContext,
    type RotationOptions,
} from './rotation';

export const parseArguments = (argv: string[]): RotationOptions => {
    const options: RotationOptions = {
        execute: false,
        batchSize: 500,
        tables: null,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const argument = argv[i];
        switch (argument) {
            case '--execute':
                options.execute = true;
                break;
            case '--batch-size': {
                i += 1;
                const batchSize = Number(argv[i]);
                if (!Number.isInteger(batchSize) || batchSize < 1) {
                    throw new Error('--batch-size must be a positive integer');
                }
                options.batchSize = batchSize;
                break;
            }
            case '--table': {
                i += 1;
                const table = argv[i];
                if (
                    !table ||
                    !CIPHERTEXT_REGISTRY.some((entry) => entry.table === table)
                ) {
                    throw new Error(
                        `--table must be one of: ${[
                            ...new Set(
                                CIPHERTEXT_REGISTRY.map((entry) => entry.table),
                            ),
                        ].join(', ')}`,
                    );
                }
                options.tables = [...(options.tables ?? []), table];
                break;
            }
            default:
                throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return options;
};

/** Runs the rotation and prints the report; returns the process exit code. */
export async function runRotationCli(
    argv: string[],
    context: RotationContext,
    log: (line: string) => void = console.log,
): Promise<number> {
    const options = parseArguments(argv);
    const report = await runSecretRotation(context, options);

    log(`Mode: ${report.mode}`);
    log(`Configured fallbacks: ${context.lightdashSecrets.fallbacks.length}`);
    log('\nRegistered ciphertext:');
    report.ciphertext.forEach((result) => {
        if (!result.tablePresent) {
            log(`  ${result.table}.${result.column}: table absent`);
            return;
        }
        log(
            `  ${result.table}.${result.column}: scanned=${result.scanned} active=${result.active} fallback=${result.fallback} reEncrypted=${result.reEncrypted} concurrentSkips=${result.concurrentSkips} unreadable=${result.unreadablePrimaryKeys.length}`,
        );
        result.unreadablePrimaryKeys.forEach((primaryKey) => {
            log(
                `    unreadable ${result.table}.${result.column} at ${result.primaryKeyColumn}=${primaryKey}`,
            );
        });
    });

    const jobs = report.graphileJobs;
    log('\nQueued createProjectWithCompile jobs:');
    if (!jobs.schemaPresent) {
        log('  graphile_worker.jobs absent');
    } else {
        log(
            `  scanned=${jobs.scanned} active=${jobs.active} fallback=${jobs.fallback} reEncrypted=${jobs.reEncrypted} concurrentSkips=${jobs.concurrentSkips} unreadable=${jobs.unreadableJobIds.length}`,
        );
        jobs.unreadableJobIds.forEach((jobId) => {
            log(`    unreadable job id ${jobId}`);
        });
    }

    log('\nToken hashes:');
    report.tokenHashes.forEach((result) => {
        if (!result.tablePresent) {
            log(`  ${result.table}: table absent`);
            return;
        }
        log(
            `  ${result.table}: total=${result.total} active=${result.active} fallback=[${result.fallback.join(', ')}] legacySha256=${result.legacySha256} unknown=${result.unknown}`,
        );
    });

    if (report.blockers.length > 0) {
        log('\nOld-secret removal blockers:');
        report.blockers.forEach((blocker) => {
            log(`  - ${blocker}`);
        });
        log('\nDo NOT remove a fallback secret while blockers remain.');
    } else {
        log(
            '\nNo blockers found by this command. Verify the session-cookie, app-preview JWT, and signed download link waiting periods from the runbook before removing a fallback secret.',
        );
    }

    return report.hasUnreadableValues ? 1 : 0;
}
