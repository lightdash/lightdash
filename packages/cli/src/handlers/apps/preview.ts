import { AuthorizationError, type DataAppManifest } from '@lightdash/common';
import execa from 'execa';
import { promises as fs } from 'fs';
import * as path from 'path';
import { getConfig } from '../../config';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { checkLightdashVersion } from '../dbt/apiClient';
import { readManifestFromDir } from './appCodeFiles';

// Non-secret placeholder inlined into the browser in place of the real key.
// The vite proxy overrides the Authorization header with the real credential
// (LIGHTDASH_PREVIEW_API_KEY) server-side, so this value never authenticates.
export const PREVIEW_API_KEY_SENTINEL = 'preview-proxy-injected';

export const buildPreviewEnv = (args: {
    serverUrl: string;
    apiKey: string;
    projectUuid: string;
}): string => {
    const baseUrl = args.serverUrl.replace(/\/+$/, '');
    // The real credential goes into LIGHTDASH_PREVIEW_API_KEY, which the vite
    // dev server reads server-side and injects into proxied /api requests — it
    // is never inlined into the browser bundle (only VITE_* vars are). The
    // browser gets a non-secret sentinel so the SDK still builds a client and
    // sends a well-formed (but useless) Authorization header the proxy
    // overrides. Result: no usable API key ever reaches the page.
    return [
        `VITE_LIGHTDASH_URL=${baseUrl}`,
        `VITE_LIGHTDASH_API_KEY=${PREVIEW_API_KEY_SENTINEL}`,
        `VITE_LIGHTDASH_PROJECT_UUID=${args.projectUuid}`,
        `LIGHTDASH_PREVIEW_API_KEY=${args.apiKey}`,
        '',
    ].join('\n');
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
    const apiKey = options.token ?? config.context?.apiKey;
    if (!serverUrl || !apiKey) {
        throw new AuthorizationError(
            `Not logged in or missing server URL. Run 'lightdash login <url>' first, or pass --url and --token.`,
        );
    }

    const target = await resolvePreviewTarget({
        pathArg,
        projectFlag: options.project,
        cwd: process.cwd(),
    });
    await assertNodeModulesPresent(target.appDir);

    // Pre-flight the credential before starting vite: an expired/revoked
    // token would otherwise surface as opaque query failures inside the app.
    // Flag-supplied credentials (--url/--token) bypass the stored config, so
    // hit the API directly with exactly what will be written to .env.local.
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

    const envPath = path.join(target.appDir, '.env.local');
    await fs.writeFile(
        envPath,
        buildPreviewEnv({
            serverUrl,
            apiKey,
            projectUuid: target.projectUuid,
        }),
        'utf-8',
    );
    GlobalState.log(
        `Wrote ${envPath} (gitignored; contains your API key — do not commit or share it).`,
    );
    GlobalState.log(
        styles.warning(
            `Preview renders YOUR data with YOUR permissions and user attributes — viewers of the deployed app may see different data.`,
        ),
    );
    GlobalState.log(`Starting dev server (Ctrl-C to stop)…`);

    await execa('pnpm', ['dev'], {
        cwd: target.appDir,
        stdio: 'inherit',
    });
};
