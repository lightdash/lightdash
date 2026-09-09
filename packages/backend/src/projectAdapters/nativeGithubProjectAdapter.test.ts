import {
    DbtProjectType,
    SupportedDbtVersions,
    WarehouseTypes,
    type DbtGithubProjectConfig,
} from '@lightdash/common';
import fs from 'fs/promises';
import path from 'path';
import simpleGit from 'simple-git';
import { getInstallationToken } from '../clients/github/Github';
import { DbtCliClient } from '../dbt/dbtCliClient';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtGithubProjectAdapter } from './dbtGithubProjectAdapter';
import { NativeGithubProjectAdapter } from './nativeGithubProjectAdapter';
import { projectAdapterFromConfig } from './projectAdapter';

vi.mock('simple-git');
vi.mock('../clients/github/Github', () => ({ getInstallationToken: vi.fn() }));
vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    warehouseClientFromCredentials: vi.fn(() => warehouseClientMock),
}));
vi.mock('../dbt/dbtCliClient');

const modelYaml = `type: model
name: orders
sql_from: public.orders
dimensions:
  - name: id
    type: number
    sql: id
`;

describe('native GitHub server compilation', () => {
    const clone = vi.fn();
    const pull = vi.fn();
    const env = vi.fn();
    const connection: DbtGithubProjectConfig = {
        type: DbtProjectType.GITHUB,
        semanticLayer: 'lightdash',
        authorization_method: 'installation_id',
        installation_id: '123',
        repository: 'org/native',
        branch: 'preview/change',
        project_sub_path: 'analytics',
    };
    const createAdapter = (config = connection) =>
        projectAdapterFromConfig(
            config,
            {
                type: WarehouseTypes.POSTGRES,
                host: 'localhost',
                port: 5432,
                user: 'postgres',
                password: 'test',
                dbname: 'postgres',
                schema: 'public',
            },
            { warehouseCatalog: undefined, onWarehouseCatalogChange: vi.fn() },
            SupportedDbtVersions.V1_10,
            [],
        );
    const adapters: Awaited<ReturnType<typeof createAdapter>>[] = [];

    beforeEach(() => {
        vi.clearAllMocks();
        const git = { clone, pull, env, cwd: vi.fn().mockReturnThis() };
        env.mockReturnValue(git);
        vi.mocked(simpleGit).mockReturnValue(
            git as unknown as ReturnType<typeof simpleGit>,
        );
        pull.mockRejectedValue(new Error('No checkout yet'));
        clone.mockImplementation(async (_url: string, directory: string) => {
            const modelDir = path.join(directory, 'analytics/models/nested');
            await fs.mkdir(modelDir, { recursive: true });
            await fs.writeFile(path.join(modelDir, 'sales.yaml'), modelYaml);
        });
        vi.mocked(getInstallationToken).mockResolvedValue('ghs_test');
    });
    afterEach(async () => {
        await Promise.all(
            adapters.splice(0).map((adapter) => adapter.destroy()),
        );
    });

    it('uses the installation, selected preview branch and subdirectory without dbt or catalog access', async () => {
        const catalog = vi.spyOn(warehouseClientMock, 'getCatalog');
        const adapter = await createAdapter();
        adapters.push(adapter);
        expect(adapter).toBeInstanceOf(NativeGithubProjectAdapter);
        const explores = await adapter.compileAllExplores(undefined, true);
        expect(getInstallationToken).toHaveBeenCalledWith('123');
        expect(clone).toHaveBeenCalledWith(
            'https://github.com/org/native.git',
            expect.any(String),
            expect.objectContaining({ '--branch': 'preview/change' }),
        );
        expect(explores).toEqual([
            expect.objectContaining({
                tables: expect.objectContaining({
                    orders: expect.objectContaining({
                        ymlPath: 'models/nested/sales.yaml',
                    }),
                }),
            }),
        ]);
        expect(catalog).not.toHaveBeenCalled();
        expect(DbtCliClient).not.toHaveBeenCalled();
        expect(await fs.readdir(path.dirname(adapter.dbtProjectDir!))).toEqual([
            'analytics',
        ]);
        expect(env).toHaveBeenCalledWith(
            'GIT_CONFIG_GLOBAL',
            expect.stringContaining('github_credentials_'),
        );
        catalog.mockRestore();
    });

    it.each([
        'type: model\nname: broken\n',
        `${modelYaml}metrics:\n  broken:\n    type: sum\n    sql: \${missing}\n`,
    ])(
        'fails before exposing a refresh stream when any native file is invalid',
        async (invalidYaml) => {
            const adapter = await createAdapter();
            adapters.push(adapter);
            await adapter.compileAllExplores(undefined);
            pull.mockResolvedValue({});
            await fs.writeFile(
                path.join(adapter.dbtProjectDir!, 'models/broken.yml'),
                invalidYaml.replace('name: orders', 'name: broken'),
            );
            await expect(
                adapter.prepareExploreStream(undefined, false, true),
            ).rejects.toThrow(/broken/);
        },
    );

    it('keeps omitted format settings on the existing dbt adapter', async () => {
        const adapter = await createAdapter({
            ...connection,
            semanticLayer: undefined,
        });
        adapters.push(adapter);
        expect(adapter).toBeInstanceOf(DbtGithubProjectAdapter);
    });

    it('rejects a project subdirectory escaping the checkout before cloning', async () => {
        await expect(
            createAdapter({ ...connection, project_sub_path: '../outside' }),
        ).rejects.toThrow('within the Git repository');
        expect(clone).not.toHaveBeenCalled();
    });
});
