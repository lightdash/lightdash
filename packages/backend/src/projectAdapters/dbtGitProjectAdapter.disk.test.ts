import { SupportedDbtVersions } from '@lightdash/common';
import fs from 'fs/promises';
import path from 'path';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';
import { GitRepository } from './gitRepository';

const buildAdapter = () =>
    new DbtGitProjectAdapter({
        warehouseClient: warehouseClientMock,
        repository: 'synthetic/leaf_a',
        remoteRepositoryUrl: 'https://example.com/leaf_a',
        gitBranch: 'main',
        projectDirectorySubPath: '.',
        dbtTarget: {
            kind: 'target',
            target: {
                type: 'postgres',
                host: 'localhost',
                user: 'synthetic',
                password: 'synthetic',
                dbname: 'synthetic',
                schema: 'public',
            },
            environment: {},
        },
        explicitCredentials: false,
        targetName: undefined,
        environment: undefined,
        environmentVariableAllowlist: [],
        cachedWarehouse: {
            warehouseCatalog: {},
            onWarehouseCatalogChange: vi.fn(),
        },
        dbtVersion: SupportedDbtVersions.V1_7,
        partialParseBaselinePath: null,
    });

describe('git adapter disk release', () => {
    afterEach(() => vi.restoreAllMocks());
    it('removes the checkout after client cleanup and supports later destroy', async () => {
        const adapter = buildAdapter();
        const directory = adapter.localRepositoryDir;
        await fs.mkdir(path.join(directory, 'dbt_packages'));
        const cleanup = vi
            .spyOn(adapter.dbtClient, 'cleanup')
            .mockImplementation(async () => {
                await expect(fs.stat(directory)).resolves.toBeDefined();
            });
        try {
            await adapter.releaseDisk();
            await expect(fs.stat(directory)).rejects.toMatchObject({
                code: 'ENOENT',
            });
            expect(cleanup).toHaveBeenCalledOnce();
            cleanup.mockResolvedValue(undefined);
            await expect(adapter.destroy()).resolves.toBeUndefined();
        } finally {
            await adapter.destroy();
        }
    });
    it('keeps the primary checkout and packages while releasing its target', async () => {
        const adapter = buildAdapter();
        const packages = path.join(adapter.localRepositoryDir, 'dbt_packages');
        await fs.mkdir(packages);
        const cleanup = vi
            .spyOn(adapter.dbtClient, 'cleanup')
            .mockResolvedValue(undefined);
        try {
            await adapter.releaseDisk({ keepProject: true });
            await expect(fs.stat(packages)).resolves.toBeDefined();
            expect(cleanup).toHaveBeenCalledOnce();
        } finally {
            await adapter.destroy();
        }
    });
    it('recreates through the same memoised preparation after eviction', async () => {
        const adapter = buildAdapter();
        const refresh = vi
            .spyOn(GitRepository.prototype, 'refresh')
            .mockImplementation(async () => {
                await fs.mkdir(adapter.localRepositoryDir, { recursive: true });
            });
        const deps = vi
            .spyOn(adapter.dbtClient, 'installDeps')
            .mockResolvedValue(undefined);
        try {
            await adapter.prepareDbtSource();
            await adapter.prepareDbtSource();
            expect(refresh).toHaveBeenCalledOnce();
            await adapter.releaseDisk();
            await adapter.prepareDbtSource();
            await adapter.prepareDbtSource();
            expect(refresh).toHaveBeenCalledTimes(2);
            expect(deps).toHaveBeenCalledTimes(2);
        } finally {
            await adapter.destroy();
        }
    });
    it('waits for an in-flight manifest before removing the checkout', async () => {
        const adapter = buildAdapter();
        vi.spyOn(GitRepository.prototype, 'refresh').mockResolvedValue(
            undefined,
        );
        vi.spyOn(adapter.dbtClient, 'installDeps').mockResolvedValue(undefined);
        let finish!: () => void;
        vi.spyOn(adapter.dbtClient, 'getDbtManifest').mockImplementation(
            async () => {
                await new Promise<void>((resolve) => {
                    finish = resolve;
                });
                await expect(
                    fs.stat(adapter.localRepositoryDir),
                ).resolves.toBeDefined();
                throw new Error('synthetic failure');
            },
        );
        const fetch = adapter.getDbtManifest().catch(() => undefined);
        await vi.waitFor(() => expect(finish).toBeDefined());
        let released = false;
        const release = adapter.releaseDisk().then(() => {
            released = true;
        });
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        expect(released).toBe(false);
        finish();
        await Promise.all([fetch, release]);
        await expect(fs.stat(adapter.localRepositoryDir)).rejects.toMatchObject(
            { code: 'ENOENT' },
        );
        await adapter.destroy();
    });
});
