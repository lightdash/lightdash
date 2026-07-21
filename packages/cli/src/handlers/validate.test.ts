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

describe('validateHandler warehouse column validation', () => {
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
    });

    test('does not request warehouse column validation by default', async () => {
        await validateHandler({ ...baseOptions });

        expect(compile).toHaveBeenCalledTimes(1);
        expect(compile).toHaveBeenCalledWith(
            expect.objectContaining({ validateWarehouseColumns: false }),
        );
    });

    test('requests warehouse column validation when the flag is set and every target is validated', async () => {
        await validateHandler({
            ...baseOptions,
            validateWarehouseColumns: true,
        });

        expect(compile).toHaveBeenCalledWith(
            expect.objectContaining({ validateWarehouseColumns: true }),
        );
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
    });
});
