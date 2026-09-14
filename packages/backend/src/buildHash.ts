import { readFileSync } from 'fs';
import * as path from 'path';

const FRONTEND_BUILD_HASH_PATH = path.join(
    __dirname,
    '../../frontend/build',
    'build-hash.json',
);

const parseBuildHash = (contents: string): string | null => {
    try {
        const parsed: unknown = JSON.parse(contents);
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }

        const { buildHash } = parsed as { buildHash?: unknown };
        return typeof buildHash === 'string' && buildHash.length > 0
            ? buildHash
            : null;
    } catch {
        return null;
    }
};

let cachedBuildHash: string | null | undefined;

export const getFrontendBuildHash = (): string | null => {
    if (cachedBuildHash !== undefined) {
        return cachedBuildHash;
    }

    try {
        cachedBuildHash = parseBuildHash(
            readFileSync(FRONTEND_BUILD_HASH_PATH, 'utf-8'),
        );
    } catch {
        cachedBuildHash = null;
    }

    return cachedBuildHash;
};
