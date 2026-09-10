import { NotFoundError } from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { user } from '../services/ProjectService/ProjectService.mock';
import { AnalyticsContentModel } from './AnalyticsContentModel';
import { DashboardModel } from './DashboardModel/DashboardModel';
import { SavedChartModel } from './SavedChartModel';
import { SpaceModel } from './SpaceModel';

describe('AnalyticsContentModel', () => {
    afterEach(() => vi.restoreAllMocks());

    const setup = ({ installed = false, authorized = true } = {}) => {
        const insert = vi.fn().mockResolvedValue(undefined);
        const trx = vi.fn((table: string) => {
            const results: Record<string, unknown> = {
                projects: { organization_id: 1 },
                organizations: authorized ? { organization_id: 1 } : undefined,
                analytics_content_installations: installed
                    ? { bundle_version: 1 }
                    : undefined,
            };
            const result = results[table];
            const query = {
                where: vi.fn(),
                forUpdate: vi.fn(),
                first: vi.fn().mockResolvedValue(result),
                insert,
            };
            query.where.mockReturnValue(query);
            query.forUpdate.mockReturnValue(query);
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
            .mockResolvedValue({ uuid: 'dashboard' } as Awaited<
                ReturnType<DashboardModel['create']>
            >);
        const createChart = vi
            .spyOn(SavedChartModel.prototype, 'create')
            .mockImplementation(
                async (_project, _user, data) =>
                    ({ uuid: data.slug }) as Awaited<
                        ReturnType<SavedChartModel['create']>
                    >,
            );
        const addVersion = vi
            .spyOn(DashboardModel.prototype, 'addVersion')
            .mockResolvedValue(
                {} as Awaited<ReturnType<DashboardModel['addVersion']>>,
            );
        return {
            model,
            insert,
            createSpace,
            createDashboard,
            createChart,
            addVersion,
        };
    };

    it('does not recreate or update an installed bundle', async () => {
        const mocks = setup({ installed: true });
        await mocks.model.install('project', user);
        expect(mocks.createSpace).not.toHaveBeenCalled();
        expect(mocks.createDashboard).not.toHaveBeenCalled();
        expect(mocks.createChart).not.toHaveBeenCalled();
        expect(mocks.addVersion).not.toHaveBeenCalled();
    });

    it('rejects a project outside the authenticated organization before creating content', async () => {
        const mocks = setup({ authorized: false });
        await expect(mocks.model.install('project', user)).rejects.toThrow(
            NotFoundError,
        );
        expect(mocks.createSpace).not.toHaveBeenCalled();
    });

    it('records stable chart identities only after the complete dashboard is saved', async () => {
        const mocks = setup();
        await mocks.model.install('project', user);
        expect(mocks.createChart).toHaveBeenCalledTimes(6);
        expect(mocks.createDashboard).toHaveBeenCalledWith(
            'space',
            expect.not.objectContaining({ forceSlug: true }),
            user,
            'project',
        );
        expect(mocks.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                project_uuid: 'project',
                bundle_version: 1,
                dashboard_uuid: 'dashboard',
                chart_uuids: expect.objectContaining({
                    'ai-calls': expect.any(String),
                }),
            }),
        );
        expect(mocks.addVersion.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.insert.mock.invocationCallOrder[0],
        );
    });

    it('propagates partial failures out of the transaction without recording installation', async () => {
        const mocks = setup();
        mocks.createChart.mockRejectedValueOnce(new Error('write failed'));
        await expect(mocks.model.install('project', user)).rejects.toThrow(
            'write failed',
        );
        expect(mocks.insert).not.toHaveBeenCalled();
    });
});
