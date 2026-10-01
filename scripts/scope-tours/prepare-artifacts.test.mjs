import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareArtifacts } from './prepare-artifacts.mjs';

const withArtifacts = (callback) => {
    const temporary = mkdtempSync(path.join(tmpdir(), 'scope-tours-prepare-'));
    try {
        const artifacts = ['generated.ts', 'curriculum.ts'].map((name) =>
            path.join(temporary, name),
        );
        artifacts.forEach((artifact) => writeFileSync(artifact, 'committed'));
        callback(artifacts);
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
};

test('keeps freshly generated artifacts when every command succeeds', () => {
    withArtifacts((artifacts) => {
        const ran = [];
        const warnings = [];

        const fresh = prepareArtifacts({
            artifacts,
            commands: ['generate', 'order'],
            run: (command) => {
                ran.push(command);
                artifacts.forEach((artifact) =>
                    writeFileSync(artifact, `fresh after ${command}`),
                );
            },
            warn: (message) => warnings.push(message),
        });

        assert.equal(fresh, true);
        assert.deepEqual(ran, ['generate', 'order']);
        assert.deepEqual(warnings, []);
        artifacts.forEach((artifact) =>
            assert.equal(readFileSync(artifact, 'utf8'), 'fresh after order'),
        );
    });
});

test('restores the committed artifacts and warns when a command fails', () => {
    withArtifacts((artifacts) => {
        const ran = [];
        const warnings = [];

        const fresh = prepareArtifacts({
            artifacts,
            commands: ['generate', 'order', 'check'],
            run: (command) => {
                ran.push(command);
                writeFileSync(artifacts[0], 'partially written');
                if (command === 'order')
                    throw new Error('Docs anchor not found');
            },
            warn: (message) => warnings.push(message),
        });

        assert.equal(fresh, false);
        assert.deepEqual(ran, ['generate', 'order']);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /order/);
        artifacts.forEach((artifact) =>
            assert.equal(readFileSync(artifact, 'utf8'), 'committed'),
        );
    });
});
