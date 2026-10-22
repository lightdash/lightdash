import {
    DeploySessionStatus,
    LightdashError,
    SupportedDbtAdapter,
    WarehouseTypes,
    type CliDeployCapabilities,
    type Explore,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import path from 'path';
import { ConnectionServerError } from '../agentConnections/serverError';
import { runWithAgentConnectionSelection } from '../credentials';
import { getDbtContext } from '../dbt/context';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../dbt/profile';
import GlobalState from '../globalState';
import { readAndLoadLightdashProjectConfig } from '../lightdash-config';
import { CliProjectType } from '../lightdash/projectType';
import { lightdashApi } from './dbt/apiClient';
import { deploy } from './deploy';
import {
    getDeployMetadata,
    isLegacyDbtModelNamesValidationError,
} from './deployMetadata';

vi.mock('../analytics/analytics');
vi.mock('../dbt/context');
vi.mock('../dbt/profile', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../dbt/profile')>()),
    loadDbtTarget: vi.fn(),
    warehouseCredentialsFromDbtTarget: vi.fn(),
}));
vi.mock('../lightdash-config');
vi.mock('./dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./dbt/apiClient')>()),
    lightdashApi: vi.fn(),
}));

const options = {
    projectType: CliProjectType.Dbt,
    projectDir: '/tmp/project_a',
    profilesDir: '/tmp/profiles',
    projectUuid: 'project_a',
    dbtProjectName: 'project_a',
    target: 'dev',
    profile: 'profile_a',
    vars: undefined,
    verbose: false,
    ignoreErrors: false,
    validateWarehouseColumns: false,
    skipWarehouseCatalog: true,
    skipDbtCompile: true,
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
const metadata = {
    cliCapabilities: { dbtProjectIdentity: 1, dbtTargetLocation: 1 },
    dbtProjectName: 'project_a',
    dbtTarget: { type: WarehouseTypes.POSTGRES, database: 'database_a' },
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
const missingEndpoint = () =>
    new LightdashError({
        name: 'NotFoundError',
        message: 'Missing endpoint',
        statusCode: 404,
        data: {},
    });
const legacyValidationError = (data: Record<string, unknown>) =>
    new LightdashError({
        name: 'ValidateError',
        statusCode: 422,
        message: 'Validation failed',
        data,
    });
const sessionUuid = randomUUID();
let advertised: unknown;
beforeEach(() => {
    vi.resetAllMocks();
    advertised = capabilities(false);
    vi.mocked(getDbtContext).mockResolvedValue({
        projectName: 'project_a',
        profileName: 'profile_a',
        targetDir: '/tmp/project_a/target',
        modelsDir: '/tmp/project_a/models',
    });
    vi.mocked(loadDbtTarget).mockResolvedValue({
        name: 'dev',
        target: { type: 'postgres', dbname: 'database_a', schema: 'public' },
    });
    vi.mocked(warehouseCredentialsFromDbtTarget).mockResolvedValue({
        type: WarehouseTypes.POSTGRES,
        dbname: 'database_a',
        schema: 'public',
    } as never);
    vi.mocked(readAndLoadLightdashProjectConfig).mockResolvedValue({
        spotlight: { default_visibility: 'show' },
    });
    vi.mocked(lightdashApi).mockImplementation(async ({ method, url }) => {
        if (url.endsWith('/capabilities')) return advertised as never;
        if (method === 'POST' && url.endsWith('/deploy'))
            return { deploySessionUuid: sessionUuid } as never;
        if (url.endsWith('/batch'))
            return { batchNumber: 0, exploreCount: 1 } as never;
        if (url.endsWith('/finalize'))
            return {
                exploreCount: 1,
                status: DeploySessionStatus.COMPLETED,
            } as never;
        return { exploreCount: 1 } as never;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(GlobalState, 'log').mockImplementation(() => {});
    vi.spyOn(GlobalState, 'debug').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it('negotiates the results envelope and reads the location for single connection routes', async () => {
    await expect(getDeployMetadata(options)).resolves.toEqual(metadata);
    expect(lightdashApi).toHaveBeenCalledWith({
        method: 'GET',
        url: '/api/v2/projects/project_a/deploy/capabilities',
        body: undefined,
        safeToRetry: true,
    });
});

it('sends an Athena region with the database', async () => {
    vi.mocked(loadDbtTarget).mockResolvedValue({
        name: 'dev',
        target: {
            type: 'athena',
            database: 'database_a',
            schema: 'schema_a',
            region_name: 'region_a',
        },
    });
    await expect(getDeployMetadata(options)).resolves.toMatchObject({
        dbtTarget: {
            type: WarehouseTypes.ATHENA,
            database: 'database_a',
            region: 'region_a',
        },
    });
});

it('does not require local project YAML when a profile is supplied', async () => {
    advertised = capabilities(true);
    vi.mocked(getDbtContext).mockRejectedValue(new Error('No local YAML'));
    await expect(getDeployMetadata(options)).resolves.toEqual(metadata);
    expect(getDbtContext).not.toHaveBeenCalled();
});

it.each([
    {
        type: 'snowflake',
        database: 'database_a',
        private_key_path: '/unavailable/private-key.p8',
    },
    {
        type: 'bigquery',
        project: 'database_a',
        dataset: 'dataset_a',
        method: 'service-account',
        keyfile: '/unavailable/service-account.json',
    },
    {
        type: 'bigquery',
        project: 'database_a',
        schema: 'dataset_a',
        method: 'oauth',
    },
    {
        type: 'postgres',
        dbname: 'database_a',
        sslmode: 'verify-full',
        sslcert: '/unavailable/cert.pem',
        sslkey: '/unavailable/key.pem',
        sslrootcert: '/unavailable/root.pem',
    },
    {
        type: 'redshift',
        database: 'database_a',
        method: 'iam',
        iam_profile: 'unavailable-aws-profile',
    },
    {
        type: 'databricks',
        catalog: 'database_a',
        schema: 'schema_a',
        auth_type: 'oauth',
    },
])(
    'reads active metadata without resolving authentication for %j',
    async (target) => {
        advertised = capabilities(true);
        vi.mocked(loadDbtTarget).mockResolvedValue({ name: 'dev', target });
        vi.mocked(warehouseCredentialsFromDbtTarget).mockRejectedValue(
            new Error('Authentication credentials are unavailable'),
        );
        await expect(getDeployMetadata(options)).resolves.toEqual({
            ...metadata,
            dbtTarget: { type: target.type, database: 'database_a' },
        });
        expect(warehouseCredentialsFromDbtTarget).not.toHaveBeenCalled();
    },
);

it.each([false, true])(
    'handles missing direct locations while peers are active=%s',
    async (active) => {
        advertised = capabilities(active);
        vi.mocked(loadDbtTarget).mockResolvedValue({
            name: 'dev',
            target: {
                type: 'bigquery',
                method: 'oauth',
                schema: 'not_a_project',
            },
        });
        if (active) {
            await expect(getDeployMetadata(options)).rejects.toThrow(
                'profile "profile_a" and target "dev": the selected target has no database or catalog',
            );
        } else {
            await expect(getDeployMetadata(options)).resolves.toEqual({
                cliCapabilities: metadata.cliCapabilities,
                dbtProjectName: 'project_a',
            });
        }
        expect(warehouseCredentialsFromDbtTarget).not.toHaveBeenCalled();
    },
);

it('names the actual default target in a profile lookup failure', async () => {
    advertised = capabilities(true);
    const profilesDir = await fs.mkdtemp(
        path.join(tmpdir(), 'dbt-default-target-'),
    );
    try {
        await fs.writeFile(
            path.join(profilesDir, 'profiles.yml'),
            'profile_a:\n  target: prod\n  outputs: {}\n',
        );
        const profiles =
            await vi.importActual<typeof import('../dbt/profile')>(
                '../dbt/profile',
            );
        vi.mocked(loadDbtTarget).mockImplementationOnce(profiles.loadDbtTarget);
        await expect(
            getDeployMetadata({ ...options, profilesDir, target: undefined }),
        ).rejects.toThrow(
            'profile "profile_a" and target "prod": the selected target does not exist. Fix the dbt profile or target.',
        );
    } finally {
        await fs.rm(profilesDir, { recursive: true, force: true });
    }
});

it('does not negotiate or read profiles for native YAML projects', async () => {
    await expect(
        getDeployMetadata({
            ...options,
            projectType: CliProjectType.LightdashYaml,
        }),
    ).resolves.toBeUndefined();
    expect(lightdashApi).not.toHaveBeenCalled();
    expect(loadDbtTarget).not.toHaveBeenCalled();
});

it.each([
    missingEndpoint(),
    new ConnectionServerError('Missing endpoint', 404),
])(
    'preserves old server behavior after a capability 404 (%s)',
    async (error) => {
        vi.mocked(lightdashApi).mockRejectedValue(error);
        await expect(getDeployMetadata(options)).resolves.toBeUndefined();
        expect(loadDbtTarget).not.toHaveBeenCalled();
    },
);

it('propagates capability failures other than 404 before any upload', async () => {
    const error = new Error('The server is unavailable');
    vi.mocked(lightdashApi).mockRejectedValue(error);
    await expect(deploy([explore], options)).rejects.toBe(error);
    expect(lightdashApi).toHaveBeenCalledTimes(1);
});

it.each([
    { ...capabilities(true), version: 2 },
    { ...capabilities(true), dbtProjectIdentity: 2 },
    { ...capabilities(true), dbtTargetLocation: 2 },
    { ...capabilities(true), peerDbtSources: { active: 'true' } },
    { status: 'ok', results: capabilities(true) },
])(
    'does not activate unsupported or invalid capabilities (%j)',
    async (value) => {
        advertised = value;
        await expect(
            getDeployMetadata({ ...options, dbtProjectName: undefined }),
        ).resolves.toBeUndefined();
        expect(loadDbtTarget).not.toHaveBeenCalled();
    },
);

it.each([false, true])(
    'requires a readable profile only while peers are active=%s',
    async (active) => {
        advertised = capabilities(active);
        vi.mocked(loadDbtTarget).mockRejectedValue(
            new Error('ENOENT private-host password=secret_value'),
        );
        if (active) {
            await expect(
                deploy([explore], { ...options, connectionRoute: 'multi' }),
            ).rejects.toThrow(
                'profile "profile_a" and target "dev": a required file is missing',
            );
            expect(lightdashApi).toHaveBeenCalledTimes(1);
        } else {
            await expect(getDeployMetadata(options)).resolves.toEqual({
                cliCapabilities: metadata.cliCapabilities,
                dbtProjectName: 'project_a',
            });
        }
        expect(GlobalState.debug).not.toHaveBeenCalled();
    },
);

it('preserves the legacy multi-route debug warning while peers are inactive', async () => {
    const error = new Error('profile cannot be read');
    vi.mocked(loadDbtTarget).mockRejectedValue(error);
    await deploy([explore], {
        ...options,
        connectionRoute: 'multi',
        batchedDeploy: false,
    });
    expect(GlobalState.debug).toHaveBeenCalledWith(
        '> Could not read the dbt target database: profile cannot be read',
    );
});

it('sends no identity or capabilities on a native YAML upload', async () => {
    await deploy([explore], {
        ...options,
        projectType: CliProjectType.LightdashYaml,
        batchedDeploy: false,
    });
    const uploads = vi.mocked(lightdashApi).mock.calls.map(([call]) => call);
    expect(uploads.some((call) => call.url.endsWith('/capabilities'))).toBe(
        false,
    );
    expect(uploads[0]).toEqual({
        method: 'PUT',
        url: '/api/v1/projects/project_a/explores?complete=false',
        body: JSON.stringify([explore]),
    });
    expect(loadDbtTarget).not.toHaveBeenCalled();
});

it.each([
    ['ENOENT private-host password=secret_value', 'a required file is missing'],
    ['EACCES private-host password=secret_value', 'current permissions'],
    [
        'env_var failed with secret_value at private-host',
        'environment variable',
    ],
    ['YAML invalid: host: private-host password: secret_value', 'invalid YAML'],
    [
        'invalid credentials at private-host password=secret_value',
        'configuration is invalid',
    ],
])('reports a sanitized profile failure (%s)', async (message, reason) => {
    advertised = capabilities(true);
    vi.mocked(loadDbtTarget).mockRejectedValue(new Error(message));
    const error = await getDeployMetadata(options).catch(
        (value: unknown) => value,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
        'profile "profile_a" and target "dev"',
    );
    expect((error as Error).message).toContain(reason);
    expect((error as Error).message).not.toMatch(/secret_value|private-host/);
});

it.each(['spark', 'missing database'])(
    'rejects an active target with %s before starting a session',
    async (invalid) => {
        advertised = capabilities(true);
        if (invalid === 'spark')
            vi.mocked(loadDbtTarget).mockResolvedValue({
                name: 'dev',
                target: { type: 'spark' },
            });
        else
            vi.mocked(loadDbtTarget).mockResolvedValue({
                name: 'dev',
                target: { type: 'postgres', dbname: '', schema: '' },
            });
        await expect(deploy([explore], options)).rejects.toThrow(
            invalid === 'spark' ? 'spark adapter' : 'no database or catalog',
        );
        expect(lightdashApi).toHaveBeenCalledTimes(1);
    },
);

it.each([false, true])(
    'requires the supplied compile identity only while peers are active=%s',
    async (active) => {
        advertised = capabilities(active);
        if (active)
            await expect(
                getDeployMetadata({ ...options, dbtProjectName: undefined }),
            ).rejects.toThrow('require a dbt project name');
        else
            await expect(
                getDeployMetadata({ ...options, dbtProjectName: undefined }),
            ).resolves.toEqual({
                cliCapabilities: metadata.cliCapabilities,
                dbtTarget: metadata.dbtTarget,
            });
    },
);

it.each([{ dbtModelNames: undefined }, { dbtModelNames: ['model_x'] }])(
    'uses the direct v2 object with negotiated metadata and inventory %j',
    async ({ dbtModelNames }) => {
        await deploy([explore], {
            ...options,
            dbtModelNames,
            batchedDeploy: false,
        });
        const upload = vi
            .mocked(lightdashApi)
            .mock.calls.find(
                ([call]) =>
                    call.method === 'PUT' && call.url.endsWith('/deploy'),
            )?.[0];
        expect(upload).toBeDefined();
        expect(JSON.parse(upload!.body as string)).toEqual({
            explores: [explore],
            complete: false,
            ...metadata,
            ...(dbtModelNames === undefined ? {} : { dbtModelNames }),
        });
    },
);

it('keeps the legacy target separate from metadata on each staged request', async () => {
    await deploy([explore], {
        ...options,
        deployTarget: { database: 'legacy_database' },
        complete: true,
    });
    const uploads = vi
        .mocked(lightdashApi)
        .mock.calls.map(([call]) => call)
        .filter((call) => call.method === 'POST');
    expect(uploads.map((call) => call.url)).toEqual([
        '/api/v2/projects/project_a/deploy',
        `/api/v2/projects/project_a/deploy/${sessionUuid}/batch`,
        `/api/v2/projects/project_a/deploy/${sessionUuid}/finalize`,
    ]);
    uploads.forEach((call) =>
        expect(JSON.parse(call.body as string)).toMatchObject(metadata),
    );
    expect(JSON.parse(uploads[0].body as string)).not.toHaveProperty('target');
    expect(JSON.parse(uploads[1].body as string)).not.toHaveProperty('target');
    expect(JSON.parse(uploads[2].body as string).target).toEqual({
        database: 'legacy_database',
    });
});

it('does not treat negotiated metadata as an agent deployment override', async () => {
    await runWithAgentConnectionSelection('default', () =>
        deploy([explore], { ...options, batchedDeploy: false }),
    );
    const upload = vi
        .mocked(lightdashApi)
        .mock.calls.find(
            ([call]) => call.method === 'PUT' && call.url.endsWith('/deploy'),
        )?.[0];
    expect(JSON.parse(upload!.body as string)).toMatchObject(metadata);
    expect(JSON.parse(upload!.body as string)).not.toHaveProperty('target');
});

it('falls back without metadata if negotiated agent session and direct routes hit an old pod', async () => {
    const original = vi.mocked(lightdashApi).getMockImplementation()!;
    vi.mocked(lightdashApi).mockImplementation(async (call) => {
        if (call.url.endsWith('/deploy'))
            throw new ConnectionServerError('Missing endpoint', 404);
        return original(call);
    });
    await runWithAgentConnectionSelection('default', () =>
        deploy([explore], options),
    );
    expect(lightdashApi).toHaveBeenCalledWith({
        method: 'PUT',
        url: '/api/v1/projects/project_a/explores?complete=false',
        body: JSON.stringify([explore]),
    });
});

it.each([false, true])(
    'drops new fields when direct v2 returns a rolling-pod 404, inventory=%s',
    async (inventory) => {
        const original = vi.mocked(lightdashApi).getMockImplementation()!;
        vi.mocked(lightdashApi).mockImplementation(async (call) => {
            if (call.method === 'PUT' && call.url.endsWith('/deploy'))
                throw missingEndpoint();
            return original(call);
        });
        await deploy([explore], {
            ...options,
            dbtModelNames: inventory ? ['model_x'] : undefined,
            batchedDeploy: false,
            sourceUuid: 'source_a',
            deployTarget: { database: 'legacy_database' },
        });
        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'PUT',
            url: '/api/v1/projects/project_a/explores?complete=false&sourceUuid=source_a&targetDatabase=legacy_database',
            body: JSON.stringify([explore]),
        });
    },
);

it('falls back after the old TSOA body schema requires a missing model inventory', async () => {
    const backendRequire = createRequire(
        path.join(__dirname, '../../../backend/package.json'),
    );
    const { ExpressTemplateService } = backendRequire('@tsoa/runtime') as {
        ExpressTemplateService: new (
            models: Record<string, unknown>,
            config: Record<string, unknown>,
        ) => {
            getValidatedArgs: (params: {
                args: Record<string, unknown>;
                request: { body: unknown };
                response: Record<string, never>;
            }) => unknown;
        };
    };
    const service = new ExpressTemplateService(
        { AnyType: { dataType: 'refAlias', type: { dataType: 'any' } } },
        { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true },
    );
    const bodySchema = {
        in: 'body',
        name: 'body',
        required: true,
        dataType: 'nestedObjectLiteral',
        nestedProperties: {
            target: { ref: 'DeployTarget' },
            sourceUuid: { dataType: 'string' },
            dbtModelNames: {
                dataType: 'array',
                array: { dataType: 'string' },
                required: true,
            },
            complete: { dataType: 'boolean', required: true },
            explores: {
                dataType: 'array',
                array: { dataType: 'refAlias', ref: 'AnyType' },
                required: true,
            },
        },
    };
    const original = vi.mocked(lightdashApi).getMockImplementation()!;
    vi.mocked(lightdashApi).mockImplementation(async (call) => {
        if (call.method === 'PUT' && call.url.endsWith('/deploy')) {
            try {
                service.getValidatedArgs({
                    args: { body: bodySchema },
                    request: { body: JSON.parse(call.body as string) },
                    response: {},
                });
            } catch (error) {
                expect(error).toMatchObject({
                    name: 'ValidateError',
                    fields: {
                        'body.dbtModelNames': {
                            message: "'dbtModelNames' is required",
                        },
                    },
                });
                const validation = error as Error & {
                    fields: Record<string, unknown>;
                };
                throw legacyValidationError(validation.fields);
            }
        }
        return original(call);
    });

    await deploy([explore], { ...options, batchedDeploy: false });

    expect(lightdashApi).toHaveBeenCalledWith({
        method: 'PUT',
        url: '/api/v1/projects/project_a/explores?complete=false',
        body: JSON.stringify([explore]),
    });
    const v2Upload = vi
        .mocked(lightdashApi)
        .mock.calls.find(
            ([call]) => call.method === 'PUT' && call.url.endsWith('/deploy'),
        )?.[0];
    expect(JSON.parse(v2Upload!.body as string)).not.toHaveProperty(
        'dbtModelNames',
    );
});

it.each([
    { 'body.dbtModelNames': { message: 'invalid array' } },
    { 'body.explores': { message: "'explores' is required" } },
    {
        'body.dbtModelNames': {
            message: "'dbtModelNames' is required",
            value: [],
        },
    },
    {
        'body.dbtModelNames': { message: "'dbtModelNames' is required" },
        'body.explores': { message: 'invalid array' },
    },
])('retains other validation failures (%j)', async (data) => {
    const error = legacyValidationError(data);
    expect(isLegacyDbtModelNamesValidationError(error)).toBe(false);
    const original = vi.mocked(lightdashApi).getMockImplementation()!;
    vi.mocked(lightdashApi).mockImplementation(async (call) => {
        if (call.method === 'PUT' && call.url.endsWith('/deploy')) throw error;
        return original(call);
    });
    await expect(
        deploy([explore], { ...options, batchedDeploy: false }),
    ).rejects.toBe(error);
    expect(
        vi
            .mocked(lightdashApi)
            .mock.calls.some(([call]) => call.url.includes('/explores?')),
    ).toBe(false);
});

it('does not drop a supplied inventory on a required-inventory validation error', async () => {
    const error = legacyValidationError({
        'body.dbtModelNames': { message: "'dbtModelNames' is required" },
    });
    const original = vi.mocked(lightdashApi).getMockImplementation()!;
    vi.mocked(lightdashApi).mockImplementation(async (call) => {
        if (call.method === 'PUT' && call.url.endsWith('/deploy')) throw error;
        return original(call);
    });
    await expect(
        deploy([explore], {
            ...options,
            dbtModelNames: ['model_x'],
            batchedDeploy: false,
        }),
    ).rejects.toBe(error);
});

it.each([false, true])(
    'keeps old server payloads unchanged after capability 404, inventory=%s',
    async (inventory) => {
        const original = vi.mocked(lightdashApi).getMockImplementation()!;
        vi.mocked(lightdashApi).mockImplementation(async (call) => {
            if (call.url.endsWith('/capabilities')) throw missingEndpoint();
            return original(call);
        });
        await deploy([explore], {
            ...options,
            batchedDeploy: false,
            dbtModelNames: inventory ? ['model_x'] : undefined,
        });
        const upload = vi
            .mocked(lightdashApi)
            .mock.calls.find(
                ([call]) =>
                    call.method === 'PUT' &&
                    (call.url.endsWith('/deploy') ||
                        call.url.includes('/explores?')),
            )?.[0];
        expect(JSON.parse(upload!.body as string)).toEqual(
            inventory
                ? {
                      explores: [explore],
                      dbtModelNames: ['model_x'],
                      complete: false,
                  }
                : [explore],
        );
        expect(loadDbtTarget).not.toHaveBeenCalled();
    },
);
