import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { prepareAssets, upload } from './upload-static-assets.mts';

test('filters debug files, preserves nested assets and refuses empty publication', () => {
    const root = mkdtempSync(join(tmpdir(), 'assets-test-'));
    try {
        mkdirSync(join(root, 'nested'));
        const chunk = join(root, 'nested/chunk-abc.js');
        writeFileSync(chunk, 'export default 1');
        for (const suffix of ['.map', '.gzip', '.gz', '.br']) {
            writeFileSync(`${chunk}${suffix}`, 'excluded');
        }
        assert.deepEqual(prepareAssets(root), [
            {
                path: 'nested/chunk-abc.js',
                sha256: createHash('sha256')
                    .update('export default 1')
                    .digest('hex'),
            },
        ]);
        assert.equal(existsSync(`${chunk}.map`), false);
        unlinkSync(chunk);
        assert.throws(() => prepareAssets(root), /no JavaScript/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('rejects symlinks and unsupported asset paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'assets-test-'));
    try {
        writeFileSync(join(root, 'chunk.js'), 'export default 1');
        symlinkSync(join(root, 'chunk.js'), join(root, 'linked.js'));
        assert.throws(() => prepareAssets(root), /symlink/);
        unlinkSync(join(root, 'linked.js'));
        writeFileSync(join(root, 'unsafe name.js'), 'bad');
        assert.throws(() => prepareAssets(root), /Unsupported asset path/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('republishes identical bytes and only marks successful uploads', () => {
    const commands: string[][] = [];
    const manifests: unknown[] = [];
    const temporaryRoots: string[] = [];
    const execute = (command: string, args: string[]): string => {
        commands.push([command, ...args]);
        if (command === 'docker' && args[0] === 'image') {
            return 'sha256:exact-image';
        }
        if (command === 'docker' && args[0] === 'create') {
            assert.equal(args.at(-1), 'sha256:exact-image');
            return 'container';
        }
        if (command === 'docker' && args[0] === 'cp') {
            const directory = args[2];
            temporaryRoots.push(dirname(directory));
            mkdirSync(directory);
            writeFileSync(join(directory, 'chunk.js'), 'export default 1');
        }
        if (command === 'gsutil' && args.at(-1)?.endsWith('.json')) {
            manifests.push(JSON.parse(readFileSync(args[3], 'utf8')));
        }
        return '';
    };
    const image = 'registry.example/app:1';
    for (let attempt = 0; attempt < 2; attempt += 1) {
        upload({
            image,
            buckets: ['bucket-us', 'bucket-eu', 'bucket-us'],
            run: execute,
        });
    }
    const copies = commands.filter(
        ([command, ...args]) => command === 'gsutil' && args.includes('-r'),
    );
    assert.equal(copies.length, 4);
    assert.ok(copies.every((args) => !args.includes('-n')));
    const expected = {
        image,
        imageId: 'sha256:exact-image',
        assets: [
            {
                path: 'chunk.js',
                sha256: createHash('sha256')
                    .update('export default 1')
                    .digest('hex'),
            },
        ],
    };
    assert.deepEqual(
        manifests,
        Array.from({ length: 4 }, () => expected),
    );
    assert.ok(temporaryRoots.every((root) => !existsSync(root)));

    commands.length = 0;
    assert.throws(
        () =>
            upload({
                image,
                buckets: ['bucket-us'],
                run: (command, args) => {
                    const result = execute(command, args);
                    if (command === 'gsutil' && args.includes('-r')) {
                        throw new Error('upload failed');
                    }
                    return result;
                },
            }),
        /upload failed/,
    );
    assert.ok(!commands.some((args) => args.at(-1)?.endsWith('.json')));
    assert.ok(temporaryRoots.every((root) => !existsSync(root)));
});

test('failed extraction removes the container and temporary directory without upload', () => {
    const commands: string[][] = [];
    let root = '';
    assert.throws(
        () =>
            upload({
                image: 'registry.example/app:1',
                buckets: ['bucket-us'],
                run: (command, args) => {
                    commands.push([command, ...args]);
                    if (command === 'docker' && args[0] === 'create') {
                        return 'container';
                    }
                    if (command === 'docker' && args[0] === 'cp') {
                        root = dirname(args[2]);
                        throw new Error('extraction failed');
                    }
                    return 'image';
                },
            }),
        /extraction failed/,
    );
    assert.ok(
        commands.some(
            (args) =>
                JSON.stringify(args) ===
                JSON.stringify(['docker', 'rm', 'container']),
        ),
    );
    assert.ok(!commands.some(([command]) => command === 'gsutil'));
    assert.ok(root && !existsSync(root));
});
