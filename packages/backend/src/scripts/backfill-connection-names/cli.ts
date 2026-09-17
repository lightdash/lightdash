import { type Knex } from 'knex';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    createConnectionNameBackfillDatabase,
    runConnectionNameBackfill,
    type ConnectionNameBackfillOptions,
} from './backfill';

export const parseArguments = (
    argv: string[],
): ConnectionNameBackfillOptions => {
    const options: ConnectionNameBackfillOptions = {
        dryRun: false,
        fromId: 0,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const argument = argv[i];
        switch (argument) {
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--from-id': {
                i += 1;
                const fromId = Number(argv[i]);
                if (!Number.isInteger(fromId) || fromId < 0) {
                    throw new Error('--from-id must be a non-negative integer');
                }
                options.fromId = fromId;
                break;
            }
            default:
                throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return options;
};

export const runConnectionNameBackfillCli = async (
    argv: string[],
    context: {
        database: Knex;
        encryptionUtil: Pick<EncryptionUtil, 'decrypt'>;
    },
    log: (line: string) => void = console.log,
): Promise<void> => {
    const options = parseArguments(argv);
    const report = await runConnectionNameBackfill(
        createConnectionNameBackfillDatabase(context.database),
        context.encryptionUtil,
        options,
        log,
    );
    const skipped = Object.values(report.skipped).reduce(
        (total, count) => total + count,
        0,
    );
    log(
        `Summary: mode=${report.mode} processed=${report.processed} renamed=${report.renamed} skipped=${skipped}`,
    );
    log(
        `Skipped: ${Object.entries(report.skipped)
            .map(([reason, count]) => `${reason}=${count}`)
            .join(' ')}`,
    );
};
