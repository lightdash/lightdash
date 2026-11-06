import { SupportedDbtVersions } from '@lightdash/common';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtGithubProjectAdapter } from './dbtGithubProjectAdapter';
import {
    DbtGitProjectAdapter,
    type DbtGitProjectAdapterArgs,
} from './dbtGitProjectAdapter';
import { GitRepository, type GitCheckoutStrategy } from './gitRepository';

const { refresh } = vi.hoisted(() => ({
    refresh:
        vi.fn<(directory: string, signal?: AbortSignal) => Promise<void>>(),
}));

vi.mock('./gitRepository', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./gitRepository')>();
    return {
        ...actual,
        GitRepository: vi.fn(
            class RecordingGitRepository extends actual.GitRepository {
                constructor(
                    ...args: ConstructorParameters<typeof actual.GitRepository>
                ) {
                    super(...args);
                    this.refresh = (signal) => refresh(args[1], signal);
                }
            },
        ),
    };
});

const sharedArgs = {
    warehouseClient: warehouseClientMock,
    projectDirectorySubPath: '/analytics/dbt',
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
} satisfies Omit<
    DbtGitProjectAdapterArgs,
    'repository' | 'remoteRepositoryUrl' | 'gitBranch'
>;

const buildAdapter = (overrides: Partial<DbtGitProjectAdapterArgs> = {}) =>
    new DbtGitProjectAdapter({
        ...sharedArgs,
        repository: 'synthetic/fixture',
        remoteRepositoryUrl: 'https://example.test/fixture.git',
        gitBranch: 'main',
        gitCheckout: 'sparse',
        ...overrides,
    });

beforeEach(() => {
    vi.clearAllMocks();
    refresh.mockReset();
    refresh.mockImplementation(async (directory) => {
        const project = path.join(directory, 'analytics/dbt');
        await fs.mkdir(project, { recursive: true });
        await fs.writeFile(
            path.join(project, 'dbt_project.yml'),
            'name: fixture\nmodel-paths: [models]\n',
        );
    });
});
afterEach(() => vi.restoreAllMocks());

it.each([
    {
        name: 'Git',
        create: () =>
            new DbtGitProjectAdapter({
                ...sharedArgs,
                repository: 'synthetic/fixture',
                remoteRepositoryUrl: 'https://example.test/fixture.git',
                gitBranch: 'main',
            }),
    },
    {
        name: 'GitHub',
        create: () =>
            new DbtGithubProjectAdapter({
                ...sharedArgs,
                githubPersonalAccessToken: '',
                githubRepository: 'synthetic/fixture',
                githubBranch: 'main',
            }),
    },
])(
    'defaults $name to full checkout when the mode is omitted',
    async ({ create }) => {
        const adapter = create();
        vi.spyOn(adapter.dbtClient, 'installDeps').mockResolvedValue(undefined);
        try {
            await adapter.prepareDbtSource();
            expect(vi.mocked(GitRepository).mock.calls[0]?.[6]).toEqual({
                kind: 'full',
            });
        } finally {
            await adapter.destroy();
        }
    },
);

it('prepares the selected sparse project before installing dependencies', async () => {
    const adapter = buildAdapter();
    const deps = vi
        .spyOn(adapter.dbtClient, 'installDeps')
        .mockResolvedValue(undefined);
    try {
        await adapter.prepareDbtSource();
        expect(vi.mocked(GitRepository).mock.calls[0]?.slice(5)).toEqual([
            {},
            { kind: 'sparse', directories: ['analytics/dbt'] },
        ]);
        expect(deps).toHaveBeenCalledOnce();
    } finally {
        await adapter.destroy();
    }
});

it.each<{ mode: DbtGitProjectAdapterArgs['gitCheckout']; subPath: string }>([
    { mode: 'sparse', subPath: '/' },
    { mode: 'sparse', subPath: '.' },
    { mode: 'sparse', subPath: './' },
    { mode: 'sparse', subPath: '' },
    { mode: 'full', subPath: '/analytics/dbt' },
    { mode: 'full', subPath: '/analytics/../dbt' },
    { mode: undefined, subPath: '/analytics/dbt' },
])(
    'preserves full checkout for $mode / $subPath',
    async ({ mode, subPath }) => {
        const adapter = buildAdapter({
            gitCheckout: mode,
            projectDirectorySubPath: subPath,
        });
        vi.spyOn(adapter.dbtClient, 'installDeps').mockResolvedValue(undefined);
        try {
            await adapter.prepareDbtSource();
            expect(vi.mocked(GitRepository).mock.calls[0]?.[6]).toEqual({
                kind: 'full',
            });
        } finally {
            await adapter.destroy();
        }
    },
);

it('rejects an invalid sparse subdirectory before creating temporary files', () => {
    const temporary = vi.spyOn(fsSync, 'mkdtempSync');
    expect(() =>
        buildAdapter({ projectDirectorySubPath: '/../outside' }),
    ).toThrow('Project subdirectory must stay within the Git repository');
    expect(temporary).not.toHaveBeenCalled();
});

it('rejects incomplete sparse input before installing dbt dependencies', async () => {
    refresh.mockImplementationOnce(async (directory) => {
        const project = path.join(directory, 'analytics/dbt');
        await fs.mkdir(project, { recursive: true });
        await fs.writeFile(
            path.join(project, 'dbt_project.yml'),
            'model-paths: [../shared]\n',
        );
    });
    const adapter = buildAdapter();
    const deps = vi
        .spyOn(adapter.dbtClient, 'installDeps')
        .mockResolvedValue(undefined);
    try {
        await expect(adapter.prepareDbtSource()).rejects.toThrow(
            'model-paths[0] (outside-cone)',
        );
        expect(deps).not.toHaveBeenCalled();
    } finally {
        await adapter.destroy();
    }
});

it('checks the sparse input on the public connection-testing path too', async () => {
    refresh.mockImplementationOnce(async (directory) => {
        const project = path.join(directory, 'analytics/dbt');
        await fs.mkdir(project, { recursive: true });
        await fs.writeFile(
            path.join(project, 'dbt_project.yml'),
            'macro-paths: [../shared]\n',
        );
    });
    const adapter = buildAdapter();
    const dbtTest = vi
        .spyOn(adapter.dbtClient, 'test')
        .mockResolvedValue(undefined);
    try {
        await expect(
            adapter.test({ signal: new AbortController().signal }),
        ).rejects.toThrow('macro-paths[0] (outside-cone)');
        expect(dbtTest).not.toHaveBeenCalled();
    } finally {
        await adapter.destroy();
    }
});

it('memoizes preparation but rechecks a recreated checkout after disk release', async () => {
    const adapter = buildAdapter();
    const deps = vi
        .spyOn(adapter.dbtClient, 'installDeps')
        .mockResolvedValue(undefined);
    try {
        await adapter.prepareDbtSource();
        await fs.writeFile(
            path.join(
                adapter.localRepositoryDir,
                'analytics/dbt/dbt_project.yml',
            ),
            'model-paths: [../shared]\n',
        );
        await adapter.prepareDbtSource();
        expect(refresh).toHaveBeenCalledOnce();
        expect(deps).toHaveBeenCalledOnce();
        await adapter.releaseDisk();
        await adapter.prepareDbtSource();
        expect(refresh).toHaveBeenCalledTimes(2);
        expect(deps).toHaveBeenCalledTimes(2);
    } finally {
        await adapter.destroy();
    }
});

it('does not install dependencies after refresh failure', async () => {
    const failure = new Error('Fixture clone failed');
    refresh.mockRejectedValueOnce(failure);
    const adapter = buildAdapter();
    const deps = vi
        .spyOn(adapter.dbtClient, 'installDeps')
        .mockResolvedValue(undefined);
    try {
        await expect(adapter.prepareDbtSource()).rejects.toBe(failure);
        expect(deps).not.toHaveBeenCalled();
    } finally {
        await adapter.destroy();
    }
});

it.each([
    {
        hostDomain: undefined,
        expected: { kind: 'sparse', directories: ['analytics/dbt'] },
    },
    {
        hostDomain: 'github.com',
        expected: { kind: 'sparse', directories: ['analytics/dbt'] },
    },
    {
        hostDomain: '',
        expected: { kind: 'sparse', directories: ['analytics/dbt'] },
    },
    { hostDomain: 'ghe.example.test', expected: { kind: 'full' } },
] satisfies {
    hostDomain: string | undefined;
    expected: GitCheckoutStrategy;
}[])(
    'scopes sparse checkout to the supported GitHub host $hostDomain',
    async ({ hostDomain, expected }) => {
        const adapter = new DbtGithubProjectAdapter({
            ...sharedArgs,
            gitCheckout: 'sparse',
            hostDomain,
            githubPersonalAccessToken: '',
            githubRepository: 'synthetic/fixture',
            githubBranch: 'main',
        });
        vi.spyOn(adapter.dbtClient, 'installDeps').mockResolvedValue(undefined);
        try {
            await adapter.prepareDbtSource();
            expect(vi.mocked(GitRepository).mock.calls[0]?.[6]).toEqual(
                expected,
            );
        } finally {
            await adapter.destroy();
        }
    },
);

it('preserves odd stored subdirectories on unsupported GitHub hosts', async () => {
    const adapter = new DbtGithubProjectAdapter({
        ...sharedArgs,
        gitCheckout: 'sparse',
        projectDirectorySubPath: '/analytics/../dbt',
        hostDomain: 'ghe.example.test',
        githubPersonalAccessToken: '',
        githubRepository: 'synthetic/fixture',
        githubBranch: 'main',
    });
    vi.spyOn(adapter.dbtClient, 'installDeps').mockResolvedValue(undefined);
    try {
        await adapter.prepareDbtSource();
        expect(vi.mocked(GitRepository).mock.calls[0]?.[6]).toEqual({
            kind: 'full',
        });
    } finally {
        await adapter.destroy();
    }
});

it('rejects invalid sparse GitHub paths before creating credential files', () => {
    const temporary = vi.spyOn(fsSync, 'mkdtempSync');
    expect(
        () =>
            new DbtGithubProjectAdapter({
                ...sharedArgs,
                gitCheckout: 'sparse',
                projectDirectorySubPath: '/../outside',
                githubPersonalAccessToken: '',
                githubRepository: 'synthetic/fixture',
                githubBranch: 'main',
            }),
    ).toThrow('Project subdirectory must stay within the Git repository');
    expect(temporary).not.toHaveBeenCalled();
});
