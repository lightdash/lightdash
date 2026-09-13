import { access, constants } from 'node:fs/promises';
import path from 'node:path';

export const LEARN_SANDBOX_COMMAND_TIMEOUT_MS = 120_000;

const DEFAULT_PATH_PREFIX = ['/usr/local/dbt1.12/bin'];
const RUNTIME_DETECTION_CACHE_MS = 60_000;

export type LearnSandboxRuntime = {
    pathPrefix: string[];
    apiUrl: string | undefined;
    databasePath: string;
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

let cache:
    | { at: number; result: Promise<{ lightdash: boolean; dbt: boolean }> }
    | undefined;

export const detectSandboxRuntime = (
    env: NodeJS.ProcessEnv = process.env,
): Promise<{ lightdash: boolean; dbt: boolean }> => {
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
    ]).then(([lightdash, dbt]) => ({ lightdash, dbt }));
    cache = { at: now, result };
    return result;
};

export const resetSandboxRuntimeCache = (): void => {
    cache = undefined;
};
