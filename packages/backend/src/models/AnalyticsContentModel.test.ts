import { ConflictError, NotFoundError } from '@lightdash/common';
import { type Knex } from 'knex';
import {
    analyticsSampleContent,
    analyticsSampleDashboards,
} from '../analytics/systemExplores/sampleContent';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { user } from '../services/ProjectService/ProjectService.mock';
import { AnalyticsContentModel } from './AnalyticsContentModel';
import { DashboardModel } from './DashboardModel/DashboardModel';
import { SavedChartModel } from './SavedChartModel';
import { SpaceModel } from './SpaceModel';

describe('AnalyticsContentModel', () => {
    afterEach(() => vi.restoreAllMocks());
    const dashboardIds = new Map(
        analyticsSampleDashboards.map((bundle, index) => [
            bundle.key,
            `dashboard-${index}`,
        ]),
    );
    const dashboardUuid = dashboardIds.get(analyticsSampleContent.key)!;
    const managedChartOwners = new Map<string, string>(
        analyticsSampleDashboards.flatMap((bundle) => {
            const owner = dashboardIds.get(bundle.key)!;
            return bundle.charts.map(
                ({ key }) => [`${bundle.key}-${key}`, owner] as const,
            );
        }),
    );
    const chartIds = new Map(
        [...managedChartOwners.keys()].map((slug, index) => [
            slug,
            `chart-${index}`,
        ]),
    );
    const totalCharts = analyticsSampleDashboards.reduce(
        (total, bundle) => total + bundle.charts.length,
        0,
    );

    const setup = ({
        existing = false,
        authorized = true,
        movedChart = false,
        deleted = false,
        dashboardProject = 'project',
        onlyOverviewExists = false,
    } = {}) => {
        const update = vi.fn().mockResolvedValue(1);
        const trx = vi.fn((table: string) => {
            const results: Record<string, unknown> = {
                projects: { organization_id: 1, project_id: 2 },
                organizations: authorized ? { organization_id: 1 } : undefined,
                dashboards: existing
                    ? {
                          dashboard_uuid: dashboardUuid,
                          project_uuid: dashboardProject,
                          space_id: 3,
                          deleted_at: deleted ? new Date() : null,
                      }
                    : undefined,
                spaces: { space_id: 3, project_id: 2 },
                saved_queries: existing
                    ? {
                          project_uuid: 'project',
                          dashboard_uuid: movedChart
                              ? 'another-dashboard'
                              : dashboardUuid,
                          space_id: null,
                          deleted_at: deleted ? new Date() : null,
                      }
                    : undefined,
            };
            const query = {
                where: vi.fn(),
                forUpdate: vi.fn(),
                whereNull: vi.fn(),
                first: vi.fn(async () => results[table]),
                update,
            };
            query.where.mockImplementation(
                (conditions: { project_uuid?: string; slug?: string }) => {
                    const { slug } = conditions;
                    if (existing && table === 'dashboards' && slug) {
                        const value = dashboardIds.get(slug);
                        results.dashboards =
                            onlyOverviewExists && value !== dashboardUuid
                                ? undefined
                                : {
                                      dashboard_uuid: value,
                                      project_uuid: dashboardProject,
                                      space_id: 3,
                                      deleted_at: deleted ? new Date() : null,
                                  };
                    }
                    if (existing && table === 'saved_queries' && slug) {
                        const owner = managedChartOwners.get(slug);
                        results.saved_queries =
                            onlyOverviewExists && owner !== dashboardUuid
                                ? undefined
                                : {
                                      saved_query_uuid: chartIds.get(slug),
                                      project_uuid: 'project',
                                      dashboard_uuid: movedChart
                                          ? 'another-dashboard'
                                          : owner,
                                      space_id: null,
                                      deleted_at: deleted ? new Date() : null,
                                  };
                    }
                    return query;
                },
            );
            query.forUpdate.mockReturnValue(query);
            query.whereNull.mockReturnValue(query);
            return query;
        });
        Object.assign(trx, { raw: vi.fn().mockResolvedValue(undefined) });
        const transaction = vi.fn(
            async (callback: (db: unknown) => Promise<void>) => callback(trx),
        );
        const model = new AnalyticsContentModel({
            database: { transaction } as unknown as Knex,
            lightdashConfig: lightdashConfigMock,
        });
        const createSpace = vi
            .spyOn(SpaceModel.prototype, 'createSpace')
            .mockResolvedValue({ uuid: 'space' } as Awaited<
                ReturnType<SpaceModel['createSpace']>
            >);
        const createDashboard = vi
            .spyOn(DashboardModel.prototype, 'create')
            .mockImplementation(
                async (_space, definition) =>
                    ({
                        uuid: dashboardIds.get(definition.slug),
                        slug: definition.slug,
                    }) as Awaited<ReturnType<DashboardModel['create']>>,
            );
        const updateDashboard = vi
            .spyOn(DashboardModel.prototype, 'update')
            .mockResolvedValue({ uuid: dashboardUuid } as Awaited<
                ReturnType<DashboardModel['update']>
            >);
        const createChart = vi
            .spyOn(SavedChartModel.prototype, 'create')
            .mockImplementation(
                async (_project, _user, definition) =>
                    ({
                        uuid: chartIds.get(definition.slug),
                        slug: definition.slug,
                    }) as Awaited<ReturnType<SavedChartModel['create']>>,
            );
        const updateChart = vi
            .spyOn(SavedChartModel.prototype, 'update')
            .mockResolvedValue(
                {} as Awaited<ReturnType<SavedChartModel['update']>>,
            );
        const chartVersion = vi
            .spyOn(SavedChartModel.prototype, 'createVersion')
            .mockResolvedValue(
                {} as Awaited<ReturnType<SavedChartModel['createVersion']>>,
            );
        const restoreChart = vi
            .spyOn(SavedChartModel.prototype, 'restore')
            .mockResolvedValue();
        const addVersion = vi
            .spyOn(DashboardModel.prototype, 'addVersion')
            .mockResolvedValue(
                {} as Awaited<ReturnType<DashboardModel['addVersion']>>,
            );
        return {
            model,
            trx,
            update,
            createSpace,
            createDashboard,
            updateDashboard,
            createChart,
            updateChart,
            chartVersion,
            restoreChart,
            addVersion,
        };
    };

    it('finds content by project-scoped slug and uses normal model-generated UUIDs', async () => {
        const mocks = setup();
        await mocks.model.install('project', user);
        expect(mocks.createDashboard).toHaveBeenCalledWith(
            'space',
            expect.not.objectContaining({ forceSlug: true }),
            user,
            'project',
        );
        expect(mocks.createChart).toHaveBeenCalledTimes(totalCharts);
        for (const { key } of analyticsSampleContent.charts) {
            expect(mocks.createChart).toHaveBeenCalledWith(
                'project',
                user.userUuid,
                expect.objectContaining({
                    dashboardUuid,
                    slug: `${analyticsSampleContent.key}-${key}`,
                }),
            );
        }
        const dashboardQuery = mocks.trx.mock.results.find(
            (_, index) => mocks.trx.mock.calls[index][0] === 'dashboards',
        )!.value;
        expect(dashboardQuery.where).toHaveBeenCalledWith({
            project_uuid: 'project',
            slug: analyticsSampleContent.key,
        });
        expect(
            mocks.createDashboard.mock.calls.every((args) => args.length === 4),
        ).toBe(true);
        expect(
            mocks.createChart.mock.calls.every((args) => args.length === 3),
        ).toBe(true);
        expect(mocks.updateChart).not.toHaveBeenCalled();
    });

    it('syncs the same dashboard and charts without changing their slugs or creating copies', async () => {
        const mocks = setup({ existing: true });
        await mocks.model.install('project', user);
        expect(mocks.createSpace).not.toHaveBeenCalled();
        expect(mocks.createDashboard).not.toHaveBeenCalled();
        expect(mocks.createChart).not.toHaveBeenCalled();
        expect(mocks.updateDashboard).toHaveBeenCalledWith(dashboardUuid, {
            name: analyticsSampleContent.name,
            description: analyticsSampleContent.description,
        });
        expect(mocks.chartVersion).toHaveBeenCalledTimes(totalCharts);
        expect(mocks.addVersion).toHaveBeenCalledWith(
            dashboardUuid,
            expect.objectContaining({
                tiles: expect.arrayContaining([
                    expect.objectContaining({
                        properties: {
                            savedChartUuid: chartIds.get(
                                `${analyticsSampleContent.key}-ai-calls`,
                            ),
                        },
                    }),
                ]),
            }),
            user,
            'project',
            mocks.trx,
        );
    });

    it('restores the same rows found by slug when samples were soft-deleted', async () => {
        const mocks = setup({ existing: true, deleted: true });
        await mocks.model.install('project', user);
        expect(mocks.restoreChart).toHaveBeenCalledTimes(totalCharts);
        expect(mocks.createChart).not.toHaveBeenCalled();
    });

    it('rejects another organization before any content writes', async () => {
        const mocks = setup({ authorized: false });
        await expect(mocks.model.install('project', user)).rejects.toThrow(
            NotFoundError,
        );
        expect(mocks.createSpace).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('adds missing dashboards while updating the existing overview', async () => {
        const mocks = setup({ existing: true, onlyOverviewExists: true });
        await mocks.model.install('project', user);
        const queryDashboard = analyticsSampleDashboards[1];
        expect(mocks.createDashboard).toHaveBeenCalledTimes(1);
        expect(mocks.createDashboard).toHaveBeenCalledWith(
            'space',
            expect.objectContaining({ name: 'Query activity' }),
            user,
            'project',
        );
        expect(mocks.updateDashboard).toHaveBeenCalledTimes(1);
        expect(mocks.updateDashboard).toHaveBeenCalledWith(
            dashboardUuid,
            expect.anything(),
        );
        expect(mocks.addVersion).toHaveBeenCalledTimes(2);
        expect(mocks.createChart).toHaveBeenCalledTimes(
            queryDashboard.charts.length,
        );
        expect(mocks.chartVersion).toHaveBeenCalledTimes(
            analyticsSampleContent.charts.length,
        );
    });

    it('rejects a dashboard in another project', async () => {
        const mocks = setup({
            existing: true,
            dashboardProject: 'other-project',
        });
        await expect(mocks.model.install('project', user)).rejects.toThrow(
            ConflictError,
        );
        expect(mocks.updateDashboard).not.toHaveBeenCalled();
    });

    it('does not overwrite managed charts moved into other content', async () => {
        const mocks = setup({ existing: true, movedChart: true });
        await expect(mocks.model.install('project', user)).rejects.toThrow(
            ConflictError,
        );
        expect(mocks.updateChart).not.toHaveBeenCalled();
        expect(mocks.addVersion).not.toHaveBeenCalled();
    });

    it('propagates sync failures out of the transaction before replacing the dashboard layout', async () => {
        const mocks = setup({ existing: true });
        mocks.chartVersion.mockRejectedValueOnce(new Error('write failed'));
        await expect(mocks.model.install('project', user)).rejects.toThrow(
            'write failed',
        );
        expect(mocks.addVersion).not.toHaveBeenCalled();
    });

    it('rolls back rather than installing a suffixed chart when its slug is reserved', async () => {
        const mocks = setup();
        mocks.createChart.mockResolvedValueOnce({
            uuid: 'new-chart',
            slug: 'reserved-1',
        } as Awaited<ReturnType<SavedChartModel['create']>>);
        await expect(mocks.model.install('project', user)).rejects.toThrow(
            'Sample chart slug is reserved',
        );
        expect(mocks.addVersion).not.toHaveBeenCalled();
    });
});
