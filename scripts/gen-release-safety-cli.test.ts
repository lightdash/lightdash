import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface CliResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

function runGenerator(args: string[]): CliResult {
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

    const degraded = runGenerator([
        '--version',
        '1.115.0',
        '--last-tag',
        'not-a-release-safety-test-ref',
    ]);
    assert.strictEqual(degraded.status, 0, degraded.stderr);
    const degradedMarker = markerFrom(degraded.stdout);
    assert.deepStrictEqual(degradedMarker.migrations, {
        present: 'unknown',
        count: 0,
        coreCount: 0,
        eeCount: 0,
        files: [],
    });
} finally {
    rmSync(directory, { recursive: true, force: true });
}

console.log('gen-release-safety-cli: all tests passed');
