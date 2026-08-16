import {
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type WarehouseClient,
} from '@lightdash/common';
import execa from 'execa';
import * as fs from 'fs/promises';
import { getInstallationToken } from '../clients/github/Github';
import type { CachedWarehouse } from '../types';
import { DbtGithubProjectAdapter } from './dbtGithubProjectAdapter';

vi.mock('execa');
vi.mock('../clients/github/Github', () => ({
    getInstallationToken: vi.fn(),
}));

const execaMock = execa as unknown as import('vitest').Mock;

const warehouseCredentials: CreateWarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'db.example.com',
    port: 5432,
    user: 'user',
    password: 'password',
    dbname: 'database',
    schema: 'public',
};

const cachedWarehouse: CachedWarehouse = {
    warehouseCatalog: undefined,
    onWarehouseCatalogChange: vi.fn(),
};

describe('DbtGithubProjectAdapter package authentication', () => {
    let adapter: DbtGithubProjectAdapter | undefined;

    afterEach(async () => {
        await adapter?.destroy();
        vi.resetAllMocks();
    });

    it('mints an installation token for each dependency run without exposing it in the environment', async () => {
        const firstToken = 'first-github-installation-token';
        const secondToken = 'second-github-installation-token';
        vi.mocked(getInstallationToken)
            .mockResolvedValueOnce(firstToken)
            .mockResolvedValueOnce(secondToken);
        const observedTokens: string[] = [];
        const configPaths: string[] = [];
        execaMock.mockImplementation(
            async (
                _command: string,
                _args: string[],
                options: { env: Record<string, string> },
            ) => {
                const configPath = options.env.GIT_CONFIG_GLOBAL;
                const config = await fs.readFile(configPath, 'utf8');
                let token: string | undefined;
                if (config.includes(firstToken)) {
                    token = firstToken;
                } else if (config.includes(secondToken)) {
                    token = secondToken;
                }

                expect(Object.values(options.env)).not.toContain(token);
                expect(token).toBeDefined();
                observedTokens.push(token!);
                configPaths.push(configPath);
                return {
                    all: 'success message',
                    stdout: '',
                } as never;
            },
        );
        adapter = new DbtGithubProjectAdapter({
            warehouseClient: vi.fn() as unknown as WarehouseClient,
            githubPersonalAccessToken: 'ghp_clone_token',
            githubInstallationId: '12345',
            githubRepository: 'lightdash/private-dbt-package',
            githubBranch: 'main',
            projectDirectorySubPath: '',
            warehouseCredentials,
            targetName: undefined,
            environment: undefined,
            environmentVariableAllowlist: [],
            cachedWarehouse,
            dbtVersion: SupportedDbtVersions.V1_10,
        });

        await adapter.dbtClient.installDeps?.();
        await adapter.dbtClient.installDeps?.();

        expect(getInstallationToken).toHaveBeenNthCalledWith(1, '12345');
        expect(getInstallationToken).toHaveBeenNthCalledWith(2, '12345');
        expect(observedTokens).toEqual([firstToken, secondToken]);
        expect(configPaths[0]).not.toEqual(configPaths[1]);
        await expect(fs.access(configPaths[0])).rejects.toThrow();
        await expect(fs.access(configPaths[1])).rejects.toThrow();
    });

    it('uses a personal access token through the same isolated config', async () => {
        const token = 'github_pat_private-package-token';
        let configPath: string | undefined;
        execaMock.mockImplementation(
            async (
                _command: string,
                _args: string[],
                options: { env: Record<string, string> },
            ) => {
                configPath = options.env.GIT_CONFIG_GLOBAL;
                expect(await fs.readFile(configPath, 'utf8')).toContain(
                    `x-access-token:${token}@github.com/`,
                );
                expect(Object.values(options.env)).not.toContain(token);
                return {
                    all: 'success message',
                    stdout: '',
                } as never;
            },
        );
        adapter = new DbtGithubProjectAdapter({
            warehouseClient: vi.fn() as unknown as WarehouseClient,
            githubPersonalAccessToken: token,
            githubRepository: 'lightdash/private-dbt-package',
            githubBranch: 'main',
            projectDirectorySubPath: '',
            warehouseCredentials,
            targetName: undefined,
            environment: undefined,
            environmentVariableAllowlist: [],
            cachedWarehouse,
            dbtVersion: SupportedDbtVersions.V1_10,
        });

        await adapter.dbtClient.installDeps?.();

        expect(getInstallationToken).not.toHaveBeenCalled();
        if (!configPath) {
            throw new Error('dbt deps did not receive a git config path');
        }
        await expect(fs.access(configPath)).rejects.toThrow();
    });
});
