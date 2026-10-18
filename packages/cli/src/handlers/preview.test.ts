import {
    CreateProjectTableConfiguration,
    DbtProjectType,
    LightdashError,
    ProjectType,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DbtSourceBindings,
    type Project,
} from '@lightdash/common';
import ora from 'ora';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import { CliProjectType, detectProjectType } from '../lightdash/projectType';
import { compileProject } from './compile';
import { loadWarehouseCredentialsFromProfiles } from './createProject';
import { lightdashApi } from './dbt/apiClient';
import { getFinalJobState } from './dbt/refresh';
import { deploy } from './deploy';
import { startPreviewHandler } from './preview';

vi.mock('../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));
vi.mock('../config', () => ({
    getConfig: vi.fn(),
    setPreviewProject: vi.fn(),
}));
vi.mock('../credentials', async (original) => ({
    ...(await original<typeof import('../credentials')>()),
    refuseAgentConnection: vi.fn(),
    getAgentConnectionSelection: () => null,
}));
vi.mock('../lightdash/projectType', async (original) => ({
    ...(await original<typeof import('../lightdash/projectType')>()),
    detectProjectType: vi.fn(),
}));
vi.mock('./compile', () => ({ compileProject: vi.fn() }));
vi.mock('./createProject', () => ({
    loadWarehouseCredentialsFromProfiles: vi.fn(),
}));
vi.mock('./dbt/apiClient', () => ({
    lightdashApi: vi.fn(),
    checkLightdashVersion: vi.fn(),
}));
vi.mock('./dbt/refresh', async (original) => ({
    ...(await original<typeof import('./dbt/refresh')>()),
    getFinalJobState: vi.fn(),
}));
vi.mock('./deploy', () => ({
    deploy: vi.fn(),
    getDeployTarget: vi.fn(),
}));

const projectUrl = '/api/v1/projects/preview';
const bindingsUrl = `${projectUrl}/warehouse-connections/dbt-sources/bindings`;
const extraUrl = `${projectUrl}/warehouse-connections/extra`;
const credentials: CreateWarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'finance.example.com',
    port: 5432,
    dbname: 'finance',
    schema: 'public',
    user: 'refreshed-user',
    password: 'refreshed-password',
};
const options: Parameters<typeof startPreviewHandler>[0] = {
    name: 'my-preview',
    source: 'finance',
    projectDir: '.',
    profilesDir: '.',
    target: undefined,
    profile: undefined,
    select: undefined,
    models: undefined,
    vars: undefined,
    threads: undefined,
    noVersionCheck: undefined,
    exclude: undefined,
    selector: undefined,
    state: undefined,
    fullRefresh: undefined,
    skipDbtCompile: undefined,
    skipWarehouseCatalog: undefined,
    useDbtList: undefined,
    defer: undefined,
    targetPath: undefined,
    favorState: undefined,
    combineManifest: undefined,
    verbose: false,
    ignoreErrors: false,
    tableConfiguration: CreateProjectTableConfiguration.ALL,
    validateWarehouseColumns: false,
};
let project: Project;
let bindings: DbtSourceBindings;
let bindingsError: Error | undefined;
let writeError: Error | undefined;
let spinner: ReturnType<typeof ora>;
const credentialWrites = () =>
    vi
        .mocked(lightdashApi)
        .mock.calls.map(([request]) => request)
        .filter(
            ({ method, url }) =>
                method === 'PATCH' && (url === projectUrl || url === extraUrl),
        );
const expectPrimaryWrite = () => {
    expect(credentialWrites()).toEqual([
        {
            method: 'PATCH',
            url: projectUrl,
            body: JSON.stringify({
                name: project.name,
                dbtConnection: project.dbtConnection,
                dbtVersion: project.dbtVersion,
                warehouseConnection: credentials,
            }),
        },
    ]);
    expect(getFinalJobState).toHaveBeenCalledWith(
        'refresh-job',
        'Refreshing warehouse credentials',
    );
};

beforeEach(() => {
    vi.clearAllMocks();
    bindingsError = undefined;
    writeError = undefined;
    project = {
        projectUuid: 'preview',
        organizationUuid: 'org',
        name: options.name!,
        type: ProjectType.PREVIEW,
        connectionRoute: 'multi',
        dbtConnection: { type: DbtProjectType.NONE },
        dbtVersion: SupportedDbtVersions.V1_10,
        warehouseConnection: { ...credentials, host: 'primary.example.com' },
        schedulerTimezone: 'UTC',
        queryTimezone: null,
        useProjectTimezoneInFilters: false,
        schedulerFailureNotifyRecipients: false,
        schedulerFailureIncludeContact: false,
        schedulerFailureContactOverride: null,
        createdByUserUuid: null,
        hasDefaultUserSpaces: false,
        colorPaletteUuid: null,
        expiresAt: null,
        agentSqlScope: null,
    };
    bindings = {
        connections: [
            {
                warehouseConnectionUuid: 'primary',
                name: 'Primary',
                isOriginal: true,
            },
            {
                warehouseConnectionUuid: 'extra',
                name: 'Finance warehouse',
                isOriginal: false,
            },
        ],
        sources: [
            {
                projectDbtSourceUuid: 'finance-source',
                warehouseConnectionUuid: 'extra',
            },
        ],
    };
    vi.mocked(getConfig).mockResolvedValue({
        context: { project: 'upstream', serverUrl: 'https://example.com' },
    });
    vi.mocked(detectProjectType).mockResolvedValue({
        type: CliProjectType.Dbt,
        warehouseCredentials: true,
        skipDbtCompile: undefined,
        skipWarehouseCatalog: undefined,
    });
    vi.mocked(loadWarehouseCredentialsFromProfiles).mockResolvedValue({
        credentials,
        targetName: 'dev',
        dbtVersionOption: SupportedDbtVersions.V1_10,
        isDbtCloudCLI: false,
    });
    vi.mocked(compileProject).mockResolvedValue({
        explores: [],
        isProjectComplete: true,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    spinner = ora();
    vi.spyOn(spinner, 'fail');
    vi.spyOn(GlobalState, 'startSpinner').mockReturnValue(spinner);
    vi.mocked(lightdashApi).mockImplementation(async ({ method, url }) => {
        if (method === 'GET' && url === '/api/v1/org/projects/')
            return [project];
        if (method === 'GET' && url === projectUrl) return project;
        if (method === 'GET' && url === `${projectUrl}/dbt-sources`)
            return [
                { name: 'finance', projectDbtSourceUuid: 'finance-source' },
            ];
        if (method === 'GET' && url === bindingsUrl) {
            if (bindingsError) throw bindingsError;
            return bindings;
        }
        if (method === 'PATCH' && url === `${projectUrl}/preview-expiration`)
            return {
                projectUuid: project.projectUuid,
                expiresAt: new Date('2026-10-18T00:00:00Z'),
            };
        if (method === 'PATCH' && (url === projectUrl || url === extraUrl)) {
            if (writeError) throw writeError;
            return { jobUuid: 'refresh-job' };
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
    });
});

afterEach(() => vi.restoreAllMocks());

describe('startPreviewHandler credential refresh', () => {
    it('refreshes the selected source extra connection without writing the primary', async () => {
        await startPreviewHandler(options);

        expect(credentialWrites()).toEqual([
            {
                method: 'PATCH',
                url: extraUrl,
                body: JSON.stringify({ warehouseConnection: credentials }),
            },
        ]);
        expect(getFinalJobState).not.toHaveBeenCalled();
        expect(GlobalState.startSpinner).toHaveBeenCalledWith(
            expect.stringContaining('Finance warehouse'),
        );
        expect(deploy).toHaveBeenCalledWith(
            [],
            expect.objectContaining({
                projectUuid: 'preview',
                sourceUuid: 'finance-source',
            }),
        );
    });

    it.each(['null', 'missing', 'original'])(
        'refreshes the primary for a source with a %s binding',
        async (binding) => {
            bindings.sources =
                binding === 'missing'
                    ? []
                    : [
                          {
                              projectDbtSourceUuid: 'finance-source',
                              warehouseConnectionUuid:
                                  binding === 'null' ? null : 'primary',
                          },
                      ];
            await startPreviewHandler(options);
            expectPrimaryWrite();
        },
    );

    it.each(['multi', 'single', undefined] as const)(
        'keeps one primary refresh and skips bindings without a source on route %s',
        async (route) => {
            project.connectionRoute = route;
            await startPreviewHandler({ ...options, source: undefined });
            expectPrimaryWrite();
            expect(lightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ url: bindingsUrl }),
            );
        },
    );

    it('skips bindings for a selected source on a single route', async () => {
        project.connectionRoute = 'single';
        await startPreviewHandler(options);
        expectPrimaryWrite();
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ url: bindingsUrl }),
        );
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.filter(
                    ([request]) => request.url === `${projectUrl}/dbt-sources`,
                ),
        ).toHaveLength(1);
    });

    it.each([403, 409, 500, undefined])(
        'keeps stored credentials and warns when bindings fail with %s',
        async (statusCode) => {
            bindingsError =
                statusCode === undefined
                    ? new Error('Network error')
                    : new LightdashError({
                          name: 'BindingsError',
                          message: 'Cannot read bindings',
                          statusCode,
                          data: {},
                      });
            await startPreviewHandler(options);
            expect(credentialWrites()).toEqual([]);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Could not read which connection source finance uses; keeping the warehouse credentials already stored on the preview.',
                ),
            );
            expect(deploy).toHaveBeenCalled();
        },
    );

    it('keeps stored credentials when the source is bound to an unknown connection', async () => {
        bindings.sources = [
            {
                projectDbtSourceUuid: 'finance-source',
                warehouseConnectionUuid: 'unknown',
            },
        ];
        await startPreviewHandler(options);
        expect(credentialWrites()).toEqual([]);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining(
                'keeping the warehouse credentials already stored on the preview.',
            ),
        );
        expect(deploy).toHaveBeenCalled();
    });

    it('resolves the saved upstream source against the preview before refreshing', async () => {
        vi.mocked(getConfig).mockResolvedValue({
            context: {
                project: 'upstream',
                source: 'finance',
                serverUrl: 'https://example.com',
            },
        });
        await startPreviewHandler({ ...options, source: undefined });
        expect(credentialWrites()).toEqual([
            {
                method: 'PATCH',
                url: extraUrl,
                body: JSON.stringify({ warehouseConnection: credentials }),
            },
        ]);
    });

    it.each(['extra', 'primary'])(
        'fails the spinner and rethrows a failed %s write',
        async (connection) => {
            if (connection === 'primary') bindings.sources = [];
            writeError = new Error('Connection rejected');
            await expect(startPreviewHandler(options)).rejects.toThrow(
                writeError,
            );
            expect(credentialWrites()).toHaveLength(1);
            expect(deploy).not.toHaveBeenCalled();
            expect(spinner.fail).toHaveBeenCalledOnce();
        },
    );
});
