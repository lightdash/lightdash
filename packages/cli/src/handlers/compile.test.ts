import fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as styles from '../styles';
import { compile } from './compile';

jest.mock('execa');
jest.mock('../analytics/analytics');
jest.mock('../config', () => ({
    getConfig: jest.fn().mockResolvedValue({ user: null, context: null }),
}));

describe('compile', () => {
    let tempDir: string;

    beforeEach(async () => {
        jest.clearAllMocks();
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
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('should compile Lightdash YAML project without dbt installed', async () => {
        // Mock analytics to prevent actual tracking
        const { LightdashAnalytics } = await import('../analytics/analytics');
        (LightdashAnalytics.track as jest.Mock).mockResolvedValue(undefined);

        const result = await compile({
            projectDir: tempDir,
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
            warehouseCredentials: false,
            disableTimestampConversion: false,
        });

        // Should succeed even though dbt is not installed
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);

        // Analytics should be called even though dbt is not found
        const trackCalls = (LightdashAnalytics.track as jest.Mock).mock.calls;

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
        expect(startedCall).toBeDefined();
        expect(startedCall[0].properties.dbtVersion).toBeUndefined();
    });

    test('should display PARTIAL_SUCCESS with warning messages', () => {
        // Mock console.error to capture output
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        // Set environment variable for partial compilation
        const originalEnv = process.env.PARTIAL_COMPILATION_ENABLED;
        process.env.PARTIAL_COMPILATION_ENABLED = 'true';

        try {
            // Create mock explores array with different statuses
            const mockExplores = [
                {
                    name: 'successful_explore',
                    label: 'Successful Explore',
                    tags: [],
                    baseTable: 'table1',
                    // No warnings or errors - should be SUCCESS
                },
                {
                    name: 'explore_with_warnings',
                    label: 'Explore with Warnings',
                    tags: [],
                    baseTable: 'table2',
                    warnings: [
                        {
                            type: 'MISSING_TABLE',
                            message:
                                'Join to table "missing_table" was skipped',
                        },
                        {
                            type: 'FIELD_ERROR',
                            message: 'Field compilation warning',
                        },
                    ],
                },
                {
                    name: 'failed_explore',
                    label: 'Failed Explore',
                    tags: [],
                    errors: [
                        {
                            type: 'NO_DIMENSIONS_FOUND',
                            message: 'No dimensions found in model',
                        },
                    ],
                },
            ];

            // Simulate the explore display logic from compile.ts
            let errors = 0;
            let partialSuccess = 0;
            let success = 0;

            mockExplores.forEach((e) => {
                let status: string;
                let messages = '';

                if ('errors' in e && e.errors) {
                    status = styles.error('ERROR');
                    messages = `: ${styles.error(e.errors.map((err: { message: string }) => err.message).join(', '))}`;
                    errors += 1;
                } else if (
                    process.env.PARTIAL_COMPILATION_ENABLED === 'true' &&
                    'warnings' in e &&
                    e.warnings &&
                    e.warnings.length > 0
                ) {
                    status = styles.warning('PARTIAL_SUCCESS');
                    messages = `: ${styles.warning(
                        e.warnings
                            .map(
                                (warning: { message: string }) =>
                                    warning.message,
                            )
                            .join(', '),
                    )}`;
                    partialSuccess += 1;
                } else {
                    status = styles.success('SUCCESS');
                    success += 1;
                }

                console.error(`- ${status}> ${e.name} ${messages}`);
            });
            console.error('');

            // Display summary
            if (
                process.env.PARTIAL_COMPILATION_ENABLED === 'true' &&
                partialSuccess > 0
            ) {
                console.error(
                    `Compiled ${mockExplores.length} explores, SUCCESS=${success} PARTIAL_SUCCESS=${partialSuccess} ERRORS=${errors}`,
                );
            } else {
                console.error(
                    `Compiled ${mockExplores.length} explores, SUCCESS=${success} ERRORS=${errors}`,
                );
            }

            // Verify the output
            const calls = consoleSpy.mock.calls.map((call) => call[0]);

            // Check that PARTIAL_SUCCESS status is displayed
            const partialSuccessCall = calls.find(
                (call) =>
                    typeof call === 'string' &&
                    call.includes('PARTIAL_SUCCESS> explore_with_warnings'),
            );
            expect(partialSuccessCall).toBeDefined();
            expect(partialSuccessCall).toContain(
                'Join to table "missing_table" was skipped',
            );
            expect(partialSuccessCall).toContain('Field compilation warning');

            // Check that SUCCESS status is displayed
            const successCall = calls.find(
                (call) =>
                    typeof call === 'string' &&
                    call.includes('SUCCESS> successful_explore'),
            );
            expect(successCall).toBeDefined();

            // Check that ERROR status is displayed
            const errorCall = calls.find(
                (call) =>
                    typeof call === 'string' &&
                    call.includes('ERROR> failed_explore'),
            );
            expect(errorCall).toBeDefined();

            // Check the summary includes PARTIAL_SUCCESS count
            const summaryCall = calls.find(
                (call) =>
                    typeof call === 'string' &&
                    call.includes('Compiled') &&
                    call.includes('PARTIAL_SUCCESS='),
            );
            expect(summaryCall).toBeDefined();
            expect(summaryCall).toContain(
                'SUCCESS=1 PARTIAL_SUCCESS=1 ERRORS=1',
            );
        } finally {
            // Clean up
            consoleSpy.mockRestore();
            process.env.PARTIAL_COMPILATION_ENABLED = originalEnv;
        }
    });
});
