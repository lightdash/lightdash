import {
    DbtVersionOptionLatest,
    DimensionType,
    InlineErrorType,
    isExploreError,
    MetricType,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreatePostgresCredentials,
    type DbtManifest,
    type DbtModelNode,
    type LightdashModel,
} from '@lightdash/common';
import {
    PostgresWarehouseClient,
    validateWarehouseColumnReferences,
} from '@lightdash/warehouses';
import fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { getDbtContext } from '../dbt/context';
import { loadManifest } from '../dbt/manifest';
import { validateDbtModel } from '../dbt/validation';
import { loadLightdashModels } from '../lightdash/loader';
import { compile, type CompileHandlerOptions } from './compile';
import { maybeCompileModelsAndJoins } from './dbt/compile';
import { tryGetDbtVersion } from './dbt/getDbtVersion';
import getWarehouseClient from './dbt/getWarehouseClient';

vi.mock('../analytics/analytics');
vi.mock('../config', () => ({
    getConfig: vi.fn().mockResolvedValue({ user: null, context: null }),
}));
vi.mock('../dbt/context');
vi.mock('../dbt/manifest');
vi.mock('../dbt/validation');
vi.mock('../lightdash/loader');
vi.mock('./dbt/compile');
vi.mock('./dbt/getDbtVersion');
vi.mock('./dbt/getWarehouseClient');
vi.mock('@lightdash/warehouses', async (importOriginal) => {
    const original =
        await importOriginal<typeof import('@lightdash/warehouses')>();
    return {
        ...original,
        validateWarehouseColumnReferences: vi.fn(),
    };
});

const model: DbtModelNode = {
    checksum: { name: '', checksum: '' },
    fqn: [],
    language: '',
    package_name: '',
    path: '',
    raw_code: '',
    compiled: true,
    unique_id: 'model.test.my_model',
    description: '',
    resource_type: 'model',
    columns: {
        id: {
            name: 'id',
            data_type: DimensionType.NUMBER,
            meta: {},
        },
    },
    meta: {},
    database: 'my_database',
    schema: 'my_schema',
    name: 'my_model',
    alias: 'my_model',
    tags: [],
    relation_name: '"my_database"."my_schema"."my_model"',
    depends_on: { nodes: [] },
    patch_path: null,
    original_file_path: '',
};

// Metric name collides with the `id` dimension, producing an unconditional
// DUPLICATE_FIELD_NAME warning even when partial compilation is disabled
const modelWithDuplicateMetricName: DbtModelNode = {
    ...model,
    columns: {
        id: {
            name: 'id',
            data_type: DimensionType.NUMBER,
            meta: { metrics: { id: { type: MetricType.COUNT } } },
        },
    },
};

const lightdashYmlModel: LightdashModel = {
    type: 'model',
    name: 'yml_model',
    sql_from: '"my_database"."my_schema"."yml_model"',
    dimensions: [{ name: 'id', type: DimensionType.NUMBER, sql: 'id' }],
};

// Models are injected through the mocked validateDbtModel, so nodes stay empty
const manifest: DbtManifest = {
    nodes: {},
    metadata: {
        dbt_schema_version: 'https://schemas.getdbt.com/dbt/manifest/v12.json',
        generated_at: '2026-01-01T00:00:00Z',
        adapter_type: 'postgres',
    },
    metrics: {},
    docs: {},
};

const baseOptions = (projectDir: string): CompileHandlerOptions => ({
    projectDir,
    profilesDir: '',
    target: undefined,
    profile: undefined,
    vars: undefined,
    verbose: false,
    startOfWeek: 0,
    skipWarehouseCatalog: undefined,
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

const SKIP_WARNING =
    'Skipping warehouse column validation because --skip-warehouse-catalog was supplied';

const YML_SKIP_WARNING =
    'Skipping warehouse column validation because it is not supported for Lightdash YAML projects';

const DBT_CLOUD_SKIP_WARNING =
    'Skipping warehouse column validation because dbt Cloud CLI cannot run warehouse queries';

const setupWarehouseClient = () => {
    const credentials: CreatePostgresCredentials = {
        type: WarehouseTypes.POSTGRES,
        host: 'localhost',
        user: 'test_user',
        password: 'test_password',
        port: 5432,
        dbname: 'my_database',
        schema: 'my_schema',
    };
    const warehouseClient = new PostgresWarehouseClient(credentials);
    vi.spyOn(warehouseClient, 'getCatalog').mockResolvedValue({});
    vi.mocked(getWarehouseClient).mockResolvedValue({
        warehouseClient,
        credentials,
    });
    return warehouseClient;
};

const mockProberToAppendWarning = (message: string) => {
    vi.mocked(validateWarehouseColumnReferences).mockImplementation(
        async ({ explores }) =>
            explores.map((explore) =>
                isExploreError(explore)
                    ? explore
                    : {
                          ...explore,
                          warnings: [
                              ...(explore.warnings ?? []),
                              {
                                  type: InlineErrorType.WAREHOUSE_COLUMN_ERROR,
                                  message,
                              },
                          ],
                      },
            ),
    );
};

describe('compile warehouse column validation', () => {
    let tempDir: string;
    let errorOutput: string[];

    beforeEach(async () => {
        vi.clearAllMocks();
        tempDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-compile-validation-test-'),
        );

        vi.mocked(tryGetDbtVersion).mockResolvedValue({
            success: true,
            version: {
                verboseVersion: '1.8.0',
                versionOption: SupportedDbtVersions.V1_8,
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
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: undefined,
            originallySelectedModelIds: undefined,
        });
        vi.mocked(loadManifest).mockResolvedValue(manifest);
        vi.mocked(loadLightdashModels).mockResolvedValue([]);
        vi.mocked(validateDbtModel).mockResolvedValue({
            valid: [model],
            invalid: [],
            skipped: [],
        });
        vi.mocked(validateWarehouseColumnReferences).mockImplementation(
            async ({ explores }) => explores,
        );

        errorOutput = [];
        vi.spyOn(console, 'error').mockImplementation((...args) => {
            errorOutput.push(args.map(String).join(' '));
        });
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('skips warehouse client and column validation when skipWarehouseCatalog is set', async () => {
        const result = await compile({
            ...baseOptions(tempDir),
            skipWarehouseCatalog: true,
            validateWarehouseColumns: true,
        });

        // Credential-less CI flow: no warehouse client is ever created
        expect(getWarehouseClient).not.toHaveBeenCalled();
        expect(validateWarehouseColumnReferences).not.toHaveBeenCalled();
        expect(result.filter(isExploreError)).toEqual([]);
        expect(result.map((explore) => explore.name)).toEqual(['my_model']);
        expect(errorOutput).toEqual(
            expect.arrayContaining([expect.stringContaining(SKIP_WARNING)]),
        );
    });

    test('validates warehouse column references when warehouse catalog is not skipped', async () => {
        const warehouseClient = setupWarehouseClient();

        const result = await compile({
            ...baseOptions(tempDir),
            skipWarehouseCatalog: false,
            validateWarehouseColumns: true,
        });

        expect(getWarehouseClient).toHaveBeenCalledTimes(1);
        expect(warehouseClient.getCatalog).toHaveBeenCalledTimes(1);
        expect(validateWarehouseColumnReferences).toHaveBeenCalledTimes(1);
        expect(validateWarehouseColumnReferences).toHaveBeenCalledWith(
            expect.objectContaining({ client: warehouseClient }),
        );
        expect(result.filter(isExploreError)).toEqual([]);
        expect(errorOutput).not.toEqual(
            expect.arrayContaining([
                expect.stringContaining('Skipping warehouse column validation'),
            ]),
        );
    });

    test('does not warn about column validation when it was not requested', async () => {
        const result = await compile({
            ...baseOptions(tempDir),
            skipWarehouseCatalog: true,
        });

        expect(getWarehouseClient).not.toHaveBeenCalled();
        expect(validateWarehouseColumnReferences).not.toHaveBeenCalled();
        expect(result.filter(isExploreError)).toEqual([]);
        expect(errorOutput).not.toEqual(
            expect.arrayContaining([expect.stringContaining(SKIP_WARNING)]),
        );
    });

    describe('compile output for warehouse column warnings', () => {
        const WAREHOUSE_WARNING =
            'Warehouse rejected column reference TABLE.rolling_30d_avg_sales in model "my_model"';

        test('renders PARTIAL_SUCCESS and the warning when partial compilation is enabled', async () => {
            vi.stubEnv('PARTIAL_COMPILATION_ENABLED', 'true');
            setupWarehouseClient();
            mockProberToAppendWarning(WAREHOUSE_WARNING);

            await compile({
                ...baseOptions(tempDir),
                validateWarehouseColumns: true,
            });

            expect(errorOutput).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('- PARTIAL_SUCCESS> my_model'),
                    expect.stringContaining(WAREHOUSE_WARNING),
                    expect.stringContaining(
                        'Compiled 1 explores, SUCCESS=0 PARTIAL_SUCCESS=1 ERRORS=0',
                    ),
                ]),
            );
        });

        test('renders PARTIAL_SUCCESS and the warning when partial compilation is disabled', async () => {
            vi.stubEnv('PARTIAL_COMPILATION_ENABLED', 'false');
            setupWarehouseClient();
            mockProberToAppendWarning(WAREHOUSE_WARNING);

            const result = await compile({
                ...baseOptions(tempDir),
                validateWarehouseColumns: true,
            });

            expect(errorOutput).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('- PARTIAL_SUCCESS> my_model'),
                    expect.stringContaining(WAREHOUSE_WARNING),
                    expect.stringContaining(
                        'Compiled 1 explores, SUCCESS=0 PARTIAL_SUCCESS=1 ERRORS=0',
                    ),
                ]),
            );
            // The warning must still reach backend validation untouched
            expect(result.filter(isExploreError)).toEqual([]);
            const warningTypes = result.flatMap((explore) =>
                isExploreError(explore)
                    ? []
                    : (explore.warnings ?? []).map((warning) => warning.type),
            );
            expect(warningTypes).toEqual([
                InlineErrorType.WAREHOUSE_COLUMN_ERROR,
            ]);
        });

        test('keeps generic warnings hidden when partial compilation is disabled', async () => {
            vi.stubEnv('PARTIAL_COMPILATION_ENABLED', 'false');
            vi.mocked(validateDbtModel).mockResolvedValue({
                valid: [modelWithDuplicateMetricName],
                invalid: [],
                skipped: [],
            });

            await compile({
                ...baseOptions(tempDir),
                skipWarehouseCatalog: true,
            });

            expect(errorOutput).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('- SUCCESS> my_model'),
                    expect.stringContaining(
                        'Compiled 1 explores, SUCCESS=1 ERRORS=0',
                    ),
                ]),
            );
            expect(errorOutput).not.toEqual(
                expect.arrayContaining([
                    expect.stringContaining('PARTIAL_SUCCESS'),
                ]),
            );
            expect(errorOutput).not.toEqual(
                expect.arrayContaining([
                    expect.stringContaining('Skipped metric "id"'),
                ]),
            );
        });

        test('renders generic warnings when partial compilation is enabled', async () => {
            vi.stubEnv('PARTIAL_COMPILATION_ENABLED', 'true');
            vi.mocked(validateDbtModel).mockResolvedValue({
                valid: [modelWithDuplicateMetricName],
                invalid: [],
                skipped: [],
            });

            await compile({
                ...baseOptions(tempDir),
                skipWarehouseCatalog: true,
            });

            expect(errorOutput).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('- PARTIAL_SUCCESS> my_model'),
                    expect.stringContaining('Skipped metric "id"'),
                    expect.stringContaining(
                        'Compiled 1 explores, SUCCESS=0 PARTIAL_SUCCESS=1 ERRORS=0',
                    ),
                ]),
            );
        });

        test('renders only the warehouse warning when partial compilation is disabled and generic warnings exist', async () => {
            vi.stubEnv('PARTIAL_COMPILATION_ENABLED', 'false');
            vi.mocked(validateDbtModel).mockResolvedValue({
                valid: [modelWithDuplicateMetricName],
                invalid: [],
                skipped: [],
            });
            setupWarehouseClient();
            mockProberToAppendWarning(WAREHOUSE_WARNING);

            await compile({
                ...baseOptions(tempDir),
                validateWarehouseColumns: true,
            });

            expect(errorOutput).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('- PARTIAL_SUCCESS> my_model'),
                    expect.stringContaining(WAREHOUSE_WARNING),
                    expect.stringContaining(
                        'Compiled 1 explores, SUCCESS=0 PARTIAL_SUCCESS=1 ERRORS=0',
                    ),
                ]),
            );
            expect(errorOutput).not.toEqual(
                expect.arrayContaining([
                    expect.stringContaining('Skipped metric "id"'),
                ]),
            );
        });
    });

    describe('dbt cloud cli', () => {
        beforeEach(() => {
            vi.mocked(tryGetDbtVersion).mockResolvedValue({
                success: true,
                version: {
                    verboseVersion: 'dbt Cloud CLI - 0.38.0',
                    versionOption: DbtVersionOptionLatest.LATEST,
                    isDbtCloudCLI: true,
                    isDbtFusion: false,
                },
            });
        });

        test('skips column probing and warns when validation was requested', async () => {
            const warehouseClient = setupWarehouseClient();

            const result = await compile({
                ...baseOptions(tempDir),
                validateWarehouseColumns: true,
            });

            // Catalog fetching required by dbt Cloud CLI is preserved
            expect(getWarehouseClient).toHaveBeenCalledWith(
                expect.objectContaining({ isDbtCloudCLI: true }),
            );
            expect(warehouseClient.getCatalog).toHaveBeenCalledTimes(1);
            expect(validateWarehouseColumnReferences).not.toHaveBeenCalled();
            expect(result.filter(isExploreError)).toEqual([]);
            expect(result.map((explore) => explore.name)).toEqual(['my_model']);
            expect(errorOutput).toEqual(
                expect.arrayContaining([
                    expect.stringContaining(DBT_CLOUD_SKIP_WARNING),
                ]),
            );
        });

        test('does not warn or probe when validation was not requested', async () => {
            const warehouseClient = setupWarehouseClient();

            await compile(baseOptions(tempDir));

            expect(warehouseClient.getCatalog).toHaveBeenCalledTimes(1);
            expect(validateWarehouseColumnReferences).not.toHaveBeenCalled();
            expect(errorOutput).not.toEqual(
                expect.arrayContaining([
                    expect.stringContaining(
                        'Skipping warehouse column validation',
                    ),
                ]),
            );
        });

        test('prefers the skip-warehouse-catalog warning when both apply', async () => {
            await compile({
                ...baseOptions(tempDir),
                skipWarehouseCatalog: true,
                validateWarehouseColumns: true,
            });

            expect(getWarehouseClient).not.toHaveBeenCalled();
            expect(validateWarehouseColumnReferences).not.toHaveBeenCalled();
            const skipWarnings = errorOutput.filter((line) =>
                line.includes('Skipping warehouse column validation'),
            );
            expect(skipWarnings).toHaveLength(1);
            expect(skipWarnings[0]).toContain(SKIP_WARNING);
        });
    });

    describe('lightdash yml projects', () => {
        beforeEach(async () => {
            vi.mocked(loadLightdashModels).mockResolvedValue([
                lightdashYmlModel,
            ]);
            await fs.writeFile(
                path.join(tempDir, 'lightdash.config.yml'),
                'warehouse:\n  type: postgres\n',
            );
        });

        test('warns that warehouse column validation is not supported', async () => {
            const result = await compile({
                ...baseOptions(tempDir),
                validateWarehouseColumns: true,
            });

            expect(result.filter(isExploreError)).toEqual([]);
            expect(result.map((explore) => explore.name)).toEqual([
                'yml_model',
            ]);
            expect(getWarehouseClient).not.toHaveBeenCalled();
            expect(validateWarehouseColumnReferences).not.toHaveBeenCalled();
            expect(errorOutput).toEqual(
                expect.arrayContaining([
                    expect.stringContaining(YML_SKIP_WARNING),
                ]),
            );
        });

        test('does not warn when warehouse column validation was not requested', async () => {
            await compile(baseOptions(tempDir));

            expect(errorOutput).not.toEqual(
                expect.arrayContaining([
                    expect.stringContaining(
                        'Skipping warehouse column validation',
                    ),
                ]),
            );
        });

        test('warns exactly once when --skip-warehouse-catalog is also supplied', async () => {
            await compile({
                ...baseOptions(tempDir),
                skipWarehouseCatalog: true,
                validateWarehouseColumns: true,
            });

            const skipWarnings = errorOutput.filter((line) =>
                line.includes('Skipping warehouse column validation'),
            );
            expect(skipWarnings).toHaveLength(1);
            expect(skipWarnings[0]).toContain(YML_SKIP_WARNING);
        });
    });
});
