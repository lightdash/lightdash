import { access, constants } from 'node:fs/promises';
import path from 'node:path';

export const LEARN_SANDBOX_COMMAND_TIMEOUT_MS = 120_000;
/**
 * Per-request deadline handed to the CLI (LIGHTDASH_API_TIMEOUT_MS). A stalled
 * API then fails one request with a clear message instead of pinning the
 * command until the 120 s kill; CS-306.
 */
export const LEARN_SANDBOX_API_TIMEOUT_MS = 30_000;

const DEFAULT_PATH_PREFIX = ['/usr/local/dbt1.12/bin'];
const RUNTIME_DETECTION_CACHE_MS = 60_000;

/**
 * Sandbox commands run on the scheduler worker as dbt child processes, so the
 * number that may run at once is bounded. graphile-worker runs the jobs of one
 * queue serially, so commands are spread over this many queues by project:
 * at most this many dbt processes per worker, and one per project.
 */
export const DEFAULT_MAX_CONCURRENT_COMMANDS = 4;

export type LearnSandboxRuntime = {
    pathPrefix: string[];
    apiUrl: string | undefined;
    databasePath: string;
    maxConcurrentCommands: number;
};

const parseMaxConcurrent = (raw: string | undefined): number => {
    const value = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(value) && value >= 1
        ? value
        : DEFAULT_MAX_CONCURRENT_COMMANDS;
};

/** Deterministic queue name for a project: `learn-sandbox-<0..max-1>`. */
export const learnSandboxQueueName = (
    projectUuid: string,
    maxConcurrent: number,
): string => {
    const buckets = Math.max(1, Math.floor(maxConcurrent));
    let hash = 0;
    for (const char of projectUuid) {
        hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
    }
    return `learn-sandbox-${hash % buckets}`;
};

export const resolveSandboxRuntime = (
    env: NodeJS.ProcessEnv = process.env,
): LearnSandboxRuntime => {
    const pathPrefix = env.LEARN_SANDBOX_PATH_PREFIX
        ? env.LEARN_SANDBOX_PATH_PREFIX.split(':').filter(Boolean)
        : DEFAULT_PATH_PREFIX;
    const dataDir =
        env.PLAYGROUND_DATA_DIR ??
        path.resolve(__dirname, '../../../assets/playground');
    return {
        pathPrefix,
        apiUrl: env.LEARN_SANDBOX_API_URL,
        databasePath: path.join(dataDir, 'jaffle_shop.duckdb'),
        maxConcurrentCommands: parseMaxConcurrent(
            env.LEARN_SANDBOX_MAX_CONCURRENT_COMMANDS,
        ),
    };
};

const isExecutableIn = async (dir: string, bin: string): Promise<boolean> => {
    try {
        await access(path.join(dir, bin), constants.X_OK);
        return true;
    } catch {
        return false;
    }
};

const findExecutable = async (
    bin: string,
    dirs: string[],
): Promise<boolean> => {
    // eslint-disable-next-line no-restricted-syntax
    for (const dir of dirs) {
        // eslint-disable-next-line no-await-in-loop
        if (await isExecutableIn(dir, bin)) {
            return true;
        }
    }
    return false;
};

type SandboxRuntimeDetection = {
    lightdash: boolean;
    dbt: boolean;
    node: boolean;
};

let cache: { at: number; result: Promise<SandboxRuntimeDetection> } | undefined;

export const detectSandboxRuntime = (
    env: NodeJS.ProcessEnv = process.env,
): Promise<SandboxRuntimeDetection> => {
    const now = Date.now();
    if (cache && now - cache.at < RUNTIME_DETECTION_CACHE_MS) {
        return cache.result;
    }
    const { pathPrefix } = resolveSandboxRuntime(env);
    const pathDirs = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
    const dirs = [...pathPrefix, ...pathDirs];
    const result = Promise.all([
        findExecutable('lightdash', dirs),
        findExecutable('dbt', dirs),
        findExecutable('node', dirs),
    ]).then(([lightdash, dbt, node]) => ({ lightdash, dbt, node }));
    cache = { at: now, result };
    return result;
};

export const resetSandboxRuntimeCache = (): void => {
    cache = undefined;
};

// Explicit allowlist only. Do NOT swap this for a subtractive approach (e.g.
// copying most of process.env and stripping known-bad keys): the host
// container's environment can carry cloud credentials
// (AWS_*/GOOGLE_APPLICATION_CREDENTIALS/AZURE_*/IDENTITY_HEADER/...) that a
// learner's dbt YAML can read back out with env_var(), and a deny-list is
// one forgotten key away from leaking them into the sandbox.
const ALLOWED_SANDBOX_ENV_KEYS = [
    'PATH',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'TZ',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'no_proxy',
    'NODE_EXTRA_CA_CERTS',
    'SSL_CERT_FILE',
    'REQUESTS_CA_BUNDLE',
];

export type BuildSandboxEnvironmentArgs = {
    processEnvironment: NodeJS.ProcessEnv;
    pathPrefix: string[];
    apiUrl: string | undefined;
    siteUrl: string;
    projectUuid: string;
    apiKey: string;
    workspaceDir: string;
    projectDir: string;
    databasePath: string;
};

export const buildSandboxEnvironment = (
    args: BuildSandboxEnvironmentArgs,
): Record<string, string> => {
    const inherited = ALLOWED_SANDBOX_ENV_KEYS.reduce<Record<string, string>>(
        (acc, key) => {
            const value = args.processEnvironment[key];
            return value === undefined ? acc : { ...acc, [key]: value };
        },
        {},
    );
    return {
        ...inherited,
        PATH: [...args.pathPrefix, inherited.PATH ?? '']
            .filter(Boolean)
            .join(':'),
        LIGHTDASH_URL: args.apiUrl ?? args.siteUrl,
        LIGHTDASH_PROJECT: args.projectUuid,
        LIGHTDASH_API_KEY: args.apiKey,
        // The CLI only accepts a local .duckdb profile when the file sits
        // directly inside PLAYGROUND_DATA_DIR, and it reads that from its own
        // environment. Set it from the resolved runtime rather than
        // allowlisting the host key, so the child is told the one directory
        // the server actually materialised the profile against.
        PLAYGROUND_DATA_DIR: path.dirname(args.databasePath),
        DBT_PROFILES_DIR: args.workspaceDir,
        DBT_PROJECT_DIR: args.projectDir,
        DBT_TARGET_PATH: path.join(args.workspaceDir, 'target'),
        HOME: args.workspaceDir,
        DBT_PARTIAL_PARSE: 'false',
        DBT_SEND_ANONYMOUS_USAGE_STATS: 'false',
        CI: 'true',
        LIGHTDASH_API_TIMEOUT_MS: String(LEARN_SANDBOX_API_TIMEOUT_MS),
    };
};
