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

const buildService = (
    contentAsCodeProjectSettingsModel: AnyType = { upsert: vi.fn() },
) => {
    const snapshotUpsert = vi.fn();
    const savedChartGet = vi.fn(async () => chartDao);
    const dashboardGet = vi.fn(async () => dashboardDao);
    const savedSqlFind = vi.fn(async () => []);
    const service = new CoderService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
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
        contentAsCodeProjectSettingsModel,
        contentVerificationModel: {
            getByContentUuids: vi.fn(async () => new Map()),
        } as AnyType,
        groupsModel: {} as AnyType,
        organizationMemberProfileModel: {} as AnyType,
        userModel: {} as AnyType,
        warehouseConnectionModel: {} as never,
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
                undefined,
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

        it('records where the chart was applied from', async () => {
            const { service, snapshotUpsert } = buildService();
            await service['stampAppliedChartSnapshot'](
                user,
                PROJECT_UUID,
                chartDao.uuid,
                true,
                './packages/team_a/lightdash/charts/revenue.yml',
            );
            expect(snapshotUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    filePath: 'packages/team_a/lightdash/charts/revenue.yml',
                }),
            );
        });

        it('keeps the stored path when the client sends none', async () => {
            const { service, snapshotUpsert } = buildService();
            await service['stampAppliedChartSnapshot'](
                user,
                PROJECT_UUID,
                chartDao.uuid,
                true,
                undefined,
            );
            expect(snapshotUpsert).toHaveBeenCalledWith(
                expect.objectContaining({ filePath: null }),
            );
        });

        it('does not record or fetch anything when sync is disabled', async () => {
            const { service, snapshotUpsert, savedChartGet } = buildService();
            await service['stampAppliedChartSnapshot'](
                user,
                PROJECT_UUID,
                chartDao.uuid,
                false,
                undefined,
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
                undefined,
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
                undefined,
            );
            expect(dashboardGet).not.toHaveBeenCalled();
            expect(snapshotUpsert).not.toHaveBeenCalled();
        });
    });

    describe('resolveSyncEnabled', () => {
        const withStampedSync = (syncEnabled: boolean) =>
            buildService({ get: vi.fn(async () => ({ syncEnabled })) }).service;

        it('falls back to the stamped project setting when the caller does not say', async () => {
            await expect(
                withStampedSync(true)['resolveSyncEnabled'](PROJECT_UUID, {}),
            ).resolves.toBe(true);
            await expect(
                withStampedSync(false)['resolveSyncEnabled'](PROJECT_UUID, {}),
            ).resolves.toBe(false);
        });

        it('lets a non-upload caller opt out even when the project has sync stamped on', async () => {
            await expect(
                withStampedSync(true)['resolveSyncEnabled'](PROJECT_UUID, {
                    syncEnabled: false,
                }),
            ).resolves.toBe(false);
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
