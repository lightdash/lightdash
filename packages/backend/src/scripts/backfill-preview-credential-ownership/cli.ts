import {
    backfillPreviewCredentialOwnership,
    type BackfillContext,
    type BackfillOptions,
} from './backfill';

export const parseArguments = (argv: string[]): BackfillOptions => {
    const options: BackfillOptions = { execute: false, batchSize: 500 };
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
            default:
                throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return options;
};

/** Runs the backfill and prints counts only; returns the process exit code. */
export async function runBackfillCli(
    argv: string[],
    context: BackfillContext,
    log: (line: string) => void = console.log,
): Promise<number> {
    const report = await backfillPreviewCredentialOwnership(
        context,
        parseArguments(argv),
    );
    log(`Mode: ${report.mode}`);
    log(
        `BigQuery previews without recorded ownership: scanned=${report.scanned} copies=${report.copies} owned=${report.owned} notBigquerySso=${report.notBigquerySso} unreadable=${report.unreadable}`,
    );
    if (report.mode === 'execute') {
        log(
            `Written: updated=${report.updated} concurrentSkips=${report.concurrentSkips}`,
        );
    } else {
        log('Dry run: nothing written. Run again with --execute to write.');
    }
    return report.unreadable > 0 ? 1 : 0;
}
