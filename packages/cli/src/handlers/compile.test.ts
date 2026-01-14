import fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
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
});
