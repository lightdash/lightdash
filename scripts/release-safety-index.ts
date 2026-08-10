import * as fs from 'fs';
import * as path from 'path';
import type { ReleaseSafetyMarker, TriState } from './release-safety-contract';
import { compareVersions } from './expand-version';

export const CONFIGURE_RELEASE_SAFETY_BACKFILL_FLOOR_VERSION: string | null =
    null;
export const INDEX_SCHEMA_VERSION = '1' as const;

export interface ReleaseSafetyIndexEntry {
    version: string;
    previousVersion: string | null;
    releaseDate: string;
    rollingUpdateSafe: TriState;
    requiredStops: string[];
    minPreviousVersion: string | null;
    backfilled: boolean;
    syntheticRequiredStop: boolean;
}

export interface ReleaseSafetyIndex {
    schemaVersion: typeof INDEX_SCHEMA_VERSION;
    generatedAt: string;
    backfillFloorVersion: string | null;
    entries: ReleaseSafetyIndexEntry[];
}

export interface SpanComposition {
    verdict: TriState;
    safe: boolean;
    requiredStops: string[];
    minPreviousVersion: string | null;
    coveredVersions: string[];
}

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

export function composeReleaseSafetySpan(
    index: ReleaseSafetyIndex,
    fromVersion: string,
    toVersion: string,
): SpanComposition {
    const entries = index.entries.filter(
        (entry) =>
            compareVersions(entry.version, fromVersion) > 0 &&
            compareVersions(entry.version, toVersion) <= 0,
    );
    const reachesTarget = entries.some((entry) => entry.version === toVersion);
    const startsBeforeFloor =
        index.backfillFloorVersion !== null &&
        compareVersions(fromVersion, index.backfillFloorVersion) < 0;
    const hasFalse = entries.some(
        (entry) => entry.rollingUpdateSafe === false,
    );
    const hasUnknown = entries.some(
        (entry) => entry.rollingUpdateSafe === 'unknown',
    );

    let verdict: TriState;
    if (!reachesTarget || entries.length === 0) {
        verdict = 'unknown';
    } else if (hasFalse) {
        verdict = false;
    } else if (hasUnknown) {
        verdict = 'unknown';
    } else {
        verdict = true;
    }

    const requiredStops = [
        ...new Set([
            ...(startsBeforeFloor && index.backfillFloorVersion
                ? [index.backfillFloorVersion]
                : []),
            ...entries.flatMap((entry) => entry.requiredStops),
        ]),
    ].filter(
        (version) =>
            compareVersions(version, fromVersion) > 0 &&
            compareVersions(version, toVersion) <= 0,
    );
    const minPreviousVersion = entries.reduce<string | null>((highest, entry) => {
        if (entry.minPreviousVersion === null) return highest;
        if (
            highest === null ||
            compareVersions(entry.minPreviousVersion, highest) > 0
        ) {
            return entry.minPreviousVersion;
        }
        return highest;
    }, null);
    const belowMinimum =
        minPreviousVersion !== null &&
        compareVersions(fromVersion, minPreviousVersion) < 0;

    return {
        verdict,
        safe:
            verdict === true &&
            requiredStops.length === 0 &&
            !belowMinimum,
        requiredStops,
        minPreviousVersion,
        coveredVersions: entries.map((entry) => entry.version),
    };
}

export function loadReleaseSafetyIndex(indexPath: string): ReleaseSafetyIndex {
    if (!fs.existsSync(indexPath)) {
        return emptyReleaseSafetyIndex(new Date(0).toISOString());
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('schemaVersion' in parsed) ||
        parsed.schemaVersion !== INDEX_SCHEMA_VERSION ||
        !('entries' in parsed) ||
        !Array.isArray(parsed.entries)
    ) {
        throw new Error(`Invalid release-safety index at ${indexPath}`);
    }
    return parsed as ReleaseSafetyIndex;
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
