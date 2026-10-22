import { SupportedDbtAdapter, type Explore } from '@lightdash/common';
import { createServer, type Server } from 'http';
import { slotFixture } from '../../agentConnections/fixtures';
import { ConnectionServerError } from '../../agentConnections/serverError';
import GlobalState from '../../globalState';
import { CliProjectType } from '../../lightdash/projectType';
import { deploy } from '../deploy';
import { isLegacyDbtModelNamesValidationError } from '../deployMetadata';
import { lightdashApi } from './apiClient';

const mocks = vi.hoisted(() => ({ config: vi.fn(), resolve: vi.fn() }));
vi.mock('../../analytics/analytics');
vi.mock('../../config', () => ({ getConfig: mocks.config }));
vi.mock('../../credentials', async (original) => ({
    ...(await original<typeof import('../../credentials')>()),
    resolveCredential: mocks.resolve,
    getAgentConnectionSelection: () => 'default',
}));
vi.mock('../../lightdash-config', () => ({
    readAndLoadLightdashProjectConfig: async () => ({}),
}));
vi.mock('../../dbt/profile', async (original) => ({
    ...(await original<typeof import('../../dbt/profile')>()),
    loadDbtTarget: async () => ({
        name: 'dev',
        target: { type: 'postgres', dbname: 'database_a' },
    }),
}));

const requiredField = { message: "'dbtModelNames' is required" };
const legacyError = {
    name: 'ValidateError',
    statusCode: 422,
    message: 'server-private-marker',
    data: { 'body.dbtModelNames': requiredField },
};
const options: Parameters<typeof deploy>[1] = {
    projectUuid: 'project_a',
    projectDir: '/tmp/project_a',
    profilesDir: '/tmp/profiles',
    profile: 'profile_a',
    target: 'dev',
    projectType: CliProjectType.Dbt,
    dbtProjectName: 'project_a',
    batchedDeploy: false,
    verbose: false,
    ignoreErrors: false,
    validateWarehouseColumns: false,
    select: undefined,
    models: undefined,
    vars: undefined,
    threads: undefined,
    noVersionCheck: undefined,
    exclude: undefined,
    selector: undefined,
    state: undefined,
    fullRefresh: undefined,
    skipDbtCompile: true,
    skipWarehouseCatalog: true,
    useDbtList: undefined,
    defer: undefined,
    targetPath: undefined,
    favorState: undefined,
    combineManifest: undefined,
};
const explore: Explore = {
    name: 'model_x',
    label: 'Model X',
    tags: [],
    tables: {},
    baseTable: 'model_x',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};
let server: Server;
let requests: string[];
let rejection: { status: number; envelope: unknown };

beforeEach(async () => {
    requests = [];
    rejection = {
        status: 422,
        envelope: { status: 'error', error: legacyError },
    };
    server = createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        response.setHeader('Content-Type', 'application/json');
        if (request.method === 'PUT' && request.url?.endsWith('/deploy')) {
            response.statusCode = rejection.status;
            response.end(JSON.stringify(rejection.envelope));
            return;
        }
        const results = request.url?.endsWith('/capabilities')
            ? {
                  version: 1,
                  dbtProjectIdentity: 1,
                  dbtTargetLocation: 1,
                  peerDbtSources: {
                      active: false,
                      requiresDbtProjectName: false,
                      requiresDbtTarget: false,
                  },
              }
            : { exploreCount: 1 };
        response.end(JSON.stringify({ status: 'ok', results }));
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');
    const slot = slotFixture();
    slot.instanceUrl = `http://127.0.0.1:${address.port}`;
    slot.resource = slot.instanceUrl;
    slot.lastReported.approvedProjects = [
        { projectUuid: 'project_a', name: null, approvedCapabilities: [] },
    ];
    mocks.config.mockResolvedValue({
        context: {
            serverUrl: slot.instanceUrl,
            apiKey: 'unused-personal-token',
        },
    });
    mocks.resolve.mockResolvedValue({
        kind: 'agent_connection',
        token: slot.tokens.accessToken,
        slot,
    });
    vi.spyOn(GlobalState, 'debug').mockImplementation(() => {});
    vi.spyOn(GlobalState, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
});

const readTransportError = () =>
    lightdashApi({
        method: 'PUT',
        url: '/api/v2/projects/project_a/deploy',
        body: JSON.stringify({ explores: [explore], complete: false }),
    }).catch((error: unknown) => error);

it('falls back after a real managed 422 with only the old required inventory field', async () => {
    const error = await readTransportError();
    expect(error).toBeInstanceOf(ConnectionServerError);
    expect(isLegacyDbtModelNamesValidationError(error)).toBe(true);
    expect(error).not.toHaveProperty('data');
    expect(String(error)).not.toContain('server-private-marker');
    expect(JSON.stringify(error)).not.toMatch(
        /server-private-marker|body\.dbtModelNames/,
    );
    requests = [];

    await deploy([explore], options);

    expect(requests).toEqual([
        'GET /api/v2/projects/project_a/deploy/capabilities',
        'PUT /api/v2/projects/project_a/deploy',
        'PUT /api/v1/projects/project_a/explores?complete=false',
        'PUT /api/v1/projects/project_a/tags/yaml',
    ]);
});

it.each([
    { status: 403, error: legacyError },
    { status: 401, error: legacyError },
    { status: 422, error: { ...legacyError, statusCode: 403 } },
    { status: 422, error: { ...legacyError, name: 'AuthorizationError' } },
    {
        status: 422,
        error: {
            ...legacyError,
            data: { 'body.dbtModelNames': { message: 'invalid array' } },
        },
    },
    {
        status: 422,
        error: {
            ...legacyError,
            data: { 'body.explores': { message: "'explores' is required" } },
        },
    },
    {
        status: 422,
        error: {
            ...legacyError,
            data: {
                'body.dbtModelNames': {
                    ...requiredField,
                    value: 'server-private-marker',
                },
            },
        },
    },
    {
        status: 422,
        error: {
            ...legacyError,
            data: { 'body.dbtModelNames': { ...requiredField, value: null } },
        },
    },
    {
        status: 422,
        error: {
            ...legacyError,
            data: { 'body.dbtModelNames': { ...requiredField, value: [] } },
        },
    },
    {
        status: 422,
        error: {
            ...legacyError,
            data: {
                'body.dbtModelNames': {
                    ...requiredField,
                    extra: 'server-private-marker',
                },
            },
        },
    },
    {
        status: 422,
        error: {
            ...legacyError,
            data: {
                'body.dbtModelNames': requiredField,
                'body.explores': { message: 'invalid' },
            },
        },
    },
    { status: 422, error: { ...legacyError, data: null } },
    { status: 422, error: null },
])(
    'does not fall back for other managed errors: %j',
    async ({ status, error: serverError }) => {
        rejection = {
            status,
            envelope: { status: 'error', error: serverError },
        };
        const error = await readTransportError();
        expect(error).toBeInstanceOf(Error);
        expect(isLegacyDbtModelNamesValidationError(error)).toBe(false);
        expect(String(error)).not.toContain('server-private-marker');
        expect(JSON.stringify(error)).not.toMatch(
            /server-private-marker|body\.dbtModelNames/,
        );
        requests = [];

        await expect(deploy([explore], options)).rejects.toThrow();

        expect(requests).toEqual([
            'GET /api/v2/projects/project_a/deploy/capabilities',
            'PUT /api/v2/projects/project_a/deploy',
        ]);
    },
);

it('does not use the managed legacy fallback when the upload includes an inventory', async () => {
    await expect(
        deploy([explore], { ...options, dbtModelNames: ['model_x'] }),
    ).rejects.toBeInstanceOf(ConnectionServerError);
    expect(requests).toEqual([
        'GET /api/v2/projects/project_a/deploy/capabilities',
        'PUT /api/v2/projects/project_a/deploy',
    ]);
});
