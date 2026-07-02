import { type DataAppCode } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    appFolderName,
    buildImportBody,
    readBundleFromDir,
    writeBundleToDir,
} from './appCodeFiles';

const makeCode = (appUuid: string, projectUuid: string): DataAppCode => ({
    manifest: {
        codeVersion: 1 as const,
        appUuid,
        projectUuid,
        version: 3,
        name: 'My App',
        description: '',
        template: null,
        downloadedAt: '2026-06-25T00:00:00.000Z',
    },
    files: [],
});

describe('buildImportBody', () => {
    it('sets targetAppUuid from manifest when uploading to the same project', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', {});
        expect(body.targetAppUuid).toBe('app-uuid-1');
    });

    it('leaves targetAppUuid undefined when uploading to a different project', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-OTHER', {});
        expect(body.targetAppUuid).toBeUndefined();
    });

    it('uses --app option regardless of project match', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', {
            app: 'explicit-app-uuid',
        });
        expect(body.targetAppUuid).toBe('explicit-app-uuid');
    });

    it('uses --app option even when project differs', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-OTHER', {
            app: 'explicit-app-uuid',
        });
        expect(body.targetAppUuid).toBe('explicit-app-uuid');
    });

    it('passes spaceUuid when --space is provided', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', {
            space: 'space-uuid-1',
        });
        expect(body.spaceUuid).toBe('space-uuid-1');
    });

    it('leaves spaceUuid undefined when --space is not provided', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', {});
        expect(body.spaceUuid).toBeUndefined();
    });

    it('includes the full code bundle in the body', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', {});
        expect(body.code).toBe(code);
    });
});

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
            path: 'src/assets/app.js',
            contentBase64: Buffer.from('console.log(1)').toString('base64'),
        },
        {
            path: 'src/index.html',
            contentBase64: Buffer.from('<html>').toString('base64'),
        },
    ],
};

it('writes then reads back an identical bundle', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-app-'));
    await writeBundleToDir(dir, bundle);
    expect(
        await fs.readFile(path.join(dir, 'src/assets/app.js'), 'utf-8'),
    ).toBe('console.log(1)');
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

it('upload reads back only src/ files, ignoring scaffolding and context', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-app-'));
    await writeBundleToDir(dir, bundle); // bundle.files are src/*
    // simulate Phase 2 extra files on disk:
    await fs.mkdir(path.join(dir, '.lightdash/context'), { recursive: true });
    await fs.mkdir(path.join(dir, '.claude/skills/x'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), '{"name":"x"}');
    await fs.writeFile(
        path.join(dir, '.lightdash/context/semantic-layer.yml'),
        'models: []',
    );
    await fs.writeFile(path.join(dir, '.claude/skills/x/SKILL.md'), '# skill');
    const read = await readBundleFromDir(dir);
    expect(read.files.every((f) => f.path.startsWith('src/'))).toBe(true);
    expect(read.files.map((f) => f.path).sort()).toEqual(
        bundle.files.map((f) => f.path).sort(),
    );
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
