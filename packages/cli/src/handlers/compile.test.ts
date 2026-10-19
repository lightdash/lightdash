import {
    DefaultSupportedDbtVersion,
    DimensionType,
    isExploreError,
    MetricType,
    type DbtManifest,
    type LightdashModel,
} from '@lightdash/common';
import fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { Mock } from 'vitest';
import * as dbtContext from '../dbt/context';
import * as dbtManifest from '../dbt/manifest';
import * as dbtValidation from '../dbt/validation';
import * as lightdashLoader from '../lightdash/loader';
import { compile, type CompileHandlerOptions } from './compile';
import * as apiClient from './dbt/apiClient';
import * as dbtCompile from './dbt/compile';
import * as dbtVersion from './dbt/getDbtVersion';

vi.mock('execa');
vi.mock('../analytics/analytics');
vi.mock('../config', () => ({
    getConfig: vi.fn().mockResolvedValue({ user: null, context: null }),
}));

const modelWithBrokenMetric = {
    type: 'model',
    name: 'test_model',
    description: 'Test model',
    sql_from: 'SELECT * FROM test_table',
    dimensions: [
        {
            name: 'id',
            description: 'ID column',
            type: DimensionType.NUMBER,
            sql: 'id',
        },
    ],
    metrics: {
        broken_metric: {
            type: MetricType.SUM,
            sql: `\${missing_dimension}`,
        },
    },
} satisfies LightdashModel;

const getCompileOptions = (projectDir: string): CompileHandlerOptions => ({
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

describe('compile', () => {
    let tempDir: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        tempDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-compile-test-'),
        );

        // Create minimal lightdash.config.yml
        await fs.writeFile(
            path.join(tempDir, 'lightdash.config.yml'),
            `
warehouse:
  type: postgres
            `,
        );

        // Create lightdash/models directory and a test model
        const modelsDir = path.join(tempDir, 'lightdash', 'models');
        await fs.mkdir(modelsDir, { recursive: true });
        await fs.writeFile(
            path.join(modelsDir, 'test_model.yml'),
            `
version: 1
type: model
name: test_model
description: Test model
sql_from: "SELECT * FROM test_table"
dimensions:
  - name: id
    description: ID column
    type: number
    sql: id
            `,
        );
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test.each(['server', 'explicit'] as const)(
        'strips local dbt-loom stubs before source inference and combining the %s manifest',
        async (source) => {
            const node = (project: string, name: string) => ({
                unique_id: `model.${project}.${name}`,
                resource_type: 'model' as const,
                name,
                package_name: project,
                path: `${name}.sql`,
                original_file_path: `models/${name}.sql`,
                database: 'warehouse',
                schema: 'public',
                alias: name,
                relation_name: `"warehouse"."public"."${name}"`,
                compiled: true,
                compiled_code: 'select 1',
                raw_code: 'select 1',
                config: { materialized: 'table', snowflake_warehouse: '' },
                columns: {},
                meta: {},
                fqn: [project, name],
                checksum: { name: 'sha256', checksum: 'test' },
            });
            const localNode = node('local', 'orders');
            const upstreamNode = {
                ...node('upstream', 'products'),
                lightdash_source_name: 'upstream_source',
            };
            const localManifest: DbtManifest = {
                metadata: {
                    dbt_schema_version: '/v12.json',
                    generated_at: '',
                    adapter_type: 'postgres',
                },
                nodes: {
                    [localNode.unique_id]: localNode,
                    [upstreamNode.unique_id]: {
                        ...upstreamNode,
                        path: '',
                        original_file_path: '',
                        alias: 'external_stub',
                    },
                },
                metrics: {},
                docs: {},
            };
            const servedManifest: DbtManifest = {
                ...localManifest,
                nodes: {
                    [localNode.unique_id]: {
                        ...localNode,
                        lightdash_source_name: 'local_source',
                    },
                    [upstreamNode.unique_id]: upstreamNode,
                },
            };
            vi.spyOn(lightdashLoader, 'loadLightdashModels').mockResolvedValue(
                [],
            );
            vi.spyOn(dbtVersion, 'tryGetDbtVersion').mockResolvedValue({
                success: true,
                version: {
                    verboseVersion: '1.12.0',
                    versionOption: DefaultSupportedDbtVersion,
                    isDbtCloudCLI: false,
                    isDbtFusion: false,
                },
            });
            vi.spyOn(dbtContext, 'getDbtContext').mockResolvedValue({
                projectName: 'local',
                profileName: 'local',
                targetDir: tempDir,
                modelsDir: tempDir,
            });
            vi.spyOn(
                dbtCompile,
                'maybeCompileModelsAndJoins',
            ).mockResolvedValue({
                compiledModelIds: undefined,
                originallySelectedModelIds: undefined,
            });
            vi.spyOn(dbtManifest, 'loadManifest').mockResolvedValue(
                localManifest,
            );
            vi.spyOn(dbtManifest, 'loadCombineManifest').mockResolvedValue(
                servedManifest,
            );
            vi.spyOn(apiClient, 'lightdashRawApi').mockResolvedValue({
                json: async () => servedManifest,
            } as Awaited<ReturnType<typeof apiClient.lightdashRawApi>>);
            const validate = vi
                .spyOn(dbtValidation, 'validateDbtModel')
                .mockResolvedValue({ valid: [], invalid: [], skipped: [] });
            await compile({
                ...getCompileOptions(tempDir),
                ...(source === 'server'
                    ? { combineManifestProjectUuid: 'project-uuid' }
                    : { combineManifest: 'upstream-manifest.json' }),
            });
            expect(validate).toHaveBeenCalledOnce();
            expect(validate.mock.calls[0][2]).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        unique_id: localNode.unique_id,
                        ...(source === 'server'
                            ? { lightdash_source_name: 'local_source' }
                            : {}),
                    }),
                    expect.objectContaining(upstreamNode),
                ]),
            );
            expect(validate.mock.calls[0][2]).toHaveLength(2);
            expect(localManifest.nodes[upstreamNode.unique_id]).toHaveProperty(
                'alias',
                'external_stub',
            );
        },
    );

    test('should compile Lightdash YAML project without dbt installed', async () => {
        // Mock analytics to prevent actual tracking
        const { LightdashAnalytics } = await import('../analytics/analytics');
        (LightdashAnalytics.track as Mock).mockResolvedValue(undefined);

        const result = await compile(getCompileOptions(tempDir));

        // Should succeed even though dbt is not installed
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);

        // Analytics should be called even though dbt is not found
        const trackCalls = (LightdashAnalytics.track as Mock).mock.calls;

        expect(LightdashAnalytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'compile.started',
                properties: expect.objectContaining({
                    dbtVersion: undefined,
                }),
            }),
        );

        expect(LightdashAnalytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'compile.completed',
            }),
        );

        // Verify compile.started was called with undefined dbtVersion
        const startedCall = trackCalls.find(
            (call) => call[0].event === 'compile.started',
        );
        if (startedCall === undefined) {
            throw new Error('Expected compile.started analytics event');
        }
        expect(startedCall[0].properties.dbtVersion).toBeUndefined();
    });

    test('should allow partial compilation by default and allow it to be disabled explicitly', async () => {
        vi.spyOn(lightdashLoader, 'loadLightdashModels').mockResolvedValue([
            { ...modelWithBrokenMetric, sourcePath: 'models/test_model.yml' },
        ]);

        const errorOutput: string[] = [];
        vi.spyOn(console, 'error').mockImplementation((...args) => {
            errorOutput.push(args.map(String).join(' '));
        });

        const partialResult = await compile(getCompileOptions(tempDir));
        expect(partialResult.filter(isExploreError)).toHaveLength(0);
        expect(
            partialResult.flatMap((explore) =>
                isExploreError(explore) ? [] : (explore.warnings ?? []),
            ),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    message: expect.stringContaining('broken_metric'),
                }),
            ]),
        );
        expect(errorOutput).toEqual(
            expect.arrayContaining([
                expect.stringContaining('- PARTIAL_SUCCESS> test_model'),
                expect.stringContaining(
                    'Compiled 1 explores, SUCCESS=0 PARTIAL_SUCCESS=1 ERRORS=0',
                ),
            ]),
        );

        errorOutput.length = 0;
        const strictResult = await compile({
            ...getCompileOptions(tempDir),
            partialCompilation: false,
        });
        expect(strictResult.filter(isExploreError)).toHaveLength(1);
        expect(errorOutput).toEqual(
            expect.arrayContaining([
                expect.stringContaining('- ERROR> test_model'),
                expect.stringContaining(
                    'Compiled 1 explores, SUCCESS=0 ERRORS=1',
                ),
            ]),
        );
    });

    test('rejects malformed native YAML instead of compiling only the valid models', async () => {
        await fs.writeFile(
            path.join(tempDir, 'lightdash/models/broken.yml'),
            'type: model\ndimensions: [',
        );

        await expect(compile(getCompileOptions(tempDir))).rejects.toThrow(
            /broken.yml/,
        );
    });
});
