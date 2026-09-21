import { ForbiddenError, type CreateSavedChart } from '@lightdash/common';
import { fromSession } from '../../auth/account/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DashboardService } from './DashboardService';
import { chart, dashboard, user } from './DashboardService.mock';

const setup = () => {
    const createChart = vi
        .fn()
        .mockImplementation(async (_account, _projectUuid, data) => ({
            ...chart,
            uuid: data.name,
            name: data.name,
        }));
    const service = new DashboardService({
        lightdashConfig: lightdashConfigMock,
        savedChartService: { create: createChart },
    } as unknown as ConstructorParameters<typeof DashboardService>[0]);
    const create = vi.spyOn(service, 'create').mockResolvedValue(dashboard);
    const update = vi.spyOn(service, 'update').mockResolvedValue(dashboard);
    vi.spyOn(service, 'getByIdOrSlug').mockResolvedValue(dashboard);
    return { service, createChart, create, update };
};
const data = {
    name: 'Dashboard',
    spaceUuid: 'space-1',
    charts: [{ name: 'first' }, { name: 'second' }] as CreateSavedChart[],
};

describe('creating a dashboard with placed charts', () => {
    it('uses each saved chart at its supplied position without changing chart order', async () => {
        const { service, createChart, update } = setup();
        const tilePositions = [
            { x: 0, y: 10, w: 36, h: 8 },
            { x: 0, y: 0, w: 36, h: 10 },
        ];
        expect(
            await service.createDashboardWithCharts(
                fromSession(user),
                'projectUuid',
                { ...data, tilePositions },
            ),
        ).toBe(dashboard);
        expect(createChart).toHaveBeenCalledTimes(2);
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
            }),
            dashboard.uuid,
            expect.objectContaining({
                tiles: [
                    expect.objectContaining({
                        ...tilePositions[0],
                        properties: expect.objectContaining({
                            savedChartUuid: 'first',
                            belongsToDashboard: true,
                        }),
                    }),
                    expect.objectContaining({
                        ...tilePositions[1],
                        properties: expect.objectContaining({
                            savedChartUuid: 'second',
                            belongsToDashboard: true,
                        }),
                    }),
                ],
            }),
        );
    });

    it.each(
        [
            [{ x: 0, y: 0, w: 36, h: 8 }],
            [
                { x: 0, y: 0, w: 18, h: 8 },
                { x: 17, y: 0, w: 18, h: 8 },
            ],
            [
                { x: 0, y: 0, w: 18, h: 8 },
                { x: 20, y: 0, w: 18, h: 8 },
            ],
        ].map((tilePositions) => ({ tilePositions })),
    )(
        'rejects invalid placement before any writes: %j',
        async ({ tilePositions }) => {
            const { service, createChart, create, update } = setup();
            await expect(
                service.createDashboardWithCharts(
                    fromSession(user),
                    'projectUuid',
                    { ...data, tilePositions },
                ),
            ).rejects.toThrow('without overlap');
            expect(create).not.toHaveBeenCalled();
            expect(createChart).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
        },
    );

    it('still requires dashboard creation permission before creating charts', async () => {
        const { service, createChart, create } = setup();
        create.mockRejectedValue(new ForbiddenError('Cannot create dashboard'));
        await expect(
            service.createDashboardWithCharts(
                fromSession(user),
                'projectUuid',
                data,
            ),
        ).rejects.toThrow('Cannot create dashboard');
        expect(createChart).not.toHaveBeenCalled();
    });
});
