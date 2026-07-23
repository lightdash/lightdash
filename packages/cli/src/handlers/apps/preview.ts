import { AuthorizationError, type DataAppManifest } from '@lightdash/common';
import { randomBytes } from 'crypto';
import execa from 'execa';
import { promises as fs } from 'fs';
import * as path from 'path';
import { getConfig } from '../../config';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { checkLightdashVersion } from '../dbt/apiClient';
import { readManifestFromDir } from './appCodeFiles';
import { startPreviewProxy } from './previewProxy';

// Non-secret placeholder inlined into the browser in place of the real key.
// The CLI's loopback proxy replaces the Authorization header with the real
// credential before forwarding upstream, so this value never authenticates.
export const PREVIEW_API_KEY_SENTINEL = 'preview-proxy-injected';

/**
 * Environment passed to the `pnpm dev` child process. Everything here is
 * non-secret: the credential itself stays in the CLI process, behind the
 * loopback proxy. The nonce is a run-scoped capability that only grants the
 * proxy's allowlisted routes — the vite dev server reads it (non-VITE_, so
 * never inlined into the browser bundle) and attaches it to proxied /api
 * requests.
 */
export const buildPreviewChildEnv = (args: {
    serverUrl: string;
    projectUuid: string;
    proxyPort: number;
    proxyNonce: string;
}): Record<string, string> => ({
    VITE_LIGHTDASH_URL: args.serverUrl.replace(/\/+$/, ''),
    VITE_LIGHTDASH_API_KEY: PREVIEW_API_KEY_SENTINEL,
    VITE_LIGHTDASH_PROJECT_UUID: args.projectUuid,
    LIGHTDASH_PREVIEW_PROXY_TARGET: `http://127.0.0.1:${args.proxyPort}`,
    LIGHTDASH_PREVIEW_PROXY_NONCE: args.proxyNonce,
});

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
            `Dependencies are not installed. Run 'pnpm install' in ${appDir} first (preview does not auto-install).`,
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
    const preflight = async (apiPath: string): Promise<boolean> => {
        try {
            const res = await fetch(new URL(apiPath, serverUrl), {
                headers: { Authorization: `ApiKey ${apiKey}` },
            });
            return res.ok;
        } catch {
            return false;
        }
    };
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

    // Previous versions of this command persisted the credential in
    // .env.local. It's no longer read or written — nudge cleanup if found.
    const legacyEnvPath = path.join(target.appDir, '.env.local');
    const legacyEnv = await fs.readFile(legacyEnvPath, 'utf-8').catch(() => '');
    if (legacyEnv.includes('LIGHTDASH_PREVIEW_API_KEY=')) {
        GlobalState.log(
            styles.warning(
                `${legacyEnvPath} holds a credential from an older preview version. It is no longer used — delete the file.`,
            ),
        );
    }

    const proxyNonce = randomBytes(16).toString('hex');
    const proxy = await startPreviewProxy({
        upstreamUrl: serverUrl,
        apiKey,
        projectUuid: target.projectUuid,
        nonce: proxyNonce,
    });

    GlobalState.log(
        `Preview proxy on 127.0.0.1:${proxy.port} — your credential stays in this process; the app can only reach the data-app SDK routes for project ${target.projectUuid}.`,
    );
    GlobalState.log(
        styles.warning(
            `Preview renders YOUR data with YOUR permissions and user attributes — viewers of the deployed app may see different data.`,
        ),
    );
    GlobalState.log(`Starting dev server (Ctrl-C to stop)…`);

    try {
        await execa('pnpm', ['dev'], {
            cwd: target.appDir,
            stdio: 'inherit',
            env: buildPreviewChildEnv({
                serverUrl,
                projectUuid: target.projectUuid,
                proxyPort: proxy.port,
                proxyNonce,
            }),
        });
    } finally {
        await proxy.close();
    }
};
