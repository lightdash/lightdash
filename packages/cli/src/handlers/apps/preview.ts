import { AuthorizationError, type DataAppManifest } from '@lightdash/common';
import execa from 'execa';
import { promises as fs } from 'fs';
import * as path from 'path';
import { getConfig } from '../../config';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { checkLightdashVersion, lightdashApi } from '../dbt/apiClient';
import { readManifestFromDir } from './appCodeFiles';

export const buildPreviewEnv = (args: {
    serverUrl: string;
    apiKey: string;
    projectUuid: string;
}): string => {
    const baseUrl = args.serverUrl.replace(/\/+$/, '');
    return [
        `VITE_LIGHTDASH_URL=${baseUrl}`,
        `VITE_LIGHTDASH_API_KEY=${args.apiKey}`,
        `VITE_LIGHTDASH_PROJECT_UUID=${args.projectUuid}`,
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
    if (options.url || options.token) {
        // lightdashApi reads the stored config, so flag-overridden
        // credentials can't be pre-flighted through it; skip the check.
        GlobalState.debug('Skipping credential pre-flight (--url/--token).');
    } else {
        await checkLightdashVersion();
        try {
            await lightdashApi({
                method: 'GET',
                url: '/api/v1/user',
                body: undefined,
            });
        } catch (err) {
            throw new AuthorizationError(
                `Your Lightdash credential was rejected by ${serverUrl}. Run 'lightdash login ${serverUrl}' to refresh it.`,
            );
        }
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
