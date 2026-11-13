import { Ability } from '@casl/ability';
import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    ForbiddenError,
    type Dashboard,
    type Explore,
    type PossibleAbilities,
    type RegisteredAccount,
    type SavedChartDAO,
} from '@lightdash/common';
import { fromSession } from '../../auth/account/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { AccessTarget } from '../SpaceService/SpacePermissionService';
import { DashboardService } from './DashboardService';
import { chart, user } from './DashboardService.mock';

const { projectUuid } = chart;
const account = fromSession(user) as RegisteredAccount;
const privateSpaceUuid = 'private-space';

// The chart's explore references a model parameter on its table
const explore = {
    name: chart.tableName,
    baseTable: chart.tableName,
    joinedTables: [],
    tables: {
        [chart.tableName]: {
            name: chart.tableName,
            originalName: 'orders',
            sqlTable: '"schema"."orders"',
            parameterReferences: ['orders.min_amount'],
            parameters: {
                min_amount: {
                    label: 'Minimum amount',
                    type: 'number',
                    default: 10,
                },
            },
            dimensions: {
                amount: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    name: 'amount',
                    table: chart.tableName,
                    sql: '${TABLE}.amount',
                    compiledSql: '"orders".amount',
                    parameterReferences: [],
                },
            },
            metrics: {},
        },
    },
} as unknown as Explore;

const charts: Record<string, SavedChartDAO> = {
    orders: {
        ...chart,
        uuid: 'orders',
        parameters: { 'orders.min_amount': 50 },
    },
    hidden: { ...chart, uuid: 'hidden', spaceUuid: privateSpaceUuid },
};

const dashboard = {
    uuid: 'dashboard',
    name: 'Dashboard',
    organizationUuid: user.organizationUuid,
    spaceUuid: 'space',
    projectUuid,
    parameters: { region: { parameterName: 'region', value: 'APAC' } },
    tiles: [
        {
            uuid: 'chart-tile',
            type: DashboardTileTypes.SAVED_CHART,
            properties: { savedChartUuid: 'orders' },
        },
        {
            uuid: 'sql-tile',
            type: DashboardTileTypes.SQL_CHART,
            properties: { savedSqlUuid: 'sql', chartName: 'SQL' },
        },
        {
            uuid: 'other-sql-tile',
            type: DashboardTileTypes.SQL_CHART,
            properties: { savedSqlUuid: 'sql', chartName: 'SQL again' },
        },
        {
            uuid: 'private-tile',
            type: DashboardTileTypes.SAVED_CHART,
            properties: { savedChartUuid: 'hidden' },
        },
        {
            uuid: 'markdown-tile',
            type: DashboardTileTypes.MARKDOWN,
            properties: { title: '', content: '' },
        },
    ],
} as unknown as Dashboard;

const setup = ({
    exploreOverride = explore,
    projectParameters = [],
}: {
    exploreOverride?: Explore;
    projectParameters?: { name: string; config: object }[];
} = {}) => {
    const savedChartModel = {
        get: vi.fn(async (uuid: string) => charts[uuid]),
    };
    const savedSqlModel = {
        getByUuid: vi.fn(async (savedSqlUuid: string) => ({
            savedSqlUuid,
            sql: 'select * from orders where region = ${lightdash.parameters.region}',
            space: { uuid: 'space', name: 'Space' },
        })),
    };
    const spacePermissionService = {
        resolveAccess: vi.fn(async () => ({
            organizationUuid: user.organizationUuid!,
            projectUuid,
            inheritsFromOrgOrProject: true,
            access: [],
        })),
        resolveAccessBatch: vi.fn(
            async (_userUuid: string, targets: AccessTarget[]) =>
                targets.map((target) => ({
                    target,
                    context:
                        target.spaceUuid === privateSpaceUuid
                            ? undefined
                            : {
                                  organizationUuid: user.organizationUuid!,
                                  projectUuid,
                                  inheritsFromOrgOrProject: true,
                                  access: [],
                                  admins: [],
                              },
                })),
        ),
    };
    const projectService = {
        projectParametersModel: {
            find: vi.fn().mockResolvedValue([
                {
                    name: 'region',
                    config: {
                        label: 'Region',
                        options: ['EMEA', 'APAC'],
                        default: 'EMEA',
                    },
                },
                { name: 'unused', config: { label: 'Unused' } },
                ...projectParameters,
            ]),
        },
        findExplores: vi.fn(async () => ({
            [chart.tableName]: exploreOverride,
        })),
        getQueryTimezoneForProject: vi.fn(async () => 'Pacific/Kiritimati'),
    };
    const analyticsModel = { addDashboardViewEvent: vi.fn() };
    const analytics = { track: vi.fn() };
    const service = new DashboardService({
        lightdashConfig: lightdashConfigMock,
        savedChartModel,
        savedSqlModel,
        spacePermissionService,
        projectService,
        featureFlagModel: { get: vi.fn() },
        dashboardModel: { getByIdOrSlug: vi.fn(async () => dashboard) },
        analyticsModel,
        analytics,
    } as unknown as ConstructorParameters<typeof DashboardService>[0]);
    return { service, projectService, analyticsModel, analytics };
};

// The explore as a virtual view with saved values, its table referencing the given parameters
const withReferences = (
    parameterReferences: string[],
    savedParameterValues: object,
) =>
    ({
        ...explore,
        savedParameterValues,
        tables: {
            [chart.tableName]: {
                ...explore.tables[chart.tableName],
                parameterReferences,
            },
        },
    }) as unknown as Explore;

describe('DashboardService.getChartParameters', () => {
    it('lists the parameters the chart uses with its saved values', async () => {
        const { service } = setup();
        const result = await service.getChartParameters(
            account,
            projectUuid,
            'orders',
        );
        expect(result).toEqual([
            {
                name: 'orders.min_amount',
                config: {
                    label: 'Minimum amount',
                    type: 'number',
                    default: 10,
                },
                currentValue: 50,
                source: 'model',
            },
        ]);
    });

    it('falls back to the virtual view value, under the chart value', async () => {
        const { service } = setup({
            exploreOverride: withReferences(['orders.min_amount', 'region'], {
                'orders.min_amount': 20,
                region: 'APAC',
            }),
        });
        const result = await service.getChartParameters(
            account,
            projectUuid,
            'orders',
        );
        expect(
            Object.fromEntries(
                result.map(({ name, currentValue }) => [name, currentValue]),
            ),
        ).toEqual({ 'orders.min_amount': 50, region: 'APAC' });
    });

    it('skips a virtual view value outside the fixed options', async () => {
        const { service } = setup({
            exploreOverride: withReferences(['region'], { region: 'LATAM' }),
        });
        const [region] = await service.getChartParameters(
            account,
            projectUuid,
            'orders',
        );
        expect(region).toMatchObject({ name: 'region', currentValue: 'EMEA' });
    });

    it("resolves a today default in the project's query timezone", async () => {
        vi.useFakeTimers({ now: new Date('2026-01-01T23:00:00Z') });
        try {
            const { service, projectService } = setup({
                projectParameters: [
                    {
                        name: 'as_of',
                        config: {
                            label: 'As of',
                            type: 'date',
                            default: 'today',
                        },
                    },
                ],
                exploreOverride: withReferences(['as_of'], {}),
            });
            const [asOf] = await service.getChartParameters(
                account,
                projectUuid,
                'orders',
            );
            // Kiritimati is UTC+14, already on the next day
            expect(asOf.currentValue).toBe('2026-01-02');
            const [dashboardAsOf] = await service.getDashboardParameters(
                account,
                projectUuid,
                'dashboard',
            );
            expect(dashboardAsOf).toMatchObject({
                name: 'as_of',
                currentValue: '2026-01-02',
            });
            expect(
                projectService.getQueryTimezoneForProject,
            ).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("refuses a chart the user can't view", async () => {
        const { service } = setup();
        await expect(
            service.getChartParameters(account, projectUuid, 'hidden'),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('DashboardService.getDashboardParameters', () => {
    it('lists the parameters across viewable tiles with the dashboard values', async () => {
        const { service } = setup();
        const result = await service.getDashboardParameters(
            account,
            projectUuid,
            'dashboard',
        );
        expect(result).toEqual([
            {
                name: 'orders.min_amount',
                config: {
                    label: 'Minimum amount',
                    type: 'number',
                    default: 10,
                },
                currentValue: 10,
                source: 'model',
                tileUuids: ['chart-tile'],
            },
            {
                name: 'region',
                config: {
                    label: 'Region',
                    type: 'string',
                    options: ['EMEA', 'APAC'],
                    default: 'EMEA',
                },
                currentValue: 'APAC',
                source: 'project',
                tileUuids: ['sql-tile', 'other-sql-tile'],
            },
        ]);
    });

    it('does not record a dashboard view', async () => {
        const { service, projectService, analyticsModel, analytics } = setup();
        await service.getDashboardParameters(account, projectUuid, 'dashboard');
        expect(analyticsModel.addDashboardViewEvent).not.toHaveBeenCalled();
        expect(analytics.track).not.toHaveBeenCalled();
        expect(
            projectService.getQueryTimezoneForProject,
        ).not.toHaveBeenCalled();
    });

    it("refuses a dashboard the user can't view", async () => {
        const { service, analyticsModel } = setup();
        const chartOnlyAccount = fromSession({
            ...user,
            ability: new Ability<PossibleAbilities>([
                { subject: 'SavedChart', action: ['view'] },
            ]),
        }) as RegisteredAccount;
        await expect(
            service.getDashboardParameters(
                chartOnlyAccount,
                projectUuid,
                'dashboard',
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(analyticsModel.addDashboardViewEvent).not.toHaveBeenCalled();
    });
});
