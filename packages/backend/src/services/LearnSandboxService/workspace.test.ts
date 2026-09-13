import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    isEditablePath,
    loadLearnBundle,
    materialiseWorkspace,
    validateYaml,
} from './workspace';

describe('workspace helpers', () => {
    it('isEditablePath allows models yml only', () => {
        expect(isEditablePath('models/orders.yml')).toBe(true);
        expect(isEditablePath('models/nested/a.yml')).toBe(true);
        expect(isEditablePath('models/orders.sql')).toBe(false);
        expect(isEditablePath('dbt_project.yml')).toBe(false);
        expect(isEditablePath('models/../dbt_project.yml')).toBe(false);
        expect(isEditablePath('/models/a.yml')).toBe(false);
    });
    it('validateYaml reports a parse error', () => {
        expect(validateYaml('a: 1\n')).toBeNull();
        expect(validateYaml('a: [1,\n')).toMatch(/./);
    });
    it('loads the shipped bundle', async () => {
        const bundle = await loadLearnBundle();
        expect(bundle.version).toBe(1);
        expect(bundle.files.some((f) => f.path === 'dbt_project.yml')).toBe(
            true,
        );
    });
    it('materialises bundle plus overlay and writes profiles.yml', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'learn-ws-'));
        try {
            await materialiseWorkspace({
                bundle: {
                    version: 1,
                    files: [
                        {
                            path: 'dbt_project.yml',
                            content: 'name: jaffle_shop\n',
                        },
                        { path: 'models/orders.yml', content: 'version: 2\n' },
                    ],
                },
                overlay: [
                    {
                        path: 'models/orders.yml',
                        content: 'version: 2\nmodels: []\n',
                    },
                ],
                workspaceDir: dir,
                profiles: { databasePath: '/data/jaffle_shop.duckdb' },
            });
            expect(
                await readFile(
                    path.join(dir, 'project', 'models', 'orders.yml'),
                    'utf8',
                ),
            ).toBe('version: 2\nmodels: []\n');
            const profiles = await readFile(
                path.join(dir, 'profiles.yml'),
                'utf8',
            );
            expect(profiles).toContain('jaffle_shop:');
            expect(profiles).toContain('path: /data/jaffle_shop.duckdb');
            expect(profiles).toContain('access_mode: READ_ONLY');
            expect(
                (
                    await stat(path.join(dir, 'project', 'dbt_project.yml'))
                ).isFile(),
            ).toBe(true);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
    it('throws when an overlay path is not editable', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'learn-ws-'));
        try {
            await expect(
                materialiseWorkspace({
                    bundle: { version: 1, files: [] },
                    overlay: [
                        {
                            path: 'models/../dbt_project.yml',
                            content: 'name: jaffle_shop\n',
                        },
                    ],
                    workspaceDir: dir,
                    profiles: { databasePath: '/data/jaffle_shop.duckdb' },
                }),
            ).rejects.toThrow(
                'Refusing to materialise non-editable overlay path: models/../dbt_project.yml',
            );
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
