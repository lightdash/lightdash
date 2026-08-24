import {
    DimensionType,
    LightdashError,
    projectMergedManifest,
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
    extra: Record<string, unknown> = {},
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
    ...extra,
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
        expect(result.explores.map((explore) => explore.name)).toEqual([
            'orders',
            'compiled',
        ]);
        expect(lightdashRawApi).not.toHaveBeenCalled();
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining('Combined external manifest from'),
        );
    });

    test('projects, merges, and compiles served-only models while preserving local precedence and source identity', async () => {
        const projectManifest = manifest({
            'model.test.orders': dbtNode('model.test.orders', 'model', true, {
                description: 'Local orders description',
            }),
        });
        const servedManifest = projectMergedManifest(
            manifest({
                'model.test.orders': dbtNode(
                    'model.test.orders',
                    'model',
                    true,
                    {
                        description: 'Served orders description',
                        lightdash_source_name: 'local_source',
                    },
                ),
                'model.served.customers': dbtNode(
                    'model.served.customers',
                    'model',
                    true,
                    {
                        package_name: 'served',
                        lightdash_source_name: 'served_source',
                    },
                ),
                'model.served.customer_helper': dbtNode(
                    'model.served.customer_helper',
                    'model',
                    false,
                    {
                        package_name: 'served',
                        lightdash_source_name: 'served_source',
                    },
                ),
            }),
        );
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
            expect.stringMatching(/added [1-9]\d* model\(s\)/),
        );

        const modelsForValidation =
            vi.mocked(validateDbtModel).mock.calls[0][2];
        const localModel = modelsForValidation.find(
            (model) => model.unique_id === 'model.test.orders',
        ) as DbtModelNode & { lightdash_source_name?: string };
        expect(localModel.description).toBe('Local orders description');
        expect(localModel.lightdash_source_name).toBe('local_source');
        expect(
            modelsForValidation.map((model) => model.unique_id),
        ).not.toContain('model.served.customer_helper');
        expect(vi.mocked(validateDbtModel).mock.calls[0][3]).toEqual(
            new Set(['model.served.customers']),
        );
    });

    test('replaces the complete local source while retaining served models from other sources', async () => {
        const projectManifest = manifest({
            'model.local.orders': dbtNode('model.local.orders', 'model', true, {
                description: 'Local orders description',
            }),
        });
        const servedManifest = projectMergedManifest(
            manifest({
                'model.local.orders': dbtNode(
                    'model.local.orders',
                    'model',
                    true,
                    {
                        description: 'Served orders description',
                        lightdash_source_name: 'local_source',
                    },
                ),
                'model.local.deleted': dbtNode(
                    'model.local.deleted',
                    'model',
                    true,
                    {
                        lightdash_source_name: 'local_source',
                    },
                ),
                'model.other.customers': dbtNode(
                    'model.other.customers',
                    'model',
                    true,
                    {
                        lightdash_source_name: 'other_source',
                    },
                ),
            }),
        );
        vi.mocked(loadManifest).mockResolvedValue(projectManifest);
        vi.mocked(lightdashRawApi).mockResolvedValue(
            new Response(JSON.stringify(servedManifest)),
        );
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.local.orders'],
            originallySelectedModelIds: undefined,
        });

        const result = await compileProject({
            ...compileOptions(tempDir),
            combineManifestProjectUuid: 'project-uuid',
        });

        expect(result.isProjectComplete).toBe(true);
        expect(result.explores.map((explore) => explore.name)).toEqual([
            'orders',
            'customers',
        ]);
        const modelsForValidation =
            vi.mocked(validateDbtModel).mock.calls[0][2];
        expect(modelsForValidation).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    unique_id: 'model.local.orders',
                    description: 'Local orders description',
                    lightdash_source_name: 'local_source',
                }),
                expect.objectContaining({
                    unique_id: 'model.other.customers',
                    lightdash_source_name: 'other_source',
                }),
            ]),
        );
        expect(
            modelsForValidation.map((model) => model.unique_id),
        ).not.toContain('model.local.deleted');
    });

    test('additively combines selective local models with compiled served collision candidates', async () => {
        const projectManifest = manifest({
            'model.source_a.orders': dbtNode(
                'model.source_a.orders',
                'model',
                true,
                {
                    description: 'Local selected orders',
                },
            ),
            'model.source_a.customers': dbtNode(
                'model.source_a.customers',
                'model',
                true,
                {
                    description: 'Local unselected customers',
                },
            ),
        });
        const servedManifest = projectMergedManifest(
            manifest({
                'model.source_a.orders': dbtNode(
                    'model.source_a.orders',
                    'model',
                    true,
                    {
                        description: 'Served selected orders',
                        lightdash_source_name: 'source_a',
                    },
                ),
                'model.source_a.customers': dbtNode(
                    'model.source_a.customers',
                    'model',
                    true,
                    {
                        description: 'Served unselected customers',
                        lightdash_source_name: 'source_a',
                    },
                ),
                'model.source_a.deleted': dbtNode(
                    'model.source_a.deleted',
                    'model',
                    true,
                    {
                        lightdash_source_name: 'source_a',
                    },
                ),
                'model.source_b.customers': dbtNode(
                    'model.source_b.customers',
                    'model',
                    true,
                    {
                        lightdash_source_name: 'source_b',
                    },
                ),
            }),
        );
        vi.mocked(loadManifest).mockResolvedValue(projectManifest);
        vi.mocked(lightdashRawApi).mockResolvedValue(
            new Response(JSON.stringify(servedManifest)),
        );
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.source_a.orders'],
            originallySelectedModelIds: ['model.source_a.orders'],
        });

        const result = await compileProject({
            ...compileOptions(tempDir),
            combineManifestProjectUuid: 'project-uuid',
        });

        expect(result.isProjectComplete).toBe(false);
        const modelsForValidation =
            vi.mocked(validateDbtModel).mock.calls[0][2];
        expect(modelsForValidation).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    unique_id: 'model.source_a.orders',
                    description: 'Local selected orders',
                    lightdash_source_name: 'source_a',
                }),
                expect.objectContaining({
                    unique_id: 'model.source_a.customers',
                    description: 'Served unselected customers',
                    compiled: true,
                    lightdash_source_name: 'source_a',
                }),
                expect.objectContaining({
                    unique_id: 'model.source_a.deleted',
                    lightdash_source_name: 'source_a',
                }),
                expect.objectContaining({
                    unique_id: 'model.source_b.customers',
                    lightdash_source_name: 'source_b',
                }),
            ]),
        );
        const unselectedCollisionCandidates = modelsForValidation.filter(
            (model) => model.name === 'customers',
        ) as (DbtModelNode & { lightdash_source_name?: string })[];
        expect(
            unselectedCollisionCandidates.map((model) => ({
                uniqueId: model.unique_id,
                sourceName: model.lightdash_source_name,
            })),
        ).toEqual([
            {
                uniqueId: 'model.source_a.customers',
                sourceName: 'source_a',
            },
            {
                uniqueId: 'model.source_b.customers',
                sourceName: 'source_b',
            },
        ]);
    });

    test('rejects automatic combination when overlaps identify multiple local sources', async () => {
        const projectManifest = manifest({
            'model.local.orders': dbtNode('model.local.orders', 'model', true),
            'model.local.customers': dbtNode(
                'model.local.customers',
                'model',
                true,
            ),
        });
        const servedManifest = manifest({
            'model.local.orders': dbtNode('model.local.orders', 'model', true, {
                lightdash_source_name: 'source_a',
            }),
            'model.local.customers': dbtNode(
                'model.local.customers',
                'model',
                true,
                {
                    lightdash_source_name: 'source_c',
                },
            ),
        });
        vi.mocked(loadManifest).mockResolvedValue(projectManifest);
        vi.mocked(lightdashRawApi).mockResolvedValue(
            new Response(JSON.stringify(servedManifest)),
        );
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.local.orders', 'model.local.customers'],
            originallySelectedModelIds: undefined,
        });

        await expect(
            compileProject({
                ...compileOptions(tempDir),
                combineManifestProjectUuid: 'project-uuid',
            }),
        ).rejects.toThrow(
            'Cannot automatically combine manifest from the server: overlapping local models match multiple Lightdash sources (source_a, source_c)',
        );
        expect(validateDbtModel).not.toHaveBeenCalled();
    });

    test('skips automatic combination when the local dbt project is not a served source', async () => {
        const projectManifest = manifest({
            'model.local.orders': dbtNode('model.local.orders', 'model', true),
        });
        const servedManifest = manifest({
            'model.served.customers': dbtNode(
                'model.served.customers',
                'model',
                true,
            ),
        });
        vi.mocked(loadManifest).mockResolvedValue(projectManifest);
        vi.mocked(lightdashRawApi).mockResolvedValue(
            new Response(JSON.stringify(servedManifest)),
        );
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.local.orders'],
            originallySelectedModelIds: undefined,
        });

        const result = await compileProject({
            ...compileOptions(tempDir),
            combineManifestProjectUuid: 'project-uuid',
        });

        expect(result.explores.map((explore) => explore.name)).toEqual([
            'orders',
        ]);
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining(
                'the local dbt project is not a source of this Lightdash project',
            ),
        );
    });

    test('explains when a matching served manifest has no compiled models', async () => {
        const projectManifest = manifest({
            'model.test.orders': dbtNode('model.test.orders', 'model', true),
        });
        const servedManifest = manifest({
            'model.test.orders': dbtNode('model.test.orders', 'model', false, {
                lightdash_source_name: 'local_source',
            }),
            'model.served.helper': dbtNode(
                'model.served.helper',
                'model',
                false,
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

        await compileProject({
            ...compileOptions(tempDir),
            combineManifestProjectUuid: 'project-uuid',
        });

        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining('contains no compiled models'),
        );
    });

    test('explains when all compiled served models already overlap locally', async () => {
        const projectManifest = manifest({
            'model.test.orders': dbtNode('model.test.orders', 'model', true),
        });
        const servedManifest = manifest({
            'model.test.orders': dbtNode('model.test.orders', 'model', true, {
                lightdash_source_name: 'local_source',
            }),
        });
        vi.mocked(loadManifest).mockResolvedValue(projectManifest);
        vi.mocked(lightdashRawApi).mockResolvedValue(
            new Response(JSON.stringify(servedManifest)),
        );
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.test.orders'],
            originallySelectedModelIds: undefined,
        });

        await compileProject({
            ...compileOptions(tempDir),
            combineManifestProjectUuid: 'project-uuid',
        });

        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining(
                'all compiled models already exist in the preview manifest',
            ),
        );
    });

    test('notices when no served manifest exists and keeps the local manifest', async () => {
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
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining(
                'No server manifest found; continuing with the preview manifest',
            ),
        );
    });

    test.each([
        ['a null response', null],
        ['an array of nodes', { metadata: {}, nodes: [] }],
        ['array metadata', { metadata: [], nodes: {} }],
        ['missing metadata', { nodes: {} }],
    ])(
        'rejects %s from the server manifest endpoint and keeps the local manifest',
        async (_description, invalidManifest) => {
            vi.mocked(loadManifest).mockResolvedValue(
                manifest({
                    'model.test.orders': dbtNode(
                        'model.test.orders',
                        'model',
                        true,
                    ),
                }),
            );
            vi.mocked(lightdashRawApi).mockResolvedValue(
                new Response(JSON.stringify(invalidManifest)),
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
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    '/api/v1/projects/project-uuid/dbt/manifest returned an invalid manifest',
                ),
            );
        },
    );

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
