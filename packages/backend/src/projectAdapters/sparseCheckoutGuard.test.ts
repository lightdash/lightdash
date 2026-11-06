import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    assertSparseCheckoutComplete,
    findSparseCheckoutEscapes,
} from './sparseCheckoutGuard';

const withProject = async (
    run: (root: string, project: string) => Promise<void>,
) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sparse-guard-'));
    const project = path.join(root, 'analytics/dbt');
    try {
        await fs.mkdir(project, { recursive: true });
        await fs.writeFile(
            path.join(project, 'dbt_project.yml'),
            'name: fixture\nmodel-paths: [models]\n',
        );
        await run(root, project);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
};

it('accepts a self-contained project with absent optional dependency files', async () => {
    await withProject(async (root) => {
        await expect(
            assertSparseCheckoutComplete(root, 'analytics/dbt'),
        ).resolves.toBeUndefined();
    });
});

it.each(['packages.yml', 'dependencies.yml'])(
    'loads local references from %s',
    async (file) => {
        await withProject(async (root, project) => {
            await fs.writeFile(
                path.join(project, file),
                'packages:\n  - local: ../shared\n',
            );
            await expect(
                assertSparseCheckoutComplete(root, 'analytics/dbt'),
            ).rejects.toThrow(`${file} packages[0].local (outside-cone)`);
        });
    },
);

it('recursively checks in-cone local packages', async () => {
    await withProject(async (root, project) => {
        const local = path.join(project, 'pkg');
        await fs.mkdir(local);
        await fs.writeFile(
            path.join(project, 'packages.yml'),
            'packages:\n  - local: ./pkg\n',
        );
        await fs.writeFile(
            path.join(local, 'dbt_project.yml'),
            'name: local\n',
        );
        await fs.writeFile(
            path.join(local, 'packages.yml'),
            'packages:\n  - local: ../../shared\n',
        );
        await expect(
            assertSparseCheckoutComplete(root, 'analytics/dbt'),
        ).rejects.toThrow(
            'analytics/dbt/pkg/packages.yml packages[0].local (outside-cone)',
        );
    });
});

it('does not loop when safe local packages refer back to an already-checked project', async () => {
    await withProject(async (root, project) => {
        const local = path.join(project, 'pkg');
        await fs.mkdir(local);
        await fs.writeFile(
            path.join(project, 'packages.yml'),
            'packages:\n  - local: ./pkg\n',
        );
        await fs.writeFile(
            path.join(local, 'dbt_project.yml'),
            'name: local\n',
        );
        await fs.writeFile(
            path.join(local, 'packages.yml'),
            'packages:\n  - local: ..\n',
        );
        await expect(
            assertSparseCheckoutComplete(root, 'analytics/dbt'),
        ).resolves.toBeUndefined();
    });
});

it('rejects a missing project configuration', async () => {
    await withProject(async (root, project) => {
        await fs.rm(path.join(project, 'dbt_project.yml'));
        await expect(
            assertSparseCheckoutComplete(root, 'analytics/dbt'),
        ).rejects.toThrow('analytics/dbt/dbt_project.yml');
    });
});

it.each(['dbt_project.yml', 'packages.yml', 'dependencies.yml'])(
    'rejects invalid YAML without echoing its contents from %s',
    async (file) => {
        await withProject(async (root, project) => {
            await fs.writeFile(
                path.join(project, file),
                'secret: fixture-only-secret\ninvalid: [\n',
            );
            const work = assertSparseCheckoutComplete(root, 'analytics/dbt');
            await expect(work).rejects.toThrow(
                `${file} is missing, unreadable or invalid YAML`,
            );
            await expect(work).rejects.not.toThrow('fixture-only-secret');
        });
    },
);

it('rejects a symlinked project ancestor before reading any YAML', async () => {
    await withProject(async (root) => {
        await fs.rename(
            path.join(root, 'analytics'),
            path.join(root, 'actual'),
        );
        await fs.symlink('actual', path.join(root, 'analytics'));
        const read = vi.spyOn(fs, 'readFile');
        try {
            await expect(
                assertSparseCheckoutComplete(root, 'analytics/dbt'),
            ).rejects.toThrow('project directory must be a real directory');
            expect(read).not.toHaveBeenCalled();
        } finally {
            read.mockRestore();
        }
    });
});

it('rejects a symlinked configuration before reading its target', async () => {
    await withProject(async (root, project) => {
        await fs.rename(
            path.join(project, 'dbt_project.yml'),
            path.join(project, 'source.yml'),
        );
        await fs.symlink('source.yml', path.join(project, 'dbt_project.yml'));
        const read = vi.spyOn(fs, 'readFile');
        try {
            await expect(
                assertSparseCheckoutComplete(root, 'analytics/dbt'),
            ).rejects.toThrow('must be a regular file');
            expect(read).not.toHaveBeenCalled();
        } finally {
            read.mockRestore();
        }
    });
});

it('rejects a local package reached through a symlinked intermediate directory', async () => {
    await withProject(async (root, project) => {
        const local = path.join(project, 'actual/pkg');
        await fs.mkdir(local, { recursive: true });
        await fs.writeFile(
            path.join(local, 'dbt_project.yml'),
            'name: local\n',
        );
        await fs.symlink('actual', path.join(project, 'alias'));
        await fs.writeFile(
            path.join(project, 'packages.yml'),
            'packages:\n  - local: ./alias/pkg\n',
        );
        await expect(
            assertSparseCheckoutComplete(root, 'analytics/dbt'),
        ).rejects.toThrow('packages.yml packages[0].local (not-a-directory)');
    });
});

it.each([false, true])(
    'rejects an escaping symlink even in output-named directories (absolute=%s)',
    async (absolute) => {
        await withProject(async (root, project) => {
            const sibling = path.join(root, 'analytics/shared');
            await fs.mkdir(sibling);
            await fs.mkdir(path.join(project, 'target'));
            await fs.symlink(
                absolute ? sibling : '../../shared',
                path.join(project, 'target/models'),
            );
            await expect(
                assertSparseCheckoutComplete(root, 'analytics/dbt'),
            ).rejects.toThrow('analytics/dbt/target/models symlink');
        });
    },
);

it('accepts a kept checkout with an absolute dbt package symlink inside the cone', async () => {
    await withProject(async (root, project) => {
        await fs.mkdir(path.join(project, 'local_pkg'));
        await fs.mkdir(path.join(project, 'dbt_packages'));
        await fs.symlink(
            path.join(project, 'local_pkg'),
            path.join(project, 'dbt_packages/pkg'),
        );
        await expect(
            assertSparseCheckoutComplete(root, 'analytics/dbt'),
        ).resolves.toBeUndefined();
    });
});

it('does not skip an escaping installed-package symlink', async () => {
    await withProject(async (root, project) => {
        const sibling = path.join(root, 'analytics/shared');
        await fs.mkdir(sibling);
        await fs.mkdir(path.join(project, 'dbt_packages'));
        await fs.symlink(sibling, path.join(project, 'dbt_packages/pkg'));
        await expect(
            assertSparseCheckoutComplete(root, 'analytics/dbt'),
        ).rejects.toThrow('analytics/dbt/dbt_packages/pkg symlink');
    });
});

it('rejects dangling links rather than guessing their eventual target', async () => {
    await withProject(async (root, project) => {
        await fs.symlink('missing', path.join(project, 'macros'));
        await expect(
            assertSparseCheckoutComplete(root, 'analytics/dbt'),
        ).rejects.toThrow('analytics/dbt/macros symlink');
    });
});

it('preserves the cancellation reason before filesystem preparation', async () => {
    const controller = new AbortController();
    const reason = new Error('Compile cancelled');
    controller.abort(reason);
    await expect(
        assertSparseCheckoutComplete(
            '/does-not-exist',
            'analytics/dbt',
            controller.signal,
        ),
    ).rejects.toBe(reason);
});

it.each([
    { file: 'packages.yml', content: '' },
    { file: 'dependencies.yml', content: '# placeholder\n' },
    { file: 'packages.yml', content: 'null\n' },
])('accepts an empty optional $file', async ({ file, content }) => {
    await withProject(async (root, project) => {
        await fs.writeFile(path.join(project, file), content);
        await expect(
            assertSparseCheckoutComplete(root, 'analytics/dbt'),
        ).resolves.toBeUndefined();
    });
});

it('canonicalizes the repository root before validating the selected directory', async () => {
    await withProject(async (root) => {
        const alias = path.join(root, 'system-style-alias');
        await fs.symlink(root, alias);
        await expect(
            assertSparseCheckoutComplete(alias, 'analytics/dbt'),
        ).resolves.toBeUndefined();
    });
});

it.each(['packages.yml', 'dependencies.yml'])(
    'does not treat a dangling optional %s symlink as a missing file',
    async (file) => {
        await withProject(async (root, project) => {
            await fs.symlink('missing', path.join(project, file));
            await expect(
                assertSparseCheckoutComplete(root, 'analytics/dbt'),
            ).rejects.toThrow(`${file} must be a regular file`);
        });
    },
);

it('identifies a missing local package without echoing its unverified path value', async () => {
    await withProject(async (root, project) => {
        await fs.writeFile(
            path.join(project, 'packages.yml'),
            'packages:\n  - local: ./missing-fixture-only-secret\n',
        );
        const work = assertSparseCheckoutComplete(root, 'analytics/dbt');
        await expect(work).rejects.toThrow(
            'packages.yml packages[0].local (missing-package)',
        );
        await expect(work).rejects.not.toThrow('fixture-only-secret');
    });
});

it('rejects URI-valued local paths without exposing their credentials', async () => {
    await withProject(async (root, project) => {
        await fs.writeFile(
            path.join(project, 'packages.yml'),
            'packages:\n  - local: https://fixture-user:fixture-token@example.test/package\n',
        );
        const work = assertSparseCheckoutComplete(root, 'analytics/dbt');
        await expect(work).rejects.toThrow(
            'packages.yml packages[0].local (unsupported-path)',
        );
        await expect(work).rejects.not.toThrow('fixture-token');
        await expect(work).rejects.not.toThrow('https:');
    });
});

it('reports unreadable configuration without leaking the filesystem error', async () => {
    await withProject(async (root) => {
        const read = vi.spyOn(fs, 'readFile').mockRejectedValueOnce(
            Object.assign(new Error('fixture-only-sensitive-content'), {
                code: 'EACCES',
            }),
        );
        try {
            const work = assertSparseCheckoutComplete(root, 'analytics/dbt');
            await expect(work).rejects.toThrow(
                'dbt_project.yml is missing, unreadable or invalid YAML',
            );
            await expect(work).rejects.not.toThrow(
                'fixture-only-sensitive-content',
            );
        } finally {
            read.mockRestore();
        }
    });
});

it('caps reported entries and omits raw configuration values', async () => {
    await withProject(async (root, project) => {
        const paths = Array.from(
            { length: 25 },
            (_, index) => `../do-not-echo-${index}`,
        );
        await fs.writeFile(
            path.join(project, 'dbt_project.yml'),
            `model-paths: ${JSON.stringify(paths)}\n`,
        );
        const work = assertSparseCheckoutComplete(root, 'analytics/dbt');
        await expect(work).rejects.toThrow('model-paths[19] (outside-cone)');
        await expect(work).rejects.not.toThrow('model-paths[20]');
        await expect(work).rejects.not.toThrow('do-not-echo');
        await expect(work).rejects.toThrow('dbt-sparse-git-checkout');
    });
});

const input = (project: unknown) => ({
    dir: 'analytics/dbt',
    project,
    packages: [],
    symlinks: [],
});

it('reports dbt model directories excluded by the selected cone', () => {
    expect(
        findSparseCheckoutEscapes('analytics/dbt', {
            dir: 'analytics/dbt',
            project: { 'model-paths': ['models', '../shared/models'] },
            packages: [],
            symlinks: [],
        }),
    ).toEqual([
        {
            file: 'analytics/dbt/dbt_project.yml',
            key: 'model-paths[1]',
            value: '../shared/models',
            reason: 'outside-cone',
        },
    ]);
});

it.each([
    'macro-paths',
    'seed-paths',
    'snapshot-paths',
    'analysis-paths',
    'test-paths',
    'docs-paths',
    'asset-paths',
    'source-paths',
    'data-paths',
])('rejects an excluded directory in %s', (key) => {
    expect(
        findSparseCheckoutEscapes(
            'analytics/dbt',
            input({ [key]: ['../shared'] }),
        ),
    ).toEqual([
        {
            file: 'analytics/dbt/dbt_project.yml',
            key: `${key}[0]`,
            value: '../shared',
            reason: 'outside-cone',
        },
    ]);
});

it.each(['/tmp/models', '../../other/models', 'C:\\models'])(
    'rejects unsupported absolute or escaping model path %j',
    (value) => {
        expect(
            findSparseCheckoutEscapes(
                'analytics/dbt',
                input({ 'model-paths': [value] }),
            ),
        ).toEqual([
            {
                file: 'analytics/dbt/dbt_project.yml',
                key: 'model-paths[0]',
                value,
                reason: 'outside-cone',
            },
        ]);
    },
);

it('refuses unresolved path templates instead of guessing their location', () => {
    expect(
        findSparseCheckoutEscapes(
            'analytics/dbt',
            input({ 'model-paths': ["{{ env_var('MODEL_DIR') }}"] }),
        ),
    ).toEqual([
        expect.objectContaining({
            key: 'model-paths[0]',
            reason: 'unresolved-template',
        }),
    ]);
});

it.each(['models', [1], null])('rejects invalid path-list type %j', (value) => {
    expect(
        findSparseCheckoutEscapes(
            'analytics/dbt',
            input({ 'model-paths': value }),
        ),
    ).toEqual([
        expect.objectContaining({ key: 'model-paths', reason: 'invalid-type' }),
    ]);
});

it('rejects a package-install directory outside the selected project', () => {
    expect(
        findSparseCheckoutEscapes(
            'analytics/dbt',
            input({ 'packages-install-path': '../packages' }),
        ),
    ).toEqual([
        expect.objectContaining({
            key: 'packages-install-path',
            reason: 'outside-cone',
        }),
    ]);
});

it('identifies the source file for an excluded local package', () => {
    expect(
        findSparseCheckoutEscapes('analytics/dbt', {
            ...input({}),
            packages: [
                {
                    file: 'analytics/dbt/dependencies.yml',
                    content: { packages: [{ local: '../shared' }] },
                },
            ],
        }),
    ).toEqual([
        {
            file: 'analytics/dbt/dependencies.yml',
            key: 'packages[0].local',
            value: '../shared',
            reason: 'outside-cone',
        },
    ]);
});

it('rejects escaping symlinks without following them', () => {
    expect(
        findSparseCheckoutEscapes('analytics/dbt', {
            ...input({}),
            symlinks: [
                { path: 'analytics/dbt/macros', target: '../shared/macros' },
            ],
        }),
    ).toEqual([
        {
            file: 'analytics/dbt/macros',
            key: 'symlink',
            value: '../shared/macros',
            reason: 'symlink',
        },
    ]);
});
