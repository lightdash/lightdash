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
    fs.copyFileSync(
        path.join('scripts', 'release-safety.schema.json'),
        path.join(temporaryDirectory, 'scripts', 'release-safety.schema.json'),
    );
    const indexSchemaPath = path.join(
        'packages',
        'cli',
        'src',
        'releaseSafety',
        'release-safety-index.schema.json',
    );
    fs.mkdirSync(path.join(temporaryDirectory, path.dirname(indexSchemaPath)), {
        recursive: true,
    });
    fs.copyFileSync(
        indexSchemaPath,
        path.join(temporaryDirectory, indexSchemaPath),
    );
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
