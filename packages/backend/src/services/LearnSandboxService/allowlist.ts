import {
    validateDbtSelector,
    type LearnSandboxCommandRequest,
} from '@lightdash/common';
import path from 'node:path';

export const LEARN_TERMINAL_REJECTION =
    'That command is not available in the Learn terminal';

type Flag = 'select' | 'charts' | 'dashboards' | 'path';
const RULES: Record<'lightdash' | 'dbt', Record<string, Flag[]>> = {
    lightdash: {
        compile: ['select'],
        deploy: ['select'],
        validate: [],
        lint: [],
        download: ['charts', 'dashboards', 'path'],
        upload: ['charts', 'dashboards', 'path'],
    },
    dbt: { parse: ['select'], compile: ['select'], ls: ['select'] },
};
const reject = { ok: false as const, message: LEARN_TERMINAL_REJECTION };

const insideWorkspace = (workspaceDir: string, relative: string): boolean => {
    if (path.isAbsolute(relative)) return false;
    const resolved = path.resolve(workspaceDir, relative);
    return (
        resolved === workspaceDir ||
        resolved.startsWith(`${workspaceDir}${path.sep}`)
    );
};

export const buildArgv = (
    request: LearnSandboxCommandRequest,
    workspaceDir: string,
) => {
    const tools = RULES[request.tool as 'lightdash' | 'dbt'];
    if (!tools) return reject;
    const allowed = tools[request.subcommand];
    if (!allowed) return reject;
    const argv = [request.tool, request.subcommand];
    const args = [...request.args];
    while (args.length > 0) {
        const flag = args.shift() as string;
        if (flag === '--select' && allowed.includes('select')) {
            const value = args.shift();
            if (!value || !validateDbtSelector(value)) return reject;
            argv.push(flag, value);
        } else if (
            (flag === '--charts' || flag === '--dashboards') &&
            allowed.includes(flag.slice(2) as Flag)
        ) {
            argv.push(flag);
        } else if (flag === '--path' && allowed.includes('path')) {
            const value = args.shift();
            if (!value || !insideWorkspace(workspaceDir, value)) return reject;
            argv.push(flag, value);
        } else {
            return reject;
        }
    }
    return { ok: true as const, argv };
};
