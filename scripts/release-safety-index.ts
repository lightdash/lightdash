import * as fs from 'fs';
import * as path from 'path';
import {
    INDEX_SCHEMA_VERSION,
    parseReleaseSafetyIndex,
    type ReleaseSafetyIndex,
    type ReleaseSafetyIndexEntry,
} from '../packages/cli/src/releaseSafety';
import { compareVersions } from './expand-version';
import type { ReleaseSafetyMarker } from './release-safety-contract';

export {
    composeReleaseSafetySpan,
    INDEX_SCHEMA_VERSION,
    isReleaseVersion,
    parseReleaseSafetyIndex,
} from '../packages/cli/src/releaseSafety';
export { compareVersions } from './expand-version';
export type {
    ReleaseSafetyIndex,
    ReleaseSafetyIndexEntry,
    ReleaseSafetyMissingRange,
    SpanComposition,
    TriState,
} from '../packages/cli/src/releaseSafety';

export const CONFIGURE_RELEASE_SAFETY_BACKFILL_FLOOR_VERSION: string | null =
    '0.1893.0';

export function emptyReleaseSafetyIndex(generatedAt: string): ReleaseSafetyIndex {
    return {
        schemaVersion: INDEX_SCHEMA_VERSION,
        generatedAt,
        backfillFloorVersion: null,
        entries: [],
    };
}

export function indexEntryFromMarker(
    marker: ReleaseSafetyMarker,
    backfilled: boolean,
): ReleaseSafetyIndexEntry {
    return {
        version: marker.version,
        previousVersion: marker.previousVersion,
        releaseDate: marker.releaseDate,
        rollingUpdateSafe: marker.compatibility.rollingUpdateSafe,
        requiredStops: marker.upgrade.requiredStops,
        minPreviousVersion: marker.upgrade.minPreviousVersion,
        backfilled,
        syntheticRequiredStop: false,
    };
}

export function appendReleaseSafetyMarker(input: {
    index: ReleaseSafetyIndex;
    marker: ReleaseSafetyMarker;
    backfilled: boolean;
    backfillFloorVersion: string | null;
    now?: Date;
}): ReleaseSafetyIndex {
    return updateReleaseSafetyIndex({
        index: input.index,
        entries: [indexEntryFromMarker(input.marker, input.backfilled)],
        generatedAt: (input.now ?? new Date()).toISOString(),
        backfillFloorVersion: input.backfillFloorVersion,
    });
}

export function updateReleaseSafetyIndex(input: {
    index: ReleaseSafetyIndex;
    entries: ReleaseSafetyIndexEntry[];
    generatedAt: string;
    backfillFloorVersion: string | null;
}): ReleaseSafetyIndex {
    const backfillFloorVersion =
        input.backfillFloorVersion ?? input.index.backfillFloorVersion;
    const byVersion = new Map(
        input.index.entries.map((entry) => [entry.version, entry]),
    );
    for (const entry of input.entries) {
        byVersion.set(entry.version, entry);
    }

    if (backfillFloorVersion !== null) {
        const floorEntry = byVersion.get(backfillFloorVersion);
        if (floorEntry) {
            byVersion.set(backfillFloorVersion, {
                ...floorEntry,
                requiredStops: [
                    ...new Set([
                        backfillFloorVersion,
                        ...floorEntry.requiredStops,
                    ]),
                ],
                syntheticRequiredStop: true,
            });
        }
    }

    return {
        schemaVersion: INDEX_SCHEMA_VERSION,
        generatedAt: input.generatedAt,
        backfillFloorVersion,
        entries: [...byVersion.values()].sort((left, right) =>
            compareVersions(left.version, right.version),
        ),
    };
}

export function loadReleaseSafetyIndex(indexPath: string): ReleaseSafetyIndex {
    if (!fs.existsSync(indexPath)) {
        return emptyReleaseSafetyIndex(new Date(0).toISOString());
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch (error) {
        throw new Error(`Invalid release-safety index at ${indexPath}`, {
            cause: error,
        });
    }
    try {
        return parseReleaseSafetyIndex(parsed);
    } catch (error) {
        throw new Error(`Invalid release-safety index at ${indexPath}`, {
            cause: error,
        });
    }
}

export function writeReleaseSafetyIndex(
    indexPath: string,
    index: ReleaseSafetyIndex,
): void {
    const absolutePath = path.resolve(indexPath);
    const temporaryPath = path.join(
        path.dirname(absolutePath),
        `.release-safety-index.${process.pid}.tmp`,
    );
    fs.writeFileSync(temporaryPath, `${JSON.stringify(index, null, 2)}\n`);
    fs.renameSync(temporaryPath, absolutePath);
}
