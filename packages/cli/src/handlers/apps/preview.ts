import { type DataAppManifest } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';
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
