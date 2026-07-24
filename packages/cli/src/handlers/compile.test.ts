import {
    DimensionType,
    isExploreError,
    MetricType,
    type LightdashModel,
} from '@lightdash/common';
import fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { Mock } from 'vitest';
import * as lightdashLoader from '../lightdash/loader';
import { compile, type CompileHandlerOptions } from './compile';

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
            modelWithBrokenMetric,
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
});
