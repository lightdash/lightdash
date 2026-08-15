import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface CliResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

function runGenerator(
    args: string[],
    environment?: NodeJS.ProcessEnv,
): CliResult {
    const result = spawnSync(
        'pnpm',
        [
            'exec',
            'tsx',
            resolve('scripts/gen-release-safety.ts'),
            ...args,
        ],
        {
            cwd: process.cwd(),
            encoding: 'utf8',
            env: { ...process.env, ...environment },
        },
    );
    return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
    };
}

function markerFrom(stdout: string): Record<string, unknown> {
    const markerStart = stdout.lastIndexOf('{\n  "schemaVersion"');
    assert.notStrictEqual(markerStart, -1, `marker not found in stdout: ${stdout}`);
    return JSON.parse(stdout.slice(markerStart)) as Record<string, unknown>;
}

const directory = mkdtempSync(join(tmpdir(), 'release-safety-cli-'));

try {
    const malformedOverrides = join(directory, 'malformed-overrides.json');
    writeFileSync(malformedOverrides, '{');
    const malformed = runGenerator([
        '--version',
        '1.115.0',
        '--overrides',
        malformedOverrides,
    ]);
    assert.notStrictEqual(malformed.status, 0);
    assert.match(malformed.stderr, /not valid JSON/);
    assert.doesNotMatch(malformed.stdout, /"schemaVersion"/);

    const validOverrides = join(directory, 'valid-overrides.json');
    writeFileSync(
        validOverrides,
        JSON.stringify({
            versions: {
                '1.115.0': {
                    minPreviousVersion: '1.114.0',
                    requiredStop: true,
                    note: 'Stop before this release.',
                },
            },
        }),
    );
    const valid = runGenerator([
        '--version',
        '1.115.0',
        '--overrides',
        validOverrides,
    ]);
    assert.strictEqual(valid.status, 0, valid.stderr);
    const validMarker = markerFrom(valid.stdout);
    assert.deepStrictEqual(validMarker.upgrade, {
        minPreviousVersion: '1.114.0',
        requiredStops: ['1.115.0'],
    });

    const degradedLastTag = runGenerator([
        '--version',
        '1.115.0',
        '--last-tag',
        'not-a-release-safety-test-ref',
    ]);
    assert.strictEqual(degradedLastTag.status, 0, degradedLastTag.stderr);
    assert.match(degradedLastTag.stderr, /cannot resolve migration diff ref/);
    const degradedLastTagMarker = markerFrom(degradedLastTag.stdout);
    assert.deepStrictEqual(degradedLastTagMarker.migrations, {
        present: 'unknown',
        count: 0,
        coreCount: 0,
        eeCount: 0,
        files: [],
    });

    const degradedPreviousVersion = runGenerator([
        '--version',
        '1.115.0',
        '--previous-version',
        'not-a-release-safety-test-ref',
    ]);
    assert.strictEqual(
        degradedPreviousVersion.status,
        0,
        degradedPreviousVersion.stderr,
    );
    assert.match(
        degradedPreviousVersion.stderr,
        /cannot resolve migration diff ref/,
    );
    const degradedPreviousVersionMarker = markerFrom(
        degradedPreviousVersion.stdout,
    );
    assert.deepStrictEqual(degradedPreviousVersionMarker.migrations, {
        present: 'unknown',
        count: 0,
        coreCount: 0,
        eeCount: 0,
        files: [],
    });

    const failedMarkerPath = join(directory, 'failed-marker.json');
    const malformedIndexPath = join(directory, 'malformed-index.json');
    writeFileSync(malformedIndexPath, '{');
    const failed = runGenerator(
        [
            '--version',
            '1.115.0',
            '--out',
            failedMarkerPath,
            '--index',
            malformedIndexPath,
        ],
        { RELEASE_SAFETY_MARKER_ENABLED: 'true' },
    );
    assert.notStrictEqual(failed.status, 0);
    assert.match(failed.stderr, /\[release-safety\] FAILED/);
    const failedMarker = JSON.parse(
        readFileSync(failedMarkerPath, 'utf8'),
    ) as Record<string, unknown>;
    assert.deepStrictEqual(markerFrom(failed.stdout), failedMarker);
    assert.deepStrictEqual(failedMarker.migrations, {
        present: 'unknown',
        count: 0,
        coreCount: 0,
        eeCount: 0,
        files: [],
    });

    const releaseMarkerPath = join(directory, 'release-marker.json');
    const indexPath = join(directory, 'release-index.json');
    const release = runGenerator(
        [
            '--version',
            '1.115.0',
            '--out',
            releaseMarkerPath,
            '--index',
            indexPath,
        ],
        { RELEASE_SAFETY_MARKER_ENABLED: 'true' },
    );
    assert.strictEqual(release.status, 0, release.stderr);
    assert.match(release.stdout, new RegExp(`wrote ${indexPath}`));
    assert.deepStrictEqual(
        JSON.parse(readFileSync(indexPath, 'utf8')).entries.map(
            (entry: { version: string }) => entry.version,
        ),
        ['1.115.0'],
    );

    const indexBeforePreview = readFileSync(indexPath, 'utf8');
    const previewMarkerPath = join(directory, 'preview-marker.json');
    const preview = runGenerator(
        [
            '--version',
            'pr-99999',
            '--previous-version',
            '1.115.0',
            '--last-tag',
            'HEAD',
            '--out',
            previewMarkerPath,
            '--index',
            indexPath,
        ],
        { RELEASE_SAFETY_MARKER_ENABLED: 'true' },
    );
    assert.strictEqual(preview.status, 0, preview.stderr);
    assert.doesNotMatch(preview.stderr, /\[release-safety\] FAILED/);
    assert.match(preview.stdout, new RegExp(`wrote ${previewMarkerPath}`));
    assert.doesNotMatch(preview.stdout, new RegExp(`wrote ${indexPath}`));
    assert.match(
        preview.stdout,
        /synthetic version pr-99999; not updating the cumulative index/,
    );
    assert.strictEqual(readFileSync(indexPath, 'utf8'), indexBeforePreview);
    assert.strictEqual(
        JSON.parse(readFileSync(previewMarkerPath, 'utf8')).version,
        'pr-99999',
    );
} finally {
    rmSync(directory, { recursive: true, force: true });
}

console.log('gen-release-safety-cli: all tests passed');
