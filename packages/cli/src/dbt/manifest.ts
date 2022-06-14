import { DbtManifest } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';

type LoadManifestArgs = {
    targetDir: string;
};

export const loadManifest = async ({
    targetDir,
}: LoadManifestArgs): Promise<DbtManifest> => {
    const filename = path.join(targetDir, 'manifest.json');
    try {
        const manifest = JSON.parse(
            await fs.readFile(filename, { encoding: 'utf-8' }),
        ) as DbtManifest;
        return manifest;
    } catch (err: any) {
        throw new Error(
            `Could not load manifest from ${filename}:\n  ${err.message}`,
        );
    }
};
