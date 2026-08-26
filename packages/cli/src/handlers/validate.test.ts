import {
    SchedulerJobStatus,
    ValidationErrorType,
    ValidationSourceType,
    ValidationTarget,
} from '@lightdash/common';
import { compile } from './compile';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';
import {
    resolveValidationSeverity,
    shouldTreatWarningsAsErrors,
    validateHandler,
} from './validate';

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
    severity: 'error',
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

const chartConfigurationWarning = {
    validationUuid: 'warning-uuid',
    validationId: null,
    createdAt: new Date('2026-08-26T12:00:00Z'),
    projectUuid: 'test-project-uuid',
    name: 'Orders over time',
    error: 'dimension is not used in the chart configuration',
    errorType: ValidationErrorType.ChartConfiguration,
    source: ValidationSourceType.Chart,
    chartUuid: 'chart-uuid',
    fieldName: 'orders.unused_dim',
    chartViews: 3,
    lastUpdatedBy: 'Ada Lovelace',
    lastUpdatedAt: new Date('2026-08-06T15:30:00Z'),
};

const brokenChartError = {
    validationUuid: 'error-uuid',
    validationId: null,
    createdAt: new Date('2026-08-26T12:00:00Z'),
    projectUuid: 'test-project-uuid',
    name: 'Broken chart',
    error: 'Dimension does not exist',
    errorType: ValidationErrorType.Dimension,
    source: ValidationSourceType.Chart,
    chartUuid: 'broken-chart-uuid',
    fieldName: 'orders.missing',
    chartViews: 1,
    lastUpdatedBy: 'Ada Lovelace',
    lastUpdatedAt: new Date('2026-08-06T15:30:00Z'),
};

describe('validateHandler warehouse column validation', () => {
    let errorOutput: string[];
    let validationResults: unknown[] = [];

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
                return validationResults;
            }
            throw new Error(`Unexpected API call: ${method} ${url}`);
        });

        errorOutput = [];
        validationResults = [];
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

    test('skips data app validation when dbt selection produces a partial semantic layer', async () => {
        await validateHandler({
            ...baseOptions,
            only: [ValidationTarget.CHARTS, ValidationTarget.APPS],
            select: ['orders'],
        });

        const validationRequest = vi
            .mocked(lightdashApi)
            .mock.calls.find(
                ([request]) =>
                    request.method === 'POST' &&
                    request.url.endsWith('/validate'),
            );
        expect(validationRequest).toBeDefined();
        expect(JSON.parse(String(validationRequest![0].body))).toEqual(
            expect.objectContaining({
                validationTargets: [ValidationTarget.CHARTS],
            }),
        );
        expect(
            errorOutput.some((line) =>
                line.includes('Skipping data app validation'),
            ),
        ).toBe(true);
    });

    test('rejects apps-only validation against a partial semantic layer', async () => {
        await expect(
            validateHandler({
                ...baseOptions,
                only: [ValidationTarget.APPS],
                select: ['orders'],
            }),
        ).rejects.toThrow(
            'Data app validation requires a full project compile',
        );

        expect(compile).not.toHaveBeenCalled();
    });

    test('prints the latest data app version author and date', async () => {
        vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        vi.mocked(lightdashApi).mockImplementation(async ({ method, url }) => {
            if (method === 'POST' && url.endsWith('/validate')) {
                return { jobId: 'test-job-id' };
            }
            if (url.includes('/schedulers/job/')) {
                return {
                    status: SchedulerJobStatus.COMPLETED,
                    details: null,
                };
            }
            if (url.includes('/validate?jobId=')) {
                return [
                    {
                        validationUuid: 'validation-uuid',
                        validationId: null,
                        createdAt: new Date('2026-08-07T09:00:00Z'),
                        projectUuid: 'test-project-uuid',
                        name: 'Broken data app',
                        error: 'Dimension does not exist',
                        errorType: ValidationErrorType.Dimension,
                        source: ValidationSourceType.DataApp,
                        appUuid: 'app-uuid',
                        lastUpdatedBy: 'Ada Lovelace',
                        lastUpdatedAt: new Date('2026-08-06T15:30:00Z'),
                    },
                ];
            }
            throw new Error(`Unexpected API call: ${method} ${url}`);
        });

        await validateHandler({
            ...baseOptions,
            only: [ValidationTarget.APPS],
        });

        const output = errorOutput.join('\n');
        expect(output).toContain('Ada Lovelace');
        expect(output).toContain('2026-08-06');
    });

    test('succeeds when only chart configuration warnings exist at default severity', async () => {
        validationResults = [chartConfigurationWarning];
        const exitSpy = vi
            .spyOn(process, 'exit')
            .mockImplementation(() => undefined as never);

        await validateHandler({ ...baseOptions });

        expect(exitSpy).not.toHaveBeenCalled();
        expect(errorOutput.join('\n')).not.toContain('orders.unused_dim');
    });

    test('fails when --severity warning is set and warnings exist', async () => {
        validationResults = [chartConfigurationWarning];
        vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await validateHandler({
            ...baseOptions,
            severity: 'warning',
        });

        expect(process.exit).toHaveBeenCalledWith(1);
        const output = errorOutput.join('\n');
        expect(output).toContain('Chart configuration warning');
        expect(output).toContain('orders.unused_dim');
        expect(output).toContain('1 warning');
    });

    test('fails on blocking errors even when warnings stay hidden', async () => {
        validationResults = [brokenChartError, chartConfigurationWarning];
        vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await validateHandler({ ...baseOptions });

        expect(process.exit).toHaveBeenCalledWith(1);
        const output = errorOutput.join('\n');
        expect(output).toContain('Broken chart');
        expect(output).not.toContain('orders.unused_dim');
        expect(output).toContain('chart configuration warning hidden');
    });

    test('reports errors and warnings together when severity is warning', async () => {
        validationResults = [brokenChartError, chartConfigurationWarning];
        vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await validateHandler({
            ...baseOptions,
            severity: 'warning',
        });

        expect(process.exit).toHaveBeenCalledWith(1);
        const output = errorOutput.join('\n');
        expect(output).toContain('Broken chart');
        expect(output).toContain('orders.unused_dim');
        expect(output).toContain('1 error');
        expect(output).toContain('1 warning');
    });
});

describe('resolveValidationSeverity', () => {
    test('defaults to error', () => {
        expect(resolveValidationSeverity()).toBe('error');
        expect(resolveValidationSeverity('error')).toBe('error');
    });

    test('uses warning when --severity warning is set', () => {
        expect(resolveValidationSeverity('warning')).toBe('warning');
    });
});

describe('shouldTreatWarningsAsErrors', () => {
    test('is off by default', () => {
        expect(shouldTreatWarningsAsErrors()).toBe(false);
        expect(shouldTreatWarningsAsErrors('error')).toBe(false);
    });

    test('is on for --severity warning', () => {
        expect(shouldTreatWarningsAsErrors('warning')).toBe(true);
    });
});
