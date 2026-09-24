import { validate as isUuid } from 'uuid';
import { type RescueWarehouseConnectionArgs } from './rescue';

const valueAfter = (argv: string[], index: number, flag: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
        throw new Error(`${flag} needs a value`);
    }
    return value;
};

export const parseRescueArguments = (
    argv: string[],
): RescueWarehouseConnectionArgs => {
    const parsed: Partial<RescueWarehouseConnectionArgs> = { execute: false };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        switch (flag) {
            case '--execute':
                parsed.execute = true;
                break;
            case '--project':
                parsed.projectUuid = valueAfter(argv, index, flag);
                index += 1;
                break;
            case '--connection':
                parsed.warehouseConnectionUuid = valueAfter(argv, index, flag);
                index += 1;
                break;
            case '--engineer':
                parsed.engineer = valueAfter(argv, index, flag);
                index += 1;
                break;
            case '--ticket':
                parsed.ticket = valueAfter(argv, index, flag);
                index += 1;
                break;
            default:
                throw new Error(`Unknown argument: ${flag}`);
        }
    }
    const {
        projectUuid,
        warehouseConnectionUuid,
        engineer,
        ticket,
        execute = false,
    } = parsed;
    if (!projectUuid || !isUuid(projectUuid)) {
        throw new Error('--project must be a project uuid');
    }
    if (!warehouseConnectionUuid || !isUuid(warehouseConnectionUuid)) {
        throw new Error('--connection must be a warehouse connection uuid');
    }
    if (!engineer || !ticket) {
        throw new Error('--engineer and --ticket are required');
    }
    return { projectUuid, warehouseConnectionUuid, engineer, ticket, execute };
};
