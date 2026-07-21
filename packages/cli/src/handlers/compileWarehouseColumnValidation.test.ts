import {
    DimensionType,
    isExploreError,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreatePostgresCredentials,
    type DbtManifest,
    type DbtModelNode,
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
            expect.arrayContaining([expect.stringContaining(SKIP_WARNING)]),
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
});
