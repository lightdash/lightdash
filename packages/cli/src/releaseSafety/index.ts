import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import releaseSafetyIndexSchema from './release-safety-index.schema.json';
import { compareVersions } from './version';

export { compareVersions, isReleaseVersion } from './version';

export const INDEX_SCHEMA_VERSION = '1' as const;

export type TriState = boolean | 'unknown';

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

export interface ReleaseSafetyMissingRange {
    afterVersion: string;
    beforeVersion: string;
}

export interface SpanComposition {
    verdict: TriState;
    safe: boolean;
    requiredStops: string[];
    minPreviousVersion: string | null;
    coveredVersions: string[];
    missingRanges: ReleaseSafetyMissingRange[];
}

const ajv = new Ajv({
    strict: true,
    allErrors: true,
    coerceTypes: false,
    removeAdditional: false,
    useDefaults: false,
});
addFormats(ajv);
const validateReleaseSafetyIndex = ajv.compile<ReleaseSafetyIndex>(
    releaseSafetyIndexSchema,
) as ValidateFunction<ReleaseSafetyIndex>;

export function parseReleaseSafetyIndex(input: unknown): ReleaseSafetyIndex {
    if (!validateReleaseSafetyIndex(input)) {
        throw new Error(
            `Invalid release-safety index: ${JSON.stringify(validateReleaseSafetyIndex.errors)}`,
        );
    }
    return input;
}

export function composeReleaseSafetySpan(
    index: ReleaseSafetyIndex,
    fromVersion: string,
    toVersion: string,
): SpanComposition {
    const [lowerVersion, upperVersion] =
        compareVersions(fromVersion, toVersion) <= 0
            ? [fromVersion, toVersion]
            : [toVersion, fromVersion];
    const entries = index.entries
        .filter(
            (entry) =>
                compareVersions(entry.version, lowerVersion) > 0 &&
                compareVersions(entry.version, upperVersion) <= 0,
        )
        .sort((left, right) => compareVersions(left.version, right.version));
    const indexedVersions = new Set(
        index.entries.map((entry) => entry.version),
    );
    const missingRanges: ReleaseSafetyMissingRange[] = [];
    if (!indexedVersions.has(lowerVersion)) {
        missingRanges.push({
            afterVersion: lowerVersion,
            beforeVersion: lowerVersion,
        });
    }
    let expectedPreviousVersion = lowerVersion;

    for (const entry of entries) {
        if (
            entry.previousVersion === null ||
            compareVersions(entry.previousVersion, expectedPreviousVersion) !==
                0
        ) {
            missingRanges.push({
                afterVersion: expectedPreviousVersion,
                beforeVersion: entry.version,
            });
        }
        expectedPreviousVersion = entry.version;
    }

    if (compareVersions(expectedPreviousVersion, upperVersion) !== 0) {
        const terminalRange = {
            afterVersion: expectedPreviousVersion,
            beforeVersion: upperVersion,
        };
        if (
            !missingRanges.some(
                (range) =>
                    range.afterVersion === terminalRange.afterVersion &&
                    range.beforeVersion === terminalRange.beforeVersion,
            )
        ) {
            missingRanges.push(terminalRange);
        }
    }

    const startsBeforeFloor =
        index.backfillFloorVersion !== null &&
        compareVersions(lowerVersion, index.backfillFloorVersion) < 0;
    const hasFalse = entries.some((entry) => entry.rollingUpdateSafe === false);
    const hasUnknown = entries.some(
        (entry) => entry.rollingUpdateSafe === 'unknown',
    );
    let verdict: TriState = true;
    if (missingRanges.length > 0) {
        verdict = 'unknown';
    } else if (hasFalse) {
        verdict = false;
    } else if (hasUnknown) {
        verdict = 'unknown';
    }
    const requiredStops = [
        ...new Set([
            ...(startsBeforeFloor && index.backfillFloorVersion !== null
                ? [index.backfillFloorVersion]
                : []),
            ...entries.flatMap((entry) => entry.requiredStops),
        ]),
    ].filter(
        (version) =>
            compareVersions(version, lowerVersion) > 0 &&
            compareVersions(version, upperVersion) <= 0,
    );
    const minPreviousVersion = entries.reduce<string | null>(
        (highest, entry) => {
            if (entry.minPreviousVersion === null) {
                return highest;
            }
            if (
                highest === null ||
                compareVersions(entry.minPreviousVersion, highest) > 0
            ) {
                return entry.minPreviousVersion;
            }
            return highest;
        },
        null,
    );
    const belowMinimum =
        minPreviousVersion !== null &&
        compareVersions(lowerVersion, minPreviousVersion) < 0;

    return {
        verdict,
        safe: verdict === true && requiredStops.length === 0 && !belowMinimum,
        requiredStops,
        minPreviousVersion,
        coveredVersions: entries.map((entry) => entry.version),
        missingRanges,
    };
}
