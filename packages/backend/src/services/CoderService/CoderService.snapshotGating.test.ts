import { AnyType, ChartType } from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CoderService } from './CoderService';

const PROJECT_UUID = 'project-uuid';
const SPACE_UUID = 'space-uuid';

const user = { userUuid: 'user-uuid' } as AnyType;

const chartDao = {
    uuid: 'chart-uuid',
    name: 'My chart',
    description: undefined,
    tableName: 'orders',
    updatedAt: new Date('2026-08-26T10:00:00Z'),
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: { type: ChartType.CARTESIAN, config: {} },
    pivotConfig: undefined,
    dashboardUuid: null,
    slug: 'my-chart',
    tableConfig: { columnOrder: [] },
    spaceUuid: SPACE_UUID,
    parameters: undefined,
};

const dashboardDao = {
    uuid: 'dashboard-uuid',
    name: 'My dashboard',
    description: undefined,
    updatedAt: new Date('2026-08-26T10:00:00Z'),
    tiles: [],
    tabs: [],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    slug: 'my-dashboard',
    spaceUuid: SPACE_UUID,
    parameters: undefined,
};

const buildService = () => {
    const snapshotUpsert = vi.fn();
    const savedChartGet = vi.fn(async () => chartDao);
    const dashboardGet = vi.fn(async () => dashboardDao);
    const savedSqlFind = vi.fn(async () => []);
    const service = new CoderService({
        directAccessService: {} as AnyType,
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {} as AnyType,
        savedChartModel: { get: savedChartGet } as AnyType,
        savedSqlModel: { find: savedSqlFind } as AnyType,
        appModel: {} as AnyType,
        dashboardModel: {
            getByIdOrSlug: dashboardGet,
            getSlugsForUuids: vi.fn(async () => ({})),
        } as AnyType,
        spaceModel: {
            find: vi.fn(async () => [
                { uuid: SPACE_UUID, name: 'My space', path: 'my_space' },
            ]),
        } as AnyType,
        schedulerModel: {} as AnyType,
        schedulerService: {} as AnyType,
        savedChartService: {} as AnyType,
        dashboardService: {} as AnyType,
        schedulerClient: {} as AnyType,
        promoteService: {} as AnyType,
        spacePermissionService: {} as AnyType,
        contentAsCodeSnapshotModel: { upsert: snapshotUpsert } as AnyType,
        contentAsCodeProjectSettingsModel: { upsert: vi.fn() } as AnyType,
        contentVerificationModel: {
            getByContentUuids: vi.fn(async () => new Map()),
        } as AnyType,
        groupsModel: {} as AnyType,
        organizationMemberProfileModel: {} as AnyType,
        userModel: {} as AnyType,
    });
    return {
        service,
        snapshotUpsert,
        savedChartGet,
        dashboardGet,
        savedSqlFind,
    };
};

describe('CoderService snapshot recording gated on content_as_code.sync', () => {
    afterEach(() => vi.clearAllMocks());

    describe('stampAppliedChartSnapshot', () => {
        it('records a snapshot when sync is enabled', async () => {
            const { service, snapshotUpsert } = buildService();
            await service['stampAppliedChartSnapshot'](
                user,
                PROJECT_UUID,
                chartDao.uuid,
                true,
            );
            expect(snapshotUpsert).toHaveBeenCalledTimes(1);
            expect(snapshotUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectUuid: PROJECT_UUID,
                    slug: chartDao.slug,
                    appliedByUserUuid: user.userUuid,
                }),
            );
        });

        it('does not record or fetch anything when sync is disabled', async () => {
            const { service, snapshotUpsert, savedChartGet } = buildService();
            await service['stampAppliedChartSnapshot'](
                user,
                PROJECT_UUID,
                chartDao.uuid,
                false,
            );
            expect(savedChartGet).not.toHaveBeenCalled();
            expect(snapshotUpsert).not.toHaveBeenCalled();
        });
    });

    describe('stampAppliedDashboardSnapshot', () => {
        it('records a snapshot when sync is enabled', async () => {
            const { service, snapshotUpsert } = buildService();
            await service['stampAppliedDashboardSnapshot'](
                user,
                PROJECT_UUID,
                dashboardDao.uuid,
                true,
            );
            expect(snapshotUpsert).toHaveBeenCalledTimes(1);
            expect(snapshotUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectUuid: PROJECT_UUID,
                    slug: dashboardDao.slug,
                }),
            );
        });

        it('does not record or fetch anything when sync is disabled', async () => {
            const { service, snapshotUpsert, dashboardGet } = buildService();
            await service['stampAppliedDashboardSnapshot'](
                user,
                PROJECT_UUID,
                dashboardDao.uuid,
                false,
            );
            expect(dashboardGet).not.toHaveBeenCalled();
            expect(snapshotUpsert).not.toHaveBeenCalled();
        });
    });

    describe('stampAppliedSqlChartSnapshot', () => {
        it('does not record or fetch anything when sync is disabled', async () => {
            const { service, snapshotUpsert, savedSqlFind } = buildService();
            await service['stampAppliedSqlChartSnapshot'](
                user,
                PROJECT_UUID,
                'my-sql-chart',
                false,
            );
            expect(savedSqlFind).not.toHaveBeenCalled();
            expect(snapshotUpsert).not.toHaveBeenCalled();
        });
    });
});
