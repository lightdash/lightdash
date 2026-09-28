import {
    LEARN_TERMINAL_REJECTION,
    LEARN_TERMINAL_SUBCOMMANDS,
    validateDbtSelector,
    type LearnSandboxCommandRequest,
} from '@lightdash/common';
import path from 'node:path';

export { LEARN_TERMINAL_REJECTION };

// A generous cap: every real invocation needs at most a handful of flags.
// Anything past this is either a mistake or an attempt to exhaust the
// parser/argv, so it's rejected outright rather than parsed.
const MAX_ARGS = 16;

type Flag = 'select' | 'charts' | 'dashboards' | 'path';
// Keys are the shared LEARN_TERMINAL_SUBCOMMANDS; the test pins the two together.
const RULES: Record<'lightdash' | 'dbt', Record<string, Flag[]>> = {
    lightdash: {
        compile: ['select'],
        deploy: ['select'],
        validate: [],
        lint: [],
        download: ['charts', 'dashboards', 'path'],
        upload: ['charts', 'dashboards', 'path'],
    },
    // dbt parse takes no selector (dbt answers "No such option '--select'"),
    // so offering one would only trade our refusal for dbt's usage error.
    dbt: { parse: [], compile: ['select'], ls: ['select'] },
};
const reject = { ok: false as const, message: LEARN_TERMINAL_REJECTION };

// Plain object literals inherit `toString`/`constructor`/`__proto__` from
// Object.prototype, so a naive `RULES[request.tool]` or `tools[subcommand]`
// lookup returns a truthy (non-array) value for those names instead of
// `undefined` — bypassing the "is this tool/subcommand known" check
// entirely. Object.prototype.hasOwnProperty.call() only ever matches a key
// that was actually declared above. The explicit reject list below is
// belt-and-braces on top of that: even if RULES is ever restructured to a
// Map or a null-prototype object, these three names are never allowed
// through as a subcommand.
const hasOwn = (obj: object, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(obj, key);
const REJECTED_SUBCOMMANDS = new Set(['toString', 'constructor', '__proto__']);

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
    if (request.args.length > MAX_ARGS) return reject;
    if (REJECTED_SUBCOMMANDS.has(request.subcommand)) return reject;
    if (!hasOwn(RULES, request.tool)) return reject;
    const tools = RULES[request.tool as 'lightdash' | 'dbt'];
    if (!hasOwn(tools, request.subcommand)) return reject;
    const allowed = tools[request.subcommand];
    if (!allowed) return reject;
    const argv = [request.tool, request.subcommand];
    const args = [...request.args];
    while (args.length > 0) {
        const flag = args.shift() as string;
        if (flag === '--select' && allowed.includes('select')) {
            const value = args.shift();
            if (!value || value.startsWith('-') || !validateDbtSelector(value))
                return reject;
            argv.push(flag, value);
        } else if (
            (flag === '--charts' || flag === '--dashboards') &&
            allowed.includes(flag.slice(2) as Flag)
        ) {
            argv.push(flag);
        } else if (flag === '--path' && allowed.includes('path')) {
            const value = args.shift();
            if (
                !value ||
                value.startsWith('-') ||
                !insideWorkspace(workspaceDir, value)
            )
                return reject;
            argv.push(flag, value);
        } else {
            return reject;
        }
    }
    return { ok: true as const, argv };
};
