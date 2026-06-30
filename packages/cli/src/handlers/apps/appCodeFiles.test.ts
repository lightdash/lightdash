import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    appFolderName,
    readBundleFromDir,
    writeBundleToDir,
} from './appCodeFiles';

const bundle = {
    manifest: {
        codeVersion: 1 as const,
        appUuid: 'a',
        projectUuid: 'p',
        version: 1,
        name: 'N',
        description: '',
        template: null,
        downloadedAt: '2026-06-30T00:00:00.000Z',
    },
    files: [
        {
            path: 'assets/app.js',
            contentBase64: Buffer.from('console.log(1)').toString('base64'),
        },
        {
            path: 'index.html',
            contentBase64: Buffer.from('<html>').toString('base64'),
        },
    ],
};

it('writes then reads back an identical bundle', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-app-'));
    await writeBundleToDir(dir, bundle);
    expect(await fs.readFile(path.join(dir, 'assets/app.js'), 'utf-8')).toBe(
        'console.log(1)',
    );
    const read = await readBundleFromDir(dir);
    expect(read).toEqual(bundle);
});

it('refuses to write a file whose path escapes the target directory', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-app-'));
    await expect(
        writeBundleToDir(dir, {
            ...bundle,
            files: [
                {
                    path: '../escape.js',
                    contentBase64: Buffer.from('x').toString('base64'),
                },
            ],
        }),
    ).rejects.toThrow(/outside the target directory/);
});

it('writes a manifest-only bundle with no files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-app-'));
    await writeBundleToDir(dir, { ...bundle, files: [] });
    const read = await readBundleFromDir(dir);
    expect(read).toEqual({ ...bundle, files: [] });
});

it('throws a clear error when the manifest is not valid YAML', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-app-'));
    await fs.writeFile(
        path.join(dir, 'lightdash-app.yml'),
        'foo: [bar',
        'utf-8',
    );
    await expect(readBundleFromDir(dir)).rejects.toThrow(
        /Could not parse lightdash-app\.yml/,
    );
});

describe('appFolderName', () => {
    it('returns the slugified name when no collision', () => {
        const taken = new Set<string>();
        expect(
            appFolderName(
                'My Sales App',
                'abcd1234-ef56-7890-ab12-cdef01234567',
                taken,
            ),
        ).toBe('my-sales-app');
    });

    it('returns uuid-suffixed name on collision (first 8 chars of UUID)', () => {
        const taken = new Set(['my-sales-app']);
        // UUID first 8 chars: 'abcd1234'
        expect(
            appFolderName(
                'My Sales App',
                'abcd1234-ef56-7890-ab12-cdef01234567',
                taken,
            ),
        ).toBe('my-sales-app-abcd1234');
    });

    it('produces distinct names for two colliding apps with different UUIDs', () => {
        const taken = new Set(['my-sales-app']);
        // First UUID: 'aaaa1111-...' → suffix 'aaaa1111'
        const first = appFolderName(
            'My Sales App',
            'aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee',
            taken,
        );
        taken.add(first);
        // Second UUID: 'cccc2222-...' → suffix 'cccc2222'
        const second = appFolderName(
            'My Sales App',
            'cccc2222-dddd-eeee-ffff-000000000000',
            taken,
        );
        expect(first).not.toBe(second);
        expect(first).toBe('my-sales-app-aaaa1111');
        expect(second).toBe('my-sales-app-cccc2222');
    });
});
