import { type DataAppCode, type DataAppDependencies } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    appFolderName,
    applySdkMirrorToTemplateDeps,
    attachDependenciesToCode,
    buildDepsWarningLines,
    buildImportBody,
    readBundleFromDir,
    readDependenciesFromDir,
    retargetManifest,
    writeBundleToDir,
    writeContextToDir,
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

    it('forces a create when createNew is set, even in the same project', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', { createNew: true });
        expect(body.targetAppUuid).toBeUndefined();
    });

    it('createNew overrides an explicit app target', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', {
            app: 'explicit-app-uuid',
            createNew: true,
        });
        expect(body.targetAppUuid).toBeUndefined();
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

describe('retargetManifest', () => {
    it('rewrites appUuid, projectUuid and version, preserving other fields', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-app-'));
        await writeBundleToDir(dir, bundle);
        await retargetManifest(dir, {
            appUuid: 'new-app-uuid',
            projectUuid: 'new-proj-uuid',
            version: 1,
        });
        const read = await readBundleFromDir(dir);
        expect(read.manifest.appUuid).toBe('new-app-uuid');
        expect(read.manifest.projectUuid).toBe('new-proj-uuid');
        expect(read.manifest.version).toBe(1);
        expect(read.manifest.name).toBe('N');
        expect(read.manifest.downloadedAt).toBe('2026-06-30T00:00:00.000Z');
    });
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

it('writes context files under .lightdash/context and skips null parameters', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-ctx-'));
    await writeContextToDir(dir, {
        semanticLayer: {
            path: '.lightdash/context/semantic-layer.yml',
            contentBase64: Buffer.from('models: []').toString('base64'),
        },
        parameters: null,
        promptHistory: {
            path: '.lightdash/context/prompt-history.md',
            contentBase64: Buffer.from('# prompts').toString('base64'),
        },
        theme: {
            instructions: {
                path: '.lightdash/context/theme/instructions.md',
                contentBase64: Buffer.from('# theme').toString('base64'),
            },
            assets: [],
            skippedAssetCount: 0,
        },
    });
    expect(
        await fs.readFile(
            path.join(dir, '.lightdash/context/semantic-layer.yml'),
            'utf-8',
        ),
    ).toBe('models: []');
    expect(
        await fs.readFile(
            path.join(dir, '.lightdash/context/theme/instructions.md'),
            'utf-8',
        ),
    ).toBe('# theme');
    await expect(
        fs.access(path.join(dir, '.lightdash/context/parameters.yml')),
    ).rejects.toThrow();
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

    // generateSlug returns a RANDOM string for names that sanitize to nothing,
    // which would give an unnamed app a different folder on every download.
    it('uses a stable untitled-app-<uuid8> folder for an empty name', () => {
        const uuid = 'abcd1234-ef56-7890-ab12-cdef01234567';
        expect(appFolderName('', uuid, new Set())).toBe(
            'untitled-app-abcd1234',
        );
        // Deterministic: a re-download must land in the same folder.
        expect(appFolderName('', uuid, new Set())).toBe(
            'untitled-app-abcd1234',
        );
    });

    it('uses the stable fallback for a name with no alphanumeric characters', () => {
        expect(
            appFolderName(
                '!!!',
                'abcd1234-ef56-7890-ab12-cdef01234567',
                new Set(),
            ),
        ).toBe('untitled-app-abcd1234');
    });
});

// ─── readDependenciesFromDir ──────────────────────────────────────────────────

const makePackageJson = (deps: Record<string, string> = {}): string =>
    JSON.stringify({ name: 'test-app', dependencies: deps });

const LOCKFILE_CONTENT = 'lockfileVersion: 9.0\n\npackages:\n  react@19.0.0:\n';

describe('readDependenciesFromDir', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-deps-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('returns null when neither package.json nor pnpm-lock.yaml exist', async () => {
        expect(await readDependenciesFromDir(dir)).toBeNull();
    });

    it('returns the deps pair when both files are present', async () => {
        await fs.writeFile(path.join(dir, 'package.json'), makePackageJson());
        await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), LOCKFILE_CONTENT);
        const result = await readDependenciesFromDir(dir);
        expect(result).not.toBeNull();
        expect(result?.packageJson).toBe(makePackageJson());
        expect(result?.lockfile).toBe(LOCKFILE_CONTENT);
    });

    it('throws when package.json exists but pnpm-lock.yaml is absent', async () => {
        await fs.writeFile(path.join(dir, 'package.json'), makePackageJson());
        await expect(readDependenciesFromDir(dir)).rejects.toThrow(
            /pnpm-lock\.yaml/,
        );
    });

    it('throws when pnpm-lock.yaml exists but package.json is absent', async () => {
        await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), LOCKFILE_CONTENT);
        await expect(readDependenciesFromDir(dir)).rejects.toThrow(
            /package\.json/,
        );
    });
});

// ─── buildDepsWarningLines ────────────────────────────────────────────────────

describe('buildDepsWarningLines', () => {
    const TEMPLATE: Record<string, string> = {
        react: '19.2.5',
        lodash: '4.17.21',
    };

    it('labels a brand-new package as "not in default template"', () => {
        const lines = buildDepsWarningLines({ 'my-lib': '^2.0.0' }, TEMPLATE);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('my-lib@^2.0.0');
        expect(lines[0]).toContain('not in default template');
    });

    it('labels a version override with the template version', () => {
        const lines = buildDepsWarningLines({ react: '18.3.1' }, TEMPLATE);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('react@18.3.1');
        expect(lines[0]).toContain('overrides template 19.2.5');
    });

    it('returns one line per custom package', () => {
        const custom = { 'pkg-a': '^1.0.0', 'pkg-b': '2.0.0' };
        const lines = buildDepsWarningLines(custom, TEMPLATE);
        expect(lines).toHaveLength(2);
    });

    it('returns an empty array when there are no custom deps', () => {
        expect(buildDepsWarningLines({}, TEMPLATE)).toEqual([]);
    });
});

// ─── attachDependenciesToCode ─────────────────────────────────────────────────

describe('attachDependenciesToCode', () => {
    const baseCode = makeCode('app-1', 'proj-1');
    const deps: DataAppDependencies = {
        packageJson: makePackageJson({ react: '18.3.1' }),
        lockfile: LOCKFILE_CONTENT,
    };

    it('returns the original code object (by reference) when customDeps is empty', () => {
        const result = attachDependenciesToCode(baseCode, {}, deps);
        expect(result).toBe(baseCode);
        expect(result.dependencies).toBeUndefined();
    });

    it('returns a new code object with dependencies attached when customDeps is non-empty', () => {
        const result = attachDependenciesToCode(
            baseCode,
            { react: '18.3.1' },
            deps,
        );
        expect(result).not.toBe(baseCode);
        expect(result.dependencies).toEqual(deps);
    });

    it('preserves all other code fields when attaching dependencies', () => {
        const result = attachDependenciesToCode(
            baseCode,
            { react: '18.3.1' },
            deps,
        );
        expect(result.manifest).toBe(baseCode.manifest);
        expect(result.files).toBe(baseCode.files);
    });
});

describe('applySdkMirrorToTemplateDeps', () => {
    const template = {
        '@lightdash/query-sdk': '0.3326.1',
        react: '19.2.5',
    };

    it('mirrors the declared SDK spec so an older pin never counts as custom', () => {
        const result = applySdkMirrorToTemplateDeps(
            template,
            JSON.stringify({
                dependencies: { '@lightdash/query-sdk': '0.3315.3' },
            }),
        );
        expect(result['@lightdash/query-sdk']).toBe('0.3315.3');
        expect(result.react).toBe('19.2.5');
    });

    it('leaves the baseline untouched when the SDK is not declared', () => {
        const result = applySdkMirrorToTemplateDeps(
            template,
            JSON.stringify({ dependencies: { react: '19.2.5' } }),
        );
        expect(result).toEqual(template);
    });

    it('leaves the baseline untouched for unparseable packageJson', () => {
        expect(applySdkMirrorToTemplateDeps(template, 'not-json')).toEqual(
            template,
        );
    });
});
