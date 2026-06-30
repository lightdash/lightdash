import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readBundleFromDir, writeBundleToDir } from './appCodeFiles';

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
