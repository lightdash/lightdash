import {
    DashboardTileTypes,
    ForbiddenError,
    NotFoundError,
    type Account,
    type Explore,
    type SavedChartDAO,
    type SavedMergeDefinition,
} from '@lightdash/common';
import { fromSession } from '../../auth/account/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { AccessTarget } from '../SpaceService/SpacePermissionService';
import { DashboardService } from './DashboardService';
import { chart, user } from './DashboardService.mock';

const { projectUuid } = chart;
const account = fromSession(user);
const explore = { name: chart.tableName } as Explore;
const spaceContext = {
    organizationUuid: user.organizationUuid!,
    projectUuid,
    inheritsFromOrgOrProject: true,
    access: [],
    admins: [],
};
const privateSpaceUuid = 'private-space';

const savedChart = (overrides: Partial<SavedChartDAO>): SavedChartDAO => ({
    ...chart,
    ...overrides,
});
const charts: Record<string, SavedChartDAO> = {
    plain: savedChart({ uuid: 'plain' }),
    sameExplore: savedChart({ uuid: 'sameExplore' }),
    merged: savedChart({
        uuid: 'merged',
        merge: {
            queries: {},
            join: 'left',
            keys: {},
        } as unknown as SavedMergeDefinition,
    }),
    broken: savedChart({
        uuid: 'broken',
        metricQuery: { ...chart.metricQuery, exploreName: 'broken' },
    }),
    hidden: savedChart({ uuid: 'hidden', spaceUuid: privateSpaceUuid }),
};

const embeddedDashboard = {
    uuid: 'embedded-dashboard',
    tiles: [
        {
            uuid: 'embed-chart-tile',
            type: DashboardTileTypes.SAVED_CHART,
            properties: { savedChartUuid: 'plain' },
        },
        {
            uuid: 'embed-hidden-tile',
            type: DashboardTileTypes.SAVED_CHART,
            properties: { savedChartUuid: 'hidden' },
        },
        {
            uuid: 'embed-sql-tile',
            type: DashboardTileTypes.SQL_CHART,
            properties: { savedSqlUuid: 'sql', chartName: 'SQL' },
        },
    ],
};

const setup = () => {
    const savedChartModel = {
        get: vi.fn(async (uuid: string) => {
            if (!charts[uuid]) throw new NotFoundError('Saved chart not found');
            return charts[uuid];
        }),
    };
    const savedSqlModel = {
        getByUuid: vi.fn(async (savedSqlUuid: string) => ({
            savedSqlUuid,
            sql: 'select * from orders where region = ${lightdash.parameters.region}',
            space: { uuid: 'space', name: 'Space' },
        })),
    };
    const spacePermissionService = {
        resolveAccessBatch: vi.fn(
            async (_userUuid: string, targets: AccessTarget[]) =>
                targets.map((target) => ({
                    target,
                    context:
                        target.spaceUuid === privateSpaceUuid
                            ? undefined
                            : spaceContext,
                })),
        ),
    };
    const projectService = {
        findExplores: vi.fn(async () => ({ [chart.tableName]: explore })),
        compileQuery: vi.fn(
            async ({ body }: { body: { exploreName: string } }) => {
                if (body.exploreName === 'broken') {
                    throw new Error('Field not found');
                }
                return { parameterReferences: ['orders.region'] };
            },
        ),
        compileMergeQuery: vi.fn(async () => ({
            parameterReferences: ['orders.region', 'payments.region'],
        })),
    };
    const dashboardModel = {
        getByIdOrSlug: vi.fn(async () => embeddedDashboard),
    };
    const permissionsService = {
        checkEmbedPermissions: vi.fn(
            async (_account: unknown, uuid: string) => {
                if (uuid === 'hidden') throw new ForbiddenError('Not embedded');
            },
        ),
        checkEmbedSqlChartPermissions: vi.fn(async () => undefined),
    };
    const service = new DashboardService({
        lightdashConfig: lightdashConfigMock,
        savedChartModel,
        savedSqlModel,
        spacePermissionService,
        projectService,
        dashboardModel,
        permissionsService,
    } as unknown as ConstructorParameters<typeof DashboardService>[0]);
    return {
        service,
        savedChartModel,
        projectService,
        dashboardModel,
        permissionsService,
    };
};

const embedAccount = (content: Record<string, unknown>) =>
    ({
        isJwtUser: () => true,
        isRegisteredUser: () => false,
        user: { id: 'embed-user' },
        organization: { organizationUuid: user.organizationUuid },
        access: { content },
    }) as unknown as Account;
const dashboardEmbed = embedAccount({
    type: 'dashboard',
    dashboardUuid: 'embedded-dashboard',
    chartUuids: [],
    explores: [],
});

const chartTile = (tileUuid: string, savedChartUuid: string) => ({
    tileUuid,
    savedChartUuid,
    savedSqlUuid: null,
});

describe('DashboardService.getTileParameterReferences', () => {
    it('compiles a saved chart against the preloaded explore', async () => {
        const { service, projectService } = setup();

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'plain'),
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: ['orders.region'],
                error: null,
            },
        ]);
        expect(projectService.compileQuery).toHaveBeenCalledWith(
            expect.objectContaining({ explore, projectUuid }),
        );
    });

    it('loads each explore and chart once across tiles', async () => {
        const { service, savedChartModel, projectService } = setup();

        const results = await service.getTileParameterReferences(
            account,
            projectUuid,
            [
                chartTile('tile-1', 'plain'),
                chartTile('tile-2', 'plain'),
                chartTile('tile-3', 'sameExplore'),
            ],
        );

        expect(results.map((result) => result.tileUuid)).toEqual([
            'tile-1',
            'tile-2',
            'tile-3',
        ]);
        expect(savedChartModel.get).toHaveBeenCalledTimes(2);
        expect(projectService.findExplores).toHaveBeenCalledTimes(1);
        expect(projectService.findExplores).toHaveBeenCalledWith(
            expect.objectContaining({ exploreNames: [chart.tableName] }),
        );
        expect(projectService.compileQuery).toHaveBeenCalledTimes(2);
    });

    it('compiles at most five charts at a time', async () => {
        const { service, projectService } = setup();
        const manyCharts = Array.from({ length: 12 }, (_, index) =>
            savedChart({ uuid: `many-${index}` }),
        );
        manyCharts.forEach((manyChart) => {
            charts[manyChart.uuid] = manyChart;
        });
        let running = 0;
        let maxRunning = 0;
        projectService.compileQuery.mockImplementation(async () => {
            running += 1;
            maxRunning = Math.max(maxRunning, running);
            await new Promise((resolve) => {
                setTimeout(resolve, 5);
            });
            running -= 1;
            return { parameterReferences: ['orders.region'] };
        });

        const results = await service.getTileParameterReferences(
            account,
            projectUuid,
            manyCharts.map((manyChart) =>
                chartTile(`tile-${manyChart.uuid}`, manyChart.uuid),
            ),
        );

        expect(results.every((result) => result.error === null)).toBe(true);
        expect(projectService.compileQuery).toHaveBeenCalledTimes(12);
        expect(maxRunning).toBe(5);
    });

    it('compiles a merged chart as a merge query', async () => {
        const { service, projectService } = setup();

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'merged'),
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: ['orders.region', 'payments.region'],
                error: null,
            },
        ]);
        expect(projectService.compileQuery).not.toHaveBeenCalled();
        expect(projectService.compileMergeQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid,
                mergeQuery: expect.objectContaining({
                    sources: [
                        expect.objectContaining({
                            metricQuery: chart.metricQuery,
                        }),
                    ],
                }),
            }),
        );
    });

    it('reads a SQL chart from its SQL', async () => {
        const { service, projectService } = setup();

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                {
                    tileUuid: 'tile-1',
                    savedChartUuid: null,
                    savedSqlUuid: 'sql',
                },
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: ['region'],
                error: null,
            },
        ]);
        expect(projectService.compileQuery).not.toHaveBeenCalled();
    });

    it('reports failing, missing and hidden tiles without failing the rest', async () => {
        const { service } = setup();

        const results = await service.getTileParameterReferences(
            account,
            projectUuid,
            [
                chartTile('good', 'plain'),
                chartTile('failing', 'broken'),
                chartTile('missing', 'deleted'),
                chartTile('denied', 'hidden'),
            ],
        );

        expect(results).toEqual([
            {
                tileUuid: 'good',
                parameterReferences: ['orders.region'],
                error: null,
            },
            {
                tileUuid: 'failing',
                parameterReferences: null,
                error: 'Field not found',
            },
            {
                tileUuid: 'missing',
                parameterReferences: null,
                error: 'Saved chart not found',
            },
            {
                tileUuid: 'denied',
                parameterReferences: null,
                error: "You don't have access to view this chart",
            },
        ]);
    });

    describe('embed accounts', () => {
        it("lists the token dashboard's tiles with the charts saved on it", async () => {
            const { service, savedChartModel, permissionsService } = setup();

            const results = await service.getTileParameterReferences(
                dashboardEmbed,
                projectUuid,
                [
                    // the body names another chart; the dashboard's chart wins
                    chartTile('embed-chart-tile', 'merged'),
                    {
                        tileUuid: 'embed-sql-tile',
                        savedChartUuid: null,
                        savedSqlUuid: 'other-sql',
                    },
                    chartTile('embed-hidden-tile', 'hidden'),
                ],
            );

            expect(results).toEqual([
                {
                    tileUuid: 'embed-chart-tile',
                    parameterReferences: ['orders.region'],
                    error: null,
                },
                {
                    tileUuid: 'embed-sql-tile',
                    parameterReferences: ['region'],
                    error: null,
                },
                {
                    tileUuid: 'embed-hidden-tile',
                    parameterReferences: null,
                    error: "You don't have access to view this chart",
                },
            ]);
            expect(savedChartModel.get).not.toHaveBeenCalledWith(
                'merged',
                undefined,
                expect.anything(),
            );
            expect(
                permissionsService.checkEmbedPermissions,
            ).toHaveBeenCalledWith(dashboardEmbed, 'plain');
            expect(
                permissionsService.checkEmbedSqlChartPermissions,
            ).toHaveBeenCalledWith(dashboardEmbed, 'sql');
        });

        it('refuses a tile that is not on the token dashboard', async () => {
            const { service, savedChartModel } = setup();

            await expect(
                service.getTileParameterReferences(
                    dashboardEmbed,
                    projectUuid,
                    [chartTile('not-on-dashboard', 'plain')],
                ),
            ).resolves.toEqual([
                {
                    tileUuid: 'not-on-dashboard',
                    parameterReferences: null,
                    error: 'Tile is not on the embedded dashboard',
                },
            ]);
            expect(savedChartModel.get).not.toHaveBeenCalled();
        });

        it('refuses a token that does not embed a dashboard', async () => {
            const { service } = setup();

            await expect(
                service.getTileParameterReferences(
                    embedAccount({
                        type: 'chart',
                        chartUuids: ['plain'],
                        explores: [],
                    }),
                    projectUuid,
                    [chartTile('tile-1', 'plain')],
                ),
            ).rejects.toThrow(ForbiddenError);
        });
    });
});
