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

type Flag = 'select' | 'charts' | 'dashboards' | 'path' | 'name' | 'force';
// Keys are the shared LEARN_TERMINAL_SUBCOMMANDS; the test pins the two together.
const RULES: Record<'lightdash' | 'dbt', Record<string, Flag[]>> = {
    lightdash: {
        compile: ['select'],
        deploy: ['select'],
        // --name is required, as the CLI requires it, and then set aside:
        // the learner's training copy is already a preview project, and it
        // is the only one a trainee may update (see toSpawnArgv).
        'start-preview': ['select', 'name'],
        validate: [],
        lint: [],
        download: ['charts', 'dashboards', 'path'],
        // --force: each sandbox command rebuilds its files, so the CLI's
        // timestamp-based change detection cannot tell an edit from a copy.
        upload: ['charts', 'dashboards', 'path', 'force'],
    },
    // dbt parse takes no selector (dbt answers "No such option '--select'"),
    // so offering one would only trade our refusal for dbt's usage error.
    dbt: { parse: [], compile: ['select'], ls: ['select'] },
};
const reject = { ok: false as const, message: LEARN_TERMINAL_REJECTION };

// A preview's name, in the shapes the docs' examples use ("PR: Add Revenue
// Metric", "ecom-shop-analytics"). It is printed back and never reaches a
// process.
const PREVIEW_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._:-]{0,63}$/;
/** The CLI's own words for a start-preview without a name, plus a way out. */
export const PREVIEW_NAME_REQUIRED =
    '--name argument is required, for example: lightdash start-preview --name my-preview';

// `--charts`/`--dashboards` (and `-c`/`-d`) take one or more content slugs,
// as the CLI does. A slug is lowercase words joined by hyphens, so no value
// can be a path, a flag or a shell word.
const SLUG_FLAGS: Record<string, Flag> = {
    '--charts': 'charts',
    '-c': 'charts',
    '--dashboards': 'dashboards',
    '-d': 'dashboards',
};
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUGS = 8;
const MAX_SLUG_LENGTH = 255;
/**
 * Said when a slug flag is given something else: the CLI also takes ids and
 * URLs there, and a learner who pastes one should hear what works here.
 */
export const SLUGS_REQUIRED =
    '--charts and --dashboards take one to eight slugs here (lowercase words joined by hyphens), each flag once, for example: --charts revenue-by-payment-method';
const rejectSlugs = { ok: false as const, message: SLUGS_REQUIRED };

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
    const slugKinds = new Set<Flag>();
    while (args.length > 0) {
        const flag = args.shift() as string;
        if (flag === '--select' && allowed.includes('select')) {
            const value = args.shift();
            if (!value || value.startsWith('-') || !validateDbtSelector(value))
                return reject;
            argv.push(flag, value);
        } else if (
            hasOwn(SLUG_FLAGS, flag) &&
            allowed.includes(SLUG_FLAGS[flag])
        ) {
            const slugs: string[] = [];
            while (args.length > 0 && !args[0].startsWith('-')) {
                slugs.push(args.shift() as string);
            }
            // Once per kind: the CLI adds a repeated flag's values together,
            // which would carry more than the eight a flag may name.
            const kind = SLUG_FLAGS[flag];
            if (
                slugKinds.has(kind) ||
                slugs.length === 0 ||
                slugs.length > MAX_SLUGS ||
                !slugs.every(
                    (slug) => slug.length <= MAX_SLUG_LENGTH && SLUG.test(slug),
                )
            )
                return rejectSlugs;
            slugKinds.add(kind);
            argv.push(flag, ...slugs);
        } else if (flag === '--force' && allowed.includes('force')) {
            argv.push(flag);
        } else if (flag === '--name' && allowed.includes('name')) {
            const value = args.shift();
            if (!value || !PREVIEW_NAME.test(value) || argv.includes('--name'))
                return reject;
            argv.push(flag, value);
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
    if (allowed.includes('name') && !argv.includes('--name')) {
        return { ok: false as const, message: PREVIEW_NAME_REQUIRED };
    }
    return { ok: true as const, argv };
};

/** The name a stored `start-preview` was given. */
export const previewName = (argv: string[]): string | undefined => {
    const at = argv.indexOf('--name');
    return at === -1 ? undefined : argv[at + 1];
};

/**
 * What actually runs for a stored argv. The training copy is itself a
 * preview project, so `start-preview --name <name>` updates it with a deploy
 * rather than creating a project of that name: trainees cannot create
 * projects, and a new preview per run would leave orphans. The name is set
 * aside (deploy takes none); the row keeps what the learner typed.
 */
export const toSpawnArgv = (argv: string[]): string[] => {
    if (argv[0] !== 'lightdash' || argv[1] !== 'start-preview') return argv;
    const flags = argv.slice(2);
    const name = flags.indexOf('--name');
    if (name !== -1) flags.splice(name, 2);
    return ['lightdash', 'deploy', ...flags];
};
