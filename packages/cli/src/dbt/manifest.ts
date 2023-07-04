import { DbtManifest, DbtManifestVersion } from '@lightdash/common';
import { existsSync, promises as fs } from 'fs';
import * as path from 'path';
import globalState from '../globalState';
import { getDbtVersion } from '../handlers/dbt/getDbtVersion';

type LoadManifestArgs = {
    targetDir: string;
};

export const getDbtManifest = async (): Promise<DbtManifestVersion> => {
    const version = await getDbtVersion();
    if (version.startsWith('1.5.')) return DbtManifestVersion.V9;
    return DbtManifestVersion.V7;
};

export const getManifestPath = async (targetDir: string): Promise<string> => {
    const version = await getDbtVersion();
    // There was a bug between dbt>=1.5.0 and <1.5.2 where the manifest was not being generated in the dir when using project-dir
    // https://github.com/dbt-labs/dbt-core/releases/tag/v1.5.2
    // https://github.com/dbt-labs/dbt-core/issues/7819
    const pathVersion150 = path.join('./target', 'manifest.json');
    if (version.startsWith('1.5.') && existsSync(pathVersion150))
        return pathVersion150;

    return path.join(targetDir, 'manifest.json');
};

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
    } catch (err: any) {
        throw new Error(
            `Could not load manifest from ${filename}:\n  ${err.message}`,
        );
    }
};
