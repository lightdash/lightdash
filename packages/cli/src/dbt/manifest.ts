import { DbtManifest, getErrorMessage, ParseError } from '@lightdash/common';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import * as path from 'path';
import globalState from '../globalState';

// The merge core moved to @lightdash/common (server + CLI share one implementation);
// re-exported here so existing CLI imports of combineManifests are unchanged.
export {
    combineManifests,
    type CombineManifestsResult,
} from '@lightdash/common';

export type LoadManifestArgs = {
    targetDir: string;
};

export const getManifestPath = async (targetDir: string): Promise<string> =>
    path.join(targetDir, 'manifest.json');

export const loadManifestFromFile = async (
    filename: string,
): Promise<DbtManifest> => {
    globalState.debug(`> Loading dbt manifest from ${filename}`);
    try {
        const manifest = JSON.parse(
            await fs.readFile(filename, { encoding: 'utf-8' }),
        ) as DbtManifest;
        return manifest;
    } catch (err: unknown) {
        const msg = getErrorMessage(err);
        // ParseError is a LightdashError: an unreadable manifest is user
        // input, so the CLI reports it without a stack trace / bug-report link
        throw new ParseError(
            `Could not load manifest from ${filename}:\n  ${msg}`,
        );
    }
};

export const loadManifest = async ({
    targetDir,
}: LoadManifestArgs): Promise<DbtManifest> => {
    const filename = await getManifestPath(targetDir);
    return loadManifestFromFile(filename);
};

export const isHttpUrl = (value: string): boolean => {
    try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
};

export const loadManifestFromUrl = async (
    url: string,
): Promise<DbtManifest> => {
    globalState.debug(`> Loading dbt manifest from ${url}`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }
        const manifest = JSON.parse(await response.text()) as DbtManifest;
        return manifest;
    } catch (err: unknown) {
        const msg = getErrorMessage(err);
        throw new ParseError(`Could not load manifest from ${url}:\n  ${msg}`);
    }
};

export const loadCombineManifest = async (
    pathOrUrl: string,
): Promise<DbtManifest> => {
    if (isHttpUrl(pathOrUrl)) {
        return loadManifestFromUrl(pathOrUrl);
    }
    return loadManifestFromFile(path.resolve(pathOrUrl));
};
