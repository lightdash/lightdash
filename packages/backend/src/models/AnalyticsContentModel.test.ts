import { ConflictError, NotFoundError } from '@lightdash/common';
import { type Knex } from 'knex';
import { v5 as uuidv5 } from 'uuid';
import { analyticsSampleContent } from '../analytics/systemExplores/sampleContent';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { user } from '../services/ProjectService/ProjectService.mock';
import { AnalyticsContentModel } from './AnalyticsContentModel';
import { DashboardModel } from './DashboardModel/DashboardModel';
import { SavedChartModel } from './SavedChartModel';
import { SpaceModel } from './SpaceModel';

describe('AnalyticsContentModel', () => {
    afterEach(() => vi.restoreAllMocks());
    const dashboardUuid = uuidv5(
        `lightdash-analytics/project/${analyticsSampleContent.key}`,
        uuidv5.URL,
    );

    const setup = ({
        existing = false,
        authorized = true,
        movedChart = false,
        deleted = false,
        dashboardProject = 'project',
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
                first: vi.fn().mockResolvedValue(results[table]),
                update,
            };
            query.where.mockReturnValue(query);
            query.forUpdate.mockReturnValue(query);
            query.whereNull.mockReturnValue(query);
            return query;
        });
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
            .mockResolvedValue({ uuid: dashboardUuid } as Awaited<
                ReturnType<DashboardModel['create']>
            >);
        const updateDashboard = vi
            .spyOn(DashboardModel.prototype, 'update')
            .mockResolvedValue({ uuid: dashboardUuid } as Awaited<
                ReturnType<DashboardModel['update']>
            >);
        const createChart = vi
            .spyOn(SavedChartModel.prototype, 'create')
            .mockResolvedValue(
                {} as Awaited<ReturnType<SavedChartModel['create']>>,
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

    it('creates stable identities without using names or slugs to find existing content', async () => {
        const mocks = setup();
        await mocks.model.install('project', user);
        expect(mocks.createDashboard).toHaveBeenCalledWith(
            'space',
            expect.not.objectContaining({ forceSlug: true }),
            user,
            'project',
            dashboardUuid,
        );
        expect(mocks.createChart).toHaveBeenCalledTimes(
            analyticsSampleContent.charts.length,
        );
        for (const { key } of analyticsSampleContent.charts) {
            expect(mocks.createChart).toHaveBeenCalledWith(
                'project',
                user.userUuid,
                expect.objectContaining({ dashboardUuid }),
                uuidv5(key, dashboardUuid),
            );
        }
        const dashboardQuery = mocks.trx.mock.results.find(
            (_, index) => mocks.trx.mock.calls[index][0] === 'dashboards',
        )!.value;
        expect(dashboardQuery.where).toHaveBeenCalledWith(
            'dashboard_uuid',
            dashboardUuid,
        );
        expect(mocks.updateChart).not.toHaveBeenCalled();
    });

    it('refreshes the same dashboard and charts without changing their slugs or creating copies', async () => {
        const mocks = setup({ existing: true });
        await mocks.model.install('project', user);
        expect(mocks.createSpace).not.toHaveBeenCalled();
        expect(mocks.createDashboard).not.toHaveBeenCalled();
        expect(mocks.createChart).not.toHaveBeenCalled();
        expect(mocks.updateDashboard).toHaveBeenCalledWith(dashboardUuid, {
            name: analyticsSampleContent.name,
            description: analyticsSampleContent.description,
        });
        expect(mocks.chartVersion).toHaveBeenCalledTimes(
            analyticsSampleContent.charts.length,
        );
        expect(mocks.addVersion).toHaveBeenCalledWith(
            dashboardUuid,
            expect.objectContaining({
                tiles: expect.arrayContaining([
                    expect.objectContaining({
                        properties: {
                            savedChartUuid: uuidv5('ai-calls', dashboardUuid),
                        },
                    }),
                ]),
            }),
            user,
            'project',
            mocks.trx,
        );
    });

    it('restores only the managed IDs when samples were soft-deleted', async () => {
        const mocks = setup({ existing: true, deleted: true });
        await mocks.model.install('project', user);
        expect(mocks.restoreChart).toHaveBeenCalledTimes(
            analyticsSampleContent.charts.length,
        );
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

    it('propagates refresh failures out of the transaction before replacing the dashboard layout', async () => {
        const mocks = setup({ existing: true });
        mocks.chartVersion.mockRejectedValueOnce(new Error('write failed'));
        await expect(mocks.model.install('project', user)).rejects.toThrow(
            'write failed',
        );
        expect(mocks.addVersion).not.toHaveBeenCalled();
    });
});
