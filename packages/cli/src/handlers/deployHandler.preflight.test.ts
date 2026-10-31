import type { CliDeployCapabilities } from '@lightdash/common';
import { getConfig } from '../config';
import { getDbtContext } from '../dbt/context';
import { loadDbtTarget } from '../dbt/profile';
import GlobalState from '../globalState';
import { CliProjectType, detectProjectType } from '../lightdash/projectType';
import { compileProject } from './compile';
import { createProject } from './createProject';
import { lightdashApi } from './dbt/apiClient';
import { tryGetDbtVersion } from './dbt/getDbtVersion';
import { deployHandler } from './deploy';
import { selectProject } from './selectProject';
import { getProjectDeploySettings } from './timestampConversion';

vi.mock('../agentConnections/commandPolicy', () => ({
    assertAgentCommandAllowed: vi.fn(),
}));
vi.mock('../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));
vi.mock('../config', () => ({ getConfig: vi.fn(), setProject: vi.fn() }));
vi.mock('../credentials', async (original) => ({
    ...(await original<typeof import('../credentials')>()),
    getAgentConnectionSelection: () => null,
}));
vi.mock('../dbt/context', () => ({ getDbtContext: vi.fn() }));
vi.mock('../dbt/profile', async (original) => ({
    ...(await original<typeof import('../dbt/profile')>()),
    loadDbtTarget: vi.fn(),
}));
vi.mock('../lightdash/projectType', async (original) => ({
    ...(await original<typeof import('../lightdash/projectType')>()),
    detectProjectType: vi.fn(),
}));
vi.mock('./compile', async (original) => ({
    ...(await original<typeof import('./compile')>()),
    compileProject: vi.fn(),
}));
vi.mock('./createProject', () => ({
    createProject: vi.fn(),
    resolveOrganizationCredentialsName: vi.fn(),
}));
vi.mock('./dbt/apiClient', () => ({
    lightdashApi: vi.fn(),
    checkLightdashVersion: vi.fn(),
    setGzipEnabled: vi.fn(),
}));
vi.mock('./dbt/getDbtVersion', () => ({ tryGetDbtVersion: vi.fn() }));
vi.mock('./selectProject', () => ({
    selectProject: vi.fn(),
    logSelectedProject: vi.fn(),
}));
vi.mock('./sourceSelection', () => ({
    resolveProjectSourceUuid: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./timestampConversion', () => ({
    getProjectDeploySettings: vi.fn(),
}));

const options: Parameters<typeof deployHandler>[0] = {
    projectDir: '/tmp/project',
    profilesDir: '/tmp/profiles',
    profile: 'profile_a',
    target: 'dev',
    verbose: false,
    ignoreErrors: false,
    validateWarehouseColumns: false,
    warehouseCredentials: false,
    skipWarehouseCatalog: true,
    skipDbtCompile: true,
    vars: undefined,
    useDbtList: false,
    select: undefined,
    models: undefined,
    threads: undefined,
    noVersionCheck: false,
    exclude: undefined,
    selector: undefined,
    state: undefined,
    fullRefresh: false,
    defer: false,
    targetPath: undefined,
    favorState: false,
    combineManifest: undefined,
};
const capabilities = (active: boolean): CliDeployCapabilities => ({
    version: 1,
    dbtProjectIdentity: 1,
    dbtTargetLocation: 1,
    peerDbtSources: {
        active,
        requiresDbtProjectName: active,
        requiresDbtTarget: active,
    },
});
const compilationReached = new Error('Compilation reached');

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getConfig).mockResolvedValue({
        context: {
            project: 'configured-parent',
            serverUrl: 'https://example.com',
        },
    });
    vi.mocked(selectProject).mockResolvedValue({
        projectUuid: 'selected-project',
        isPreview: false,
    });
    vi.mocked(detectProjectType).mockImplementation(
        async ({ userOptions }) => ({
            type: CliProjectType.Dbt,
            warehouseCredentials: userOptions?.warehouseCredentials ?? true,
            skipDbtCompile: userOptions?.skipDbtCompile,
            skipWarehouseCatalog: userOptions?.skipWarehouseCatalog,
        }),
    );
    vi.mocked(tryGetDbtVersion).mockResolvedValue({
        success: false,
        error: null,
    });
    vi.mocked(getProjectDeploySettings).mockResolvedValue({
        disableTimestampConversion: undefined,
        connectionRoute: 'multi',
    });
    vi.mocked(lightdashApi).mockResolvedValue(capabilities(true));
    vi.mocked(getDbtContext).mockResolvedValue({
        projectName: 'project_a',
        profileName: 'profile_a',
        targetDir: '/tmp/project/target',
        modelsDir: '/tmp/project/models',
    });
    vi.mocked(loadDbtTarget).mockRejectedValue(
        new Error('ENOENT private-host password=secret_value'),
    );
    vi.mocked(compileProject).mockRejectedValue(compilationReached);
});

afterEach(() => {
    vi.restoreAllMocks();
    GlobalState.setVerbose(false);
});

it.each([false, true])(
    'rejects an active unreadable profile before compile with skipDbtCompile=%s',
    async (skipDbtCompile) => {
        const failure = deployHandler({ ...options, skipDbtCompile });
        await expect(failure).rejects.toThrow(
            'profile "profile_a" and target "dev": a required file is missing',
        );
        await expect(failure).rejects.not.toThrow(/private-host|secret_value/);
        expect(compileProject).not.toHaveBeenCalled();
        expect(createProject).not.toHaveBeenCalled();
        expect(getDbtContext).not.toHaveBeenCalled();
        expect(lightdashApi).toHaveBeenCalledExactlyOnceWith({
            method: 'GET',
            url: '/api/v2/projects/selected-project/deploy/capabilities',
            body: undefined,
            safeToRetry: true,
        });
    },
);

it.each([true, undefined])(
    'rejects an active profile safely before the verbose adapter probe with warehouseCredentials=%s',
    async (warehouseCredentials) => {
        const debug = vi.spyOn(GlobalState, 'debug');
        const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(loadDbtTarget).mockRejectedValue(
            new Error(
                'bad indentation of a mapping entry\npassword: secret_value\nhost: private-host',
            ),
        );

        const failure = deployHandler({
            ...options,
            warehouseCredentials,
            verbose: true,
        });

        await expect(failure).rejects.toThrow(
            'profile "profile_a" and target "dev": the profile contains invalid YAML',
        );
        await expect(failure).rejects.not.toThrow(/private-host|secret_value/);
        expect(loadDbtTarget).toHaveBeenCalledExactlyOnceWith({
            profilesDir: options.profilesDir,
            profileName: options.profile,
            targetName: options.target,
        });
        expect(getDbtContext).not.toHaveBeenCalled();
        expect(debug).not.toHaveBeenCalled();
        expect(stderr).not.toHaveBeenCalled();
        expect(compileProject).not.toHaveBeenCalled();
        expect(createProject).not.toHaveBeenCalled();
    },
);

it.each([true, undefined])(
    'keeps the inactive verbose adapter error with warehouseCredentials=%s',
    async (warehouseCredentials) => {
        vi.mocked(lightdashApi).mockResolvedValue(capabilities(false));
        const debug = vi.spyOn(GlobalState, 'debug');
        const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            deployHandler({ ...options, warehouseCredentials, verbose: true }),
        ).rejects.toBe(compilationReached);

        const message =
            '> Could not detect adapter type: ENOENT private-host password=secret_value';
        expect(debug).toHaveBeenCalledExactlyOnceWith(message);
        expect(stderr).toHaveBeenCalledExactlyOnceWith(
            expect.stringContaining(message),
        );
        expect(getDbtContext).toHaveBeenCalledOnce();
        expect(loadDbtTarget).toHaveBeenCalledOnce();
        expect(compileProject).toHaveBeenCalledOnce();
        expect(createProject).not.toHaveBeenCalled();
    },
);

it.each([undefined, 'New project'])(
    'keeps Spark credentials and catalog disabled before compile with create=%s',
    async (create) => {
        vi.mocked(lightdashApi).mockResolvedValue(capabilities(false));
        vi.mocked(loadDbtTarget).mockResolvedValue({
            name: 'dev',
            target: { type: 'spark' },
        });
        const debug = vi.spyOn(GlobalState, 'debug');
        const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            deployHandler({
                ...options,
                create,
                warehouseCredentials: true,
                skipWarehouseCatalog: false,
                verbose: true,
            }),
        ).rejects.toBe(compilationReached);

        expect(compileProject).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                warehouseCredentials: false,
                skipWarehouseCatalog: true,
            }),
        );
        expect(debug).toHaveBeenCalledExactlyOnceWith(
            '> Spark adapter detected, skipping warehouse credentials',
        );
        expect(stderr).toHaveBeenCalledWith(
            expect.stringContaining(
                'Spark adapter detected. Project will be created without warehouse credentials.\nConfigure your query engine (e.g., Athena) in the Lightdash UI.',
            ),
        );
        expect(getDbtContext).toHaveBeenCalledOnce();
        expect(loadDbtTarget).toHaveBeenCalledOnce();
        if (create !== undefined) {
            expect(lightdashApi).not.toHaveBeenCalled();
            expect(selectProject).not.toHaveBeenCalled();
            expect(getProjectDeploySettings).not.toHaveBeenCalled();
        }
    },
);

it('continues to compile without reading the inactive profile', async () => {
    vi.mocked(lightdashApi).mockResolvedValue(capabilities(false));
    await expect(deployHandler(options)).rejects.toBe(compilationReached);
    expect(loadDbtTarget).not.toHaveBeenCalled();
    expect(getDbtContext).not.toHaveBeenCalled();
    expect(compileProject).toHaveBeenCalledOnce();
});

it('does not query the configured parent when creating a project', async () => {
    await expect(
        deployHandler({ ...options, create: 'New project' }),
    ).rejects.toBe(compilationReached);
    expect(lightdashApi).not.toHaveBeenCalled();
    expect(loadDbtTarget).not.toHaveBeenCalled();
    expect(selectProject).not.toHaveBeenCalled();
    expect(compileProject).toHaveBeenCalledOnce();
});

it('does not query capabilities or read profiles for native YAML', async () => {
    vi.mocked(detectProjectType).mockResolvedValue({
        type: CliProjectType.LightdashYaml,
        warehouseCredentials: false,
        skipDbtCompile: true,
        skipWarehouseCatalog: true,
    });
    await expect(deployHandler(options)).rejects.toBe(compilationReached);
    expect(lightdashApi).not.toHaveBeenCalled();
    expect(loadDbtTarget).not.toHaveBeenCalled();
    expect(getDbtContext).not.toHaveBeenCalled();
    expect(tryGetDbtVersion).not.toHaveBeenCalled();
});
