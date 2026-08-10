import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    buildMarker,
    generateReleaseSafety,
} from './gen-release-safety';
import {
    CONFIGURE_RELEASE_SAFETY_BACKFILL_FLOOR_VERSION,
    indexEntryFromMarker,
    loadReleaseSafetyIndex,
    updateReleaseSafetyIndex,
    writeReleaseSafetyIndex,
} from './release-safety-index';

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function releaseTags(): string[] {
    return execFileSync('git', ['tag', '--sort=v:refname'], {
        encoding: 'utf-8',
    })
        .split('\n')
        .filter((tag) => /^\d+\.\d+\.\d+$/.test(tag));
}

function releaseDate(ref: string): string {
    return execFileSync('git', ['log', '-1', '--format=%cI', ref], {
        encoding: 'utf-8',
    }).trim();
}

async function main(): Promise<void> {
    const floorVersion =
        arg('floor-version') ??
        CONFIGURE_RELEASE_SAFETY_BACKFILL_FLOOR_VERSION;
    if (floorVersion === null) {
        throw new Error(
            'Set CONFIGURE_RELEASE_SAFETY_BACKFILL_FLOOR_VERSION or pass --floor-version',
        );
    }
    const indexPath = arg('index') ?? 'release-safety-index.json';
    const tags = releaseTags();
    const floorIndex = tags.indexOf(floorVersion);
    if (floorIndex <= 0) {
        throw new Error(`Backfill floor tag ${floorVersion} has no predecessor`);
    }
    const throughVersion = arg('through-version') ?? tags.at(-1);
    const throughIndex = throughVersion ? tags.indexOf(throughVersion) : -1;
    if (throughIndex < floorIndex) {
        throw new Error(`Invalid backfill target ${throughVersion ?? 'unknown'}`);
    }

    process.env.RELEASE_SAFETY_MARKER_ENABLED = 'true';
    const temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'release-safety-backfill-'),
    );
    try {
        for (let index = floorIndex; index <= throughIndex; index += 1) {
            const version = tags[index];
            const previousVersion = tags[index - 1];
            const existing = loadReleaseSafetyIndex(indexPath);
            if (existing.entries.some((entry) => entry.version === version)) {
                continue;
            }
            try {
                await generateReleaseSafety([
                    '--version',
                    version,
                    '--previous-version',
                    previousVersion,
                    '--last-tag',
                    previousVersion,
                    '--to-ref',
                    version,
                    '--rest-from-refs',
                    '--backfilled',
                    '--out',
                    path.join(temporaryDirectory, 'release-safety.json'),
                    '--index',
                    indexPath,
                ]);
            } catch (error) {
                console.warn(
                    `[release-safety-backfill] ${version} degraded: ${error instanceof Error ? error.message : String(error)}`,
                );
                const marker = buildMarker({
                    version,
                    previousVersion,
                    releaseDate: releaseDate(version),
                    migrations: null,
                    migrationDetails: [],
                    migrationMetadataComplete: false,
                    declaredBreaks: [],
                    config: null,
                    restApi: null,
                    mcpApi: null,
                });
                writeReleaseSafetyIndex(
                    indexPath,
                    updateReleaseSafetyIndex({
                        index: existing,
                        entries: [indexEntryFromMarker(marker, true)],
                        generatedAt: marker.releaseDate,
                        backfillFloorVersion: floorVersion,
                    }),
                );
            }
        }
        const finalIndex = loadReleaseSafetyIndex(indexPath);
        writeReleaseSafetyIndex(
            indexPath,
            updateReleaseSafetyIndex({
                index: finalIndex,
                entries: [],
                generatedAt: new Date().toISOString(),
                backfillFloorVersion: floorVersion,
            }),
        );
    } finally {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(
        `[release-safety-backfill] FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
});
