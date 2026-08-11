import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const releaseConfig = require('../release.config');

const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'release-safety-release-config-'),
);

try {
    fs.mkdirSync(path.join(temporaryDirectory, 'scripts'));
    for (const fileName of [
        'release-safety.schema.json',
        'release-safety-index.schema.json',
    ]) {
        fs.copyFileSync(
            path.join('scripts', fileName),
            path.join(temporaryDirectory, 'scripts', fileName),
        );
    }
    fs.copyFileSync(
        'release-safety-index.json',
        path.join(temporaryDirectory, 'release-safety-index.json'),
    );

    const marker = JSON.parse(
        fs.readFileSync('release-safety.json', 'utf-8'),
    );
    marker.unexpectedGeneratedField = true;
    fs.writeFileSync(
        path.join(temporaryDirectory, 'release-safety.json'),
        `${JSON.stringify(marker, null, 2)}\n`,
    );

    assert.throws(
        () =>
            execFileSync(
                'tsx',
                [path.resolve('scripts/release-safety-schema.test.ts')],
                {
                    cwd: temporaryDirectory,
                    encoding: 'utf-8',
                    stdio: 'pipe',
                },
            ),
        (error: unknown) => {
            const result = error as { status?: number; stderr?: string };
            return (
                result.status === 1 &&
                result.stderr?.includes('unexpectedGeneratedField') === true
            );
        },
    );
} finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

const generationIndex = releaseConfig.plugins.findIndex((plugin: unknown) =>
    Array.isArray(plugin) &&
    plugin[0] === '@semantic-release/exec' &&
    plugin[1]?.prepareCmd?.includes('scripts/gen-release-safety.ts'),
);
const validationIndex = releaseConfig.plugins.findIndex((plugin: unknown) =>
    Array.isArray(plugin) &&
    plugin[0] === '@semantic-release/exec' &&
    plugin[1]?.prepareCmd ===
        'pnpm exec tsx scripts/release-safety-schema.test.ts',
);

assert.notStrictEqual(generationIndex, -1);
assert.strictEqual(validationIndex, generationIndex + 1);

console.log('release-safety-release-config: all tests passed');
