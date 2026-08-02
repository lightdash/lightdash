import { SchedulerJobStatus, ValidationTarget } from '@lightdash/common';
import { compile } from './compile';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';
import { validateHandler } from './validate';

vi.mock('../analytics/analytics');
vi.mock('../config', () => ({
    getConfig: vi.fn().mockResolvedValue({ user: null, context: null }),
}));
vi.mock('./compile');
vi.mock('./dbt/apiClient');
vi.mock('./timestampConversion');

type ValidateOptions = Parameters<typeof validateHandler>[0];

const baseOptions: ValidateOptions = {
    project: 'test-project-uuid',
    preview: false,
    only: Object.values(ValidationTarget),
    validateWarehouseColumns: false,
    showChartConfigurationWarnings: false,
    projectDir: '.',
    profilesDir: '.',
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
};

const TARGET_SKIP_WARNING =
    'Skipping warehouse column validation because --only does not include the tables validation target';

describe('validateHandler warehouse column validation', () => {
    let errorOutput: string[];

    const skipWarnings = () =>
        errorOutput.filter((line) =>
            line.includes('Skipping warehouse column validation'),
        );

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(checkLightdashVersion).mockResolvedValue(undefined);
        vi.mocked(compile).mockResolvedValue([]);
        vi.mocked(lightdashApi).mockImplementation(async ({ method, url }) => {
            if (method === 'POST' && url.endsWith('/validate')) {
                return { jobId: 'test-job-id' };
            }
            if (url.includes('/schedulers/job/')) {
                return { status: SchedulerJobStatus.COMPLETED, details: null };
            }
            if (url.includes('/validate?jobId=')) {
                return [];
            }
            throw new Error(`Unexpected API call: ${method} ${url}`);
        });

        errorOutput = [];
        vi.spyOn(console, 'error').mockImplementation((...args) => {
            errorOutput.push(args.map(String).join(' '));
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('does not request warehouse column validation by default', async () => {
        await validateHandler({ ...baseOptions });

        expect(compile).toHaveBeenCalledTimes(1);
        expect(compile).toHaveBeenCalledWith(
            expect.objectContaining({ validateWarehouseColumns: false }),
        );
        expect(skipWarnings()).toEqual([]);
    });

    test('requests warehouse column validation when the flag is set and every target is validated', async () => {
        await validateHandler({
            ...baseOptions,
            validateWarehouseColumns: true,
        });

        expect(compile).toHaveBeenCalledWith(
            expect.objectContaining({ validateWarehouseColumns: true }),
        );
        expect(skipWarnings()).toEqual([]);
    });

    test('requests warehouse column validation when the flag is set and only tables are validated', async () => {
        await validateHandler({
            ...baseOptions,
            only: [ValidationTarget.TABLES],
            validateWarehouseColumns: true,
        });

        expect(compile).toHaveBeenCalledWith(
            expect.objectContaining({ validateWarehouseColumns: true }),
        );
        expect(skipWarnings()).toEqual([]);
    });

    test('requests warehouse column validation when the flag is set and a mixed target list includes tables', async () => {
        await validateHandler({
            ...baseOptions,
            only: [ValidationTarget.TABLES, ValidationTarget.CHARTS],
            validateWarehouseColumns: true,
        });

        expect(compile).toHaveBeenCalledWith(
            expect.objectContaining({ validateWarehouseColumns: true }),
        );
        expect(skipWarnings()).toEqual([]);
    });

    test('does not request warehouse column validation when tables are not validated', async () => {
        await validateHandler({
            ...baseOptions,
            only: [ValidationTarget.CHARTS, ValidationTarget.DASHBOARDS],
            validateWarehouseColumns: true,
        });

        expect(compile).toHaveBeenCalledWith(
            expect.objectContaining({ validateWarehouseColumns: false }),
        );
        const warnings = skipWarnings();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(TARGET_SKIP_WARNING);
    });

    test('warns exactly once when the flag is set and only charts are validated', async () => {
        await validateHandler({
            ...baseOptions,
            only: [ValidationTarget.CHARTS],
            validateWarehouseColumns: true,
        });

        expect(compile).toHaveBeenCalledWith(
            expect.objectContaining({ validateWarehouseColumns: false }),
        );
        const warnings = skipWarnings();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(TARGET_SKIP_WARNING);
    });

    test('does not warn when only charts are validated without the flag', async () => {
        await validateHandler({
            ...baseOptions,
            only: [ValidationTarget.CHARTS],
            validateWarehouseColumns: false,
        });

        expect(compile).toHaveBeenCalledWith(
            expect.objectContaining({ validateWarehouseColumns: false }),
        );
        expect(skipWarnings()).toEqual([]);
    });
});
