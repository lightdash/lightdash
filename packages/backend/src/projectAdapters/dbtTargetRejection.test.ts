import { SupportedDbtVersions } from '@lightdash/common';
import fs from 'fs';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtGithubProjectAdapter } from './dbtGithubProjectAdapter';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';

const args = {
    warehouseClient: warehouseClientMock,
    dbtTarget: {
        kind: 'none' as const,
        reason: 'This credential mode cannot run dbt. Use an explicit key.',
    },
    explicitCredentials: true,
    targetName: undefined,
    environment: undefined,
    environmentVariableAllowlist: [],
    cachedWarehouse: {
        warehouseCatalog: undefined,
        onWarehouseCatalogChange: vi.fn(),
    },
    dbtVersion: SupportedDbtVersions.V1_10,
    partialParseBaselinePath: null,
};

afterEach(() => vi.restoreAllMocks());

it.each([
    {
        name: 'local',
        create: () =>
            new DbtLocalCredentialsProjectAdapter({
                ...args,
                projectDir: '/tmp/dbt',
            }),
    },
    {
        name: 'git',
        create: () =>
            new DbtGitProjectAdapter({
                ...args,
                remoteRepositoryUrl: 'https://example.com/org/repo.git',
                repository: 'org/repo',
                gitBranch: 'main',
                projectDirectorySubPath: '/',
            }),
    },
    {
        name: 'GitHub',
        create: () =>
            new DbtGithubProjectAdapter({
                ...args,
                githubPersonalAccessToken: '',
                githubRepository: 'org/repo',
                githubBranch: 'main',
                projectDirectorySubPath: '/',
            }),
    },
])('rejects a refused target before $name creates files', ({ create }) => {
    const mkdtemp = vi.spyOn(fs, 'mkdtempSync').mockImplementation(() => {
        throw new Error('Unexpected temporary directory');
    });
    const writeFile = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('Unexpected file write');
    });
    expect(create).toThrow(args.dbtTarget.reason);
    expect(mkdtemp).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
});
