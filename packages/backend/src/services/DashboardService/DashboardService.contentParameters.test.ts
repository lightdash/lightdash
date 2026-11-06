import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    ForbiddenError,
    type Dashboard,
    type Explore,
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

const setup = () => {
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
            ]),
        },
        findExplores: vi.fn(async () => ({ [chart.tableName]: explore })),
    };
    const service = new DashboardService({
        lightdashConfig: lightdashConfigMock,
        savedChartModel,
        savedSqlModel,
        spacePermissionService,
        projectService,
        featureFlagModel: { get: vi.fn() },
    } as unknown as ConstructorParameters<typeof DashboardService>[0]);
    vi.spyOn(service, 'getByIdOrSlug').mockResolvedValue(dashboard);
    return { service };
};

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
});
