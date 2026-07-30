import { AuthorizationError, type DataAppManifest } from '@lightdash/common';
import { randomBytes } from 'crypto';
import execa from 'execa';
import { promises as fs } from 'fs';
import * as path from 'path';
import { getConfig } from '../../config';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { checkLightdashVersion } from '../dbt/apiClient';
import { getAuthHeader } from '../utils';
import { readManifestFromDir } from './appCodeFiles';
import { startPreviewProxy } from './previewProxy';

/**
 * Environment passed to the `npm run dev` child process. Only the small set of
 * host variables needed to launch a portable child process is inherited. In
 * particular, no Lightdash credential or unrelated parent-process secret is
 * copied into vite. The nonce is exposed to browser code as a run-scoped,
 * project- and route-limited capability; it is not a Lightdash credential.
 */
export const buildPreviewChildEnv = (args: {
    serverUrl: string;
    projectUuid: string;
    proxyPort: number;
    proxyNonce: string;
    parentEnv?: NodeJS.ProcessEnv;
}): Record<string, string> => {
    const parentEnv = args.parentEnv ?? process.env;
    const passthroughKeys = [
        'APPDATA',
        'CI',
        'COLORTERM',
        'COMSPEC',
        'ComSpec',
        'FORCE_COLOR',
        'HOME',
        'LANG',
        'LC_ALL',
        'LOCALAPPDATA',
        'NODE_OPTIONS',
        'NODE_PATH',
        'NO_COLOR',
        'PATH',
        'PATHEXT',
        'PNPM_HOME',
        'SHELL',
        'SYSTEMROOT',
        'SystemRoot',
        'TEMP',
        'TERM',
        'TMP',
        'TMPDIR',
        'USERPROFILE',
        'WINDIR',
    ] as const;
    const childEnv: Record<string, string> = {};
    for (const key of passthroughKeys) {
        const value = parentEnv[key];
        if (value !== undefined) childEnv[key] = value;
    }

    return {
        ...childEnv,
        VITE_LIGHTDASH_URL: args.serverUrl.replace(/\/+$/, ''),
        VITE_LIGHTDASH_API_KEY: args.proxyNonce,
        VITE_LIGHTDASH_PROJECT_UUID: args.projectUuid,
        LIGHTDASH_PREVIEW_PROXY_TARGET: `http://127.0.0.1:${args.proxyPort}`,
        LIGHTDASH_PREVIEW_PROXY_NONCE: args.proxyNonce,
    };
};

/**
 * Older downloads have a vite.config.js that proxies /api straight to the
 * instance and expects the credential in .env.local — incompatible with the
 * proxy-based flow (requests would go out uncredentialed and 401).
 */
export const assertScaffoldingSupportsPreviewProxy = async (
    appDir: string,
): Promise<void> => {
    const viteConfig = await fs
        .readFile(path.join(appDir, 'vite.config.js'), 'utf-8')
        .catch(() => '');
    if (!viteConfig.includes('LIGHTDASH_PREVIEW_PROXY_TARGET')) {
        throw new Error(
            `This app's scaffolding predates the secure preview proxy. Re-download the app ('lightdash download --apps <appUuid>') to refresh vite.config.js, then run preview again.`,
        );
    }
};

export const resolvePreviewTarget = async (args: {
    pathArg?: string;
    projectFlag?: string;
    cwd: string;
}): Promise<{ appDir: string; projectUuid: string }> => {
    const appDir = args.pathArg
        ? path.resolve(args.cwd, args.pathArg)
        : args.cwd;

    let manifest: DataAppManifest;
    try {
        manifest = await readManifestFromDir(appDir);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(
                `No lightdash-app.yml found in ${appDir}. Run this from a downloaded app folder (apps/<slug>/), or pass it as an argument: lightdash apps preview <path>.`,
            );
        }
        throw err;
    }

    return {
        appDir,
        projectUuid: args.projectFlag ?? manifest.projectUuid,
    };
};

export const assertNodeModulesPresent = async (
    appDir: string,
): Promise<void> => {
    const isDir = await fs
        .stat(path.join(appDir, 'node_modules'))
        .then((s) => s.isDirectory())
        .catch(() => false);
    if (!isDir) {
        throw new Error(
            `Dependencies are not installed. Run 'npm install' in ${appDir} first (preview does not auto-install).`,
        );
    }
};

/**
 * The login context can point at a different instance than the one the app
 * was downloaded from — the credential pre-flight passes there, but the
 * app's project doesn't exist, which would surface as a confusing 404
 * inside the running app.
 */
export const projectNotFoundMessage = (args: {
    projectUuid: string;
    serverUrl: string;
}): string =>
    `Project ${args.projectUuid} was not found on ${args.serverUrl} (or you don't have access). This app belongs to a different project or instance than the one you're logged into — run 'lightdash login <url>' for the server the app was downloaded from, or pass --project to preview against another project.`;

export const preflightPreviewRequest = async (args: {
    apiPath: string;
    serverUrl: string;
    authorization: string;
    proxyAuthorization?: string;
    fetchFn?: typeof fetch;
}): Promise<boolean> => {
    const fetchFn = args.fetchFn ?? fetch;
    try {
        const res = await fetchFn(new URL(args.apiPath, args.serverUrl), {
            headers: {
                Authorization: args.authorization,
                ...(args.proxyAuthorization
                    ? { 'Proxy-Authorization': args.proxyAuthorization }
                    : {}),
            },
        });
        return res.ok;
    } catch (error) {
        const reason =
            error instanceof Error ? error.message : 'Unknown network error';
        throw new Error(
            `Could not connect to ${args.serverUrl} while starting preview: ${reason}`,
        );
    }
};

const LEGACY_PREVIEW_CREDENTIAL =
    /^[ \t]*(?:export[ \t]+)?LIGHTDASH_PREVIEW_API_KEY[ \t]*=.*(?:\r?\n|$)/gm;

export const removeLegacyPreviewCredential = async (
    appDir: string,
): Promise<boolean> => {
    const legacyEnvPath = path.join(appDir, '.env.local');
    let legacyEnv: string;
    try {
        legacyEnv = await fs.readFile(legacyEnvPath, 'utf-8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }

    const sanitizedEnv = legacyEnv.replace(LEGACY_PREVIEW_CREDENTIAL, '');
    if (sanitizedEnv === legacyEnv) return false;

    if (sanitizedEnv.trim() === '') {
        await fs.unlink(legacyEnvPath);
    } else {
        await fs.writeFile(legacyEnvPath, sanitizedEnv, 'utf-8');
    }
    return true;
};

// Ctrl-C is the documented way to stop the dev server, so an interrupted child
// is a normal exit rather than a crash to report. The runner may either die
// from the signal or translate it into the conventional 128+signal exit code.
const isUserStoppedDevServer = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }
    const { signal, exitCode } = error as execa.ExecaError;
    return (
        signal === 'SIGINT' ||
        signal === 'SIGTERM' ||
        exitCode === 130 ||
        exitCode === 143
    );
};

type AppsPreviewOptions = {
    project?: string;
    url?: string;
    token?: string;
    verbose: boolean;
};

export const appsPreviewHandler = async (
    pathArg: string | undefined,
    options: AppsPreviewOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);

    const config = await getConfig();
    const serverUrl = options.url ?? config.context?.serverUrl;
    // getConfig() already folds LIGHTDASH_API_KEY into context.apiKey, so the
    // env-var path is safe. The only exposure is an explicit --token on the
    // command line (visible in shell history / `ps aux`) — warn rather than
    // block, since --token is a supported CI path.
    const apiKey = options.token ?? config.context?.apiKey;
    if (!serverUrl || !apiKey) {
        throw new AuthorizationError(
            `Not logged in or missing server URL. Run 'lightdash login <url>' first, or set LIGHTDASH_URL and LIGHTDASH_API_KEY.`,
        );
    }
    const authorization = getAuthHeader(apiKey);
    const proxyAuthorization = config.context?.proxyAuthorization;
    if (options.token) {
        GlobalState.log(
            styles.warning(
                `Passing --token on the command line exposes it in your shell history and process list. Prefer 'lightdash login' or the LIGHTDASH_API_KEY environment variable.`,
            ),
        );
    }

    const target = await resolvePreviewTarget({
        pathArg,
        projectFlag: options.project,
        cwd: process.cwd(),
    });
    await assertNodeModulesPresent(target.appDir);

    await assertScaffoldingSupportsPreviewProxy(target.appDir);

    // Pre-flight the credential before starting vite: an expired/revoked
    // token would otherwise surface as opaque query failures inside the app.
    // Flag-supplied credentials (--url/--token) bypass the stored config, so
    // hit the API directly with exactly what the proxy will forward.
    if (!options.url && !options.token) {
        await checkLightdashVersion();
    }
    const preflight = (apiPath: string) =>
        preflightPreviewRequest({
            apiPath,
            serverUrl,
            authorization,
            proxyAuthorization,
        });
    if (!(await preflight('/api/v1/user'))) {
        throw new AuthorizationError(
            `Your Lightdash credential was rejected by ${serverUrl}. Run 'lightdash login ${serverUrl}' to refresh it, or check the --url/--token values.`,
        );
    }
    if (!(await preflight(`/api/v1/projects/${target.projectUuid}`))) {
        throw new Error(
            projectNotFoundMessage({
                projectUuid: target.projectUuid,
                serverUrl,
            }),
        );
    }

    // Previous versions persisted this credential in .env.local. Remove only
    // that obsolete entry, preserving any unrelated user-managed settings.
    if (await removeLegacyPreviewCredential(target.appDir)) {
        GlobalState.log(
            styles.warning(
                `Removed an obsolete preview credential from ${path.join(target.appDir, '.env.local')}.`,
            ),
        );
    }

    const proxyNonce = randomBytes(16).toString('hex');
    const proxy = await startPreviewProxy({
        upstreamUrl: serverUrl,
        authorization,
        proxyAuthorization,
        projectUuid: target.projectUuid,
        nonce: proxyNonce,
    });

    GlobalState.log(
        `Preview proxy on 127.0.0.1:${proxy.port} — your credential is not passed to the app; SDK traffic is restricted to project ${target.projectUuid}.`,
    );
    GlobalState.log(
        styles.warning(
            `Preview renders YOUR data with YOUR permissions and user attributes — viewers of the deployed app may see different data.`,
        ),
    );
    GlobalState.log(`Starting dev server (Ctrl-C to stop)…`);

    try {
        await execa('npm', ['run', 'dev'], {
            cwd: target.appDir,
            stdio: 'inherit',
            extendEnv: false,
            env: buildPreviewChildEnv({
                serverUrl,
                projectUuid: target.projectUuid,
                proxyPort: proxy.port,
                proxyNonce,
            }),
        });
    } catch (e) {
        if (!isUserStoppedDevServer(e)) {
            throw e;
        }
        GlobalState.log('Preview stopped.');
    } finally {
        await proxy.close();
    }
};
