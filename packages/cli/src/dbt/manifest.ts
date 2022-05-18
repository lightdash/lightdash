import { readFileSync } from 'fs';
import * as path from 'path';

type LoadManifestArgs = {
    targetDir: string;
};

export const loadManifest = ({ targetDir }: LoadManifestArgs) => {
    const filename = path.join(targetDir, 'manifest.json');
    try {
        const manifest = JSON.parse(
            readFileSync(filename, { encoding: 'utf-8' }),
        ) as any;
        return manifest;
    } catch (err) {
        throw new Error(
            `Could not load manifest from ${filename}:\n  ${err.message}`,
        );
    }
};
