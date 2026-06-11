import {
    DbtManifest,
    DbtNode,
    DbtRawModelNode,
    getErrorMessage,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import globalState from '../globalState';

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
        throw new Error(`Could not load manifest from ${filename}:\n  ${msg}`);
    }
};

export const loadManifest = async ({
    targetDir,
}: LoadManifestArgs): Promise<DbtManifest> => {
    const filename = await getManifestPath(targetDir);
    return loadManifestFromFile(filename);
};

export type CombineManifestsResult = {
    manifest: DbtManifest;
    addedModelIds: string[];
};

/**
 * Merge model nodes from `external` into `primary`. Nodes already present in
 * `primary` keep their primary version (primary wins on conflict). Returns the
 * combined manifest and the unique_ids of model nodes pulled in from the
 * external manifest, so callers can mark them as compiled.
 *
 * Only external models with `compiled === true` are reported in
 * `addedModelIds` — non-compiled nodes are still merged into `nodes` so join
 * lookups by name keep working, but they are not turned into explores.
 *
 * Metrics, docs, and metadata are taken from `primary` only.
 */
export const combineManifests = (
    primary: DbtManifest,
    external: DbtManifest,
): CombineManifestsResult => {
    const mergedNodes: Record<string, DbtNode> = { ...external.nodes };
    Object.assign(mergedNodes, primary.nodes);

    const addedModelIds: string[] = [];
    Object.entries(external.nodes).forEach(([id, node]) => {
        if (
            !(id in primary.nodes) &&
            node.resource_type === 'model' &&
            (node as DbtRawModelNode).compiled === true
        ) {
            addedModelIds.push(id);
        }
    });

    return {
        manifest: { ...primary, nodes: mergedNodes },
        addedModelIds,
    };
};
