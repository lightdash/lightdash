import { DbtManifest, getErrorMessage } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import globalState from '../globalState';

export type LoadManifestArgs = {
    targetDir: string;
};

export const getManifestPath = async (targetDir: string): Promise<string> =>
    path.join(targetDir, 'manifest.json');

export const loadManifest = async ({
    targetDir,
}: LoadManifestArgs): Promise<DbtManifest> => {
    const filename = await getManifestPath(targetDir);
    globalState.debug(`> Loading dbt manifest from ${filename}`);
    try {
        const manifest = JSON.parse(
            await fs.readFile(filename, { encoding: 'utf-8' }),
        ) as DbtManifest;
        return manifest;
    } catch (err: unknown) {
        const msg = getErrorMessage(err);
        throw new Error(`Could not load manifest from ${filename}:\n  ${msg}`);
    }
};
