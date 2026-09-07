import {
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { createGithubGitCredentialFiles } from '../dbt/gitCredentials';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtGithubProjectAdapter } from './dbtGithubProjectAdapter';

vi.mock('../dbt/gitCredentials', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('../dbt/gitCredentials')>();
    return {
        ...actual,
        createGithubGitCredentialFiles: vi.fn(
            actual.createGithubGitCredentialFiles,
        ),
    };
});

describe('DbtGithubProjectAdapter', () => {
    beforeEach(() => {
        vi.mocked(createGithubGitCredentialFiles).mockClear();
    });

    it('uses a tokenless repository URL when no token is provided', async () => {
        const adapter = new DbtGithubProjectAdapter({
            warehouseClient: warehouseClientMock,
            githubPersonalAccessToken: '',
            githubRepository: 'org/repo',
            githubBranch: 'main',
            projectDirectorySubPath: '/',
            warehouseCredentials: {
                type: WarehouseTypes.POSTGRES,
                host: 'localhost',
                port: 5432,
                user: 'postgres',
                password: 'password',
                dbname: 'postgres',
                schema: 'public',
            } as CreateWarehouseCredentials,
            targetName: undefined,
            environment: undefined,
            environmentVariableAllowlist: [],
            cachedWarehouse: {
                warehouseCatalog: {},
                onWarehouseCatalogChange: vi.fn(),
            },
            dbtVersion: SupportedDbtVersions.V1_7,
        });

        expect(adapter.remoteRepositoryUrl).toBe(
            'https://github.com/org/repo.git',
        );

        await adapter.destroy();
    });

    it('percent-encodes repository URL credentials', async () => {
        const token = 'ghp_token/?#@:%';
        const adapter = new DbtGithubProjectAdapter({
            warehouseClient: warehouseClientMock,
            githubPersonalAccessToken: token,
            githubRepository: 'org/repo',
            githubBranch: 'main',
            projectDirectorySubPath: '/',
            warehouseCredentials: {
                type: WarehouseTypes.POSTGRES,
                host: 'localhost',
                port: 5432,
                user: 'postgres',
                password: 'password',
                dbname: 'postgres',
                schema: 'public',
            } as CreateWarehouseCredentials,
            targetName: undefined,
            environment: undefined,
            environmentVariableAllowlist: [],
            cachedWarehouse: {
                warehouseCatalog: {},
                onWarehouseCatalogChange: vi.fn(),
            },
            dbtVersion: SupportedDbtVersions.V1_7,
        });

        expect(adapter.remoteRepositoryUrl).toBe(
            'https://lightdash:ghp_token%2F%3F%23%40%3A%25@github.com/org/repo.git',
        );

        await adapter.destroy();
    });

    it('rejects option-like branches before creating credential files', () => {
        expect(
            () =>
                new DbtGithubProjectAdapter({
                    warehouseClient: warehouseClientMock,
                    githubPersonalAccessToken: 'ghp_token',
                    githubRepository: 'org/repo',
                    githubBranch: '--upload-pack=side-effect',
                    projectDirectorySubPath: '/',
                    warehouseCredentials: {
                        type: WarehouseTypes.POSTGRES,
                        host: 'localhost',
                        port: 5432,
                        user: 'postgres',
                        password: 'password',
                        dbname: 'postgres',
                        schema: 'public',
                    } as CreateWarehouseCredentials,
                    targetName: undefined,
                    environment: undefined,
                    environmentVariableAllowlist: [],
                    cachedWarehouse: {
                        warehouseCatalog: {},
                        onWarehouseCatalogChange: vi.fn(),
                    },
                    dbtVersion: SupportedDbtVersions.V1_7,
                }),
        ).toThrow('Git branch names must not begin with an option prefix');
        expect(createGithubGitCredentialFiles).not.toHaveBeenCalled();
    });
});
