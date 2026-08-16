import {
    DimensionType,
    LightdashError,
    SupportedDbtVersions,
    type DbtManifest,
    type DbtModelNode,
} from '@lightdash/common';
import fs from 'fs/promises';
import { Response } from 'node-fetch';
import os from 'os';
import path from 'path';
import { getDbtContext } from '../dbt/context';
import { loadCombineManifest, loadManifest } from '../dbt/manifest';
import { validateDbtModel } from '../dbt/validation';
import { loadLightdashModels } from '../lightdash/loader';
import { compileProject, type CompileHandlerOptions } from './compile';
import { lightdashRawApi } from './dbt/apiClient';
import { maybeCompileModelsAndJoins } from './dbt/compile';
import { tryGetDbtVersion } from './dbt/getDbtVersion';

vi.mock('../analytics/analytics');
vi.mock('../config', () => ({
    getConfig: vi.fn().mockResolvedValue({ user: null, context: null }),
}));
vi.mock('../dbt/context');
vi.mock('../dbt/manifest', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../dbt/manifest')>()),
    loadCombineManifest: vi.fn(),
    loadManifest: vi.fn(),
}));
vi.mock('../dbt/validation');
vi.mock('../lightdash/loader');
vi.mock('./dbt/compile');
vi.mock('./dbt/getDbtVersion');
vi.mock('./dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./dbt/apiClient')>()),
    lightdashRawApi: vi.fn(),
}));

const dbtNode = (
    uniqueId: string,
    resourceType: 'model' | 'seed',
    compiled: boolean,
) => ({
    unique_id: uniqueId,
    name: uniqueId.split('.').at(-1) ?? uniqueId,
    resource_type: resourceType,
    package_name: 'test',
    path: `${uniqueId}.sql`,
    original_file_path: `models/${uniqueId}.sql`,
    alias: uniqueId.split('.').at(-1) ?? uniqueId,
    checksum: { name: 'sha256', checksum: uniqueId },
    tags: [],
    refs: [],
    sources: [],
    depends_on: { macros: [], nodes: [] },
    database: 'db',
    schema: 'public',
    fqn: ['test', uniqueId],
    raw_code: 'SELECT 1',
    columns: {
        id: {
            name: 'id',
            data_type: DimensionType.NUMBER,
            meta: {},
        },
    },
    meta: {},
    description: '',
    created_at: 0,
    language: 'sql',
    relation_name: `"db"."public"."${uniqueId}"`,
    config: { materialized: 'table' },
    compiled,
});

const manifest = (
    nodes: Record<string, ReturnType<typeof dbtNode>>,
): DbtManifest =>
    ({
        metadata: {
            dbt_schema_version:
                'https://schemas.getdbt.com/dbt/manifest/v12.json',
            generated_at: '2026-01-01T00:00:00Z',
            adapter_type: 'postgres',
        },
        nodes,
        sources: {},
        macros: {},
        docs: {},
        exposures: {},
        metrics: {},
    }) as unknown as DbtManifest;

const compileOptions = (projectDir: string): CompileHandlerOptions => ({
    projectDir,
    profilesDir: '',
    target: undefined,
    profile: undefined,
    vars: undefined,
    verbose: false,
    startOfWeek: 0,
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
    warehouseCredentials: false,
    disableTimestampConversion: false,
});

describe('compileProject completeness', () => {
    let tempDir: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        tempDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-compile-project-test-'),
        );
        await fs.writeFile(
            path.join(tempDir, 'lightdash.config.yml'),
            'warehouse:\n  type: postgres\n',
        );

        vi.mocked(tryGetDbtVersion).mockResolvedValue({
            success: true,
            version: {
                verboseVersion: '1.10.19',
                versionOption: SupportedDbtVersions.V1_10,
                isDbtCloudCLI: false,
                isDbtFusion: false,
            },
        });
        vi.mocked(getDbtContext).mockResolvedValue({
            projectName: 'test_project',
            profileName: 'test_profile',
            targetDir: path.join(tempDir, 'target'),
            modelsDir: 'models',
        });
        vi.mocked(loadLightdashModels).mockResolvedValue([]);
        vi.mocked(validateDbtModel).mockImplementation(
            async (_adapter, _version, models) => ({
                valid: models as DbtModelNode[],
                invalid: [],
                skipped: [],
            }),
        );
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('reports an unselected model and seed manifest as complete', async () => {
        const projectManifest = manifest({
            'model.test.orders': dbtNode('model.test.orders', 'model', true),
            'seed.test.countries': dbtNode(
                'seed.test.countries',
                'seed',
                false,
            ),
        });
        vi.mocked(loadManifest).mockResolvedValue(projectManifest);
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.test.orders'],
            originallySelectedModelIds: undefined,
        });

        const result = await compileProject(compileOptions(tempDir));

        expect(result.isProjectComplete).toBe(true);
    });

    test('reports a selected subset as incomplete', async () => {
        const projectManifest = manifest({
            'model.test.orders': dbtNode('model.test.orders', 'model', true),
            'model.test.customers': dbtNode(
                'model.test.customers',
                'model',
                true,
            ),
        });
        vi.mocked(loadManifest).mockResolvedValue(projectManifest);
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.test.orders'],
            originallySelectedModelIds: ['model.test.orders'],
        });

        const result = await compileProject(compileOptions(tempDir));

        expect(result.isProjectComplete).toBe(false);
    });

    test('derives completeness before combining an external manifest', async () => {
        const projectManifest = manifest({
            'model.test.orders': dbtNode('model.test.orders', 'model', true),
        });
        const externalManifest = manifest({
            'model.external.compiled': dbtNode(
                'model.external.compiled',
                'model',
                true,
            ),
            'model.external.uncompiled': dbtNode(
                'model.external.uncompiled',
                'model',
                false,
            ),
        });
        vi.mocked(loadManifest).mockResolvedValue(projectManifest);
        vi.mocked(loadCombineManifest).mockResolvedValue(externalManifest);
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.test.orders'],
            originallySelectedModelIds: undefined,
        });

        const result = await compileProject({
            ...compileOptions(tempDir),
            combineManifest: 'external-manifest.json',
            combineManifestProjectUuid: 'project-uuid',
        });

        expect(result.isProjectComplete).toBe(true);
        expect(lightdashRawApi).not.toHaveBeenCalled();
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining('Combined external manifest from'),
        );
    });

    test('includes models from the served project manifest', async () => {
        const projectManifest = manifest({
            'model.test.orders': dbtNode('model.test.orders', 'model', true),
        });
        const servedManifest = manifest({
            'model.test.customers': dbtNode(
                'model.test.customers',
                'model',
                true,
            ),
        });
        vi.mocked(loadManifest).mockResolvedValue(projectManifest);
        vi.mocked(lightdashRawApi).mockResolvedValue(
            new Response(JSON.stringify(servedManifest)),
        );
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.test.orders'],
            originallySelectedModelIds: undefined,
        });

        const result = await compileProject({
            ...compileOptions(tempDir),
            combineManifestProjectUuid: 'project-uuid',
        });

        expect(result.explores.map((explore) => explore.name)).toEqual([
            'orders',
            'customers',
        ]);
        expect(result.isProjectComplete).toBe(true);
        expect(lightdashRawApi).toHaveBeenCalledWith({
            method: 'GET',
            url: '/api/v1/projects/project-uuid/dbt/manifest',
            body: undefined,
        });
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining('Combined manifest from the server'),
        );
    });

    test('keeps the local manifest without warning when no served manifest exists', async () => {
        vi.mocked(loadManifest).mockResolvedValue(
            manifest({
                'model.test.orders': dbtNode(
                    'model.test.orders',
                    'model',
                    true,
                ),
            }),
        );
        vi.mocked(lightdashRawApi).mockRejectedValue(
            new LightdashError({
                message: 'Manifest not found',
                name: 'NotFoundError',
                statusCode: 404,
                data: {},
            }),
        );
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.test.orders'],
            originallySelectedModelIds: undefined,
        });

        const result = await compileProject({
            ...compileOptions(tempDir),
            combineManifestProjectUuid: 'project-uuid',
        });

        expect(result.explores.map((explore) => explore.name)).toEqual([
            'orders',
        ]);
        expect(console.error).not.toHaveBeenCalledWith(
            expect.stringContaining('Could not fetch the server manifest'),
        );
    });

    test.each([
        [
            'an authorization error',
            new LightdashError({
                message: 'Not authorized',
                name: 'AuthorizationError',
                statusCode: 401,
                data: {},
            }),
        ],
        [
            'a server error',
            new LightdashError({
                message: 'Server unavailable',
                name: 'InternalServerError',
                statusCode: 500,
                data: {},
            }),
        ],
        [
            'a permission error',
            new LightdashError({
                message: 'Forbidden',
                name: 'ForbiddenError',
                statusCode: 403,
                data: {},
            }),
        ],
        ['a network error', new Error('Connection refused')],
    ])(
        'warns once and keeps the local manifest after %s',
        async (_description, error) => {
            vi.mocked(loadManifest).mockResolvedValue(
                manifest({
                    'model.test.orders': dbtNode(
                        'model.test.orders',
                        'model',
                        true,
                    ),
                }),
            );
            vi.mocked(lightdashRawApi).mockRejectedValue(error);
            vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
                compiledModelIds: ['model.test.orders'],
                originallySelectedModelIds: undefined,
            });

            const result = await compileProject({
                ...compileOptions(tempDir),
                combineManifestProjectUuid: 'project-uuid',
            });

            expect(result.explores.map((explore) => explore.name)).toEqual([
                'orders',
            ]);
            expect(
                vi
                    .mocked(console.error)
                    .mock.calls.filter(([message]) =>
                        String(message).includes(
                            'Could not fetch the server manifest',
                        ),
                    ),
            ).toHaveLength(1);
        },
    );

    test('does not fetch a served manifest when manifest combining is disabled', async () => {
        vi.mocked(loadManifest).mockResolvedValue(
            manifest({
                'model.test.orders': dbtNode(
                    'model.test.orders',
                    'model',
                    true,
                ),
            }),
        );
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.test.orders'],
            originallySelectedModelIds: undefined,
        });

        await compileProject({
            ...compileOptions(tempDir),
            combine: false,
            combineManifestProjectUuid: 'project-uuid',
        });

        expect(lightdashRawApi).not.toHaveBeenCalled();
    });
});
