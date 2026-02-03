/**
 * Seed file to create filter test charts for SQL generation testing.
 * Creates 19 charts covering all filter type + operator combinations.
 */
import {
    ChartType,
    CreateDashboardChartTile,
    DashboardTileTypes,
    FilterOperator,
    generateSlug,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    UnitOfTime,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SpaceModel } from '../../../models/SpaceModel';

const PARENT_SPACE_NAME = '[Test SQL Generation]';
const CHILD_SPACE_NAME = '[Filters]';

type ChartUuids = Record<string, string>;

/**
 * Get or create a space by name. If parentSpaceUuid is provided, looks for/creates
 * a child space under that parent.
 */
async function getOrCreateSpaceByName(
    knex: Knex,
    spaceModel: SpaceModel,
    spaceName: string,
    projectUuid: string,
    userId: number,
    parentSpaceUuid: string | null = null,
): Promise<string> {
    // Query for existing space by name and parent
    const query = knex('spaces')
        .join('projects', 'spaces.project_id', 'projects.project_id')
        .where('spaces.name', spaceName)
        .where('projects.project_uuid', projectUuid);

    if (parentSpaceUuid) {
        void query.where('spaces.parent_space_uuid', parentSpaceUuid);
    } else {
        void query.whereNull('spaces.parent_space_uuid');
    }

    const existingSpace = await query.first();

    if (existingSpace) {
        return existingSpace.space_uuid;
    }

    const space = await spaceModel.createSpace(
        {
            name: spaceName,
            isPrivate: false,
            inheritParentPermissions: true,
            parentSpaceUuid,
        },
        {
            projectUuid,
            userId,
        },
    );

    return space.uuid;
}

async function createFilterTestCharts(
    savedChartModel: SavedChartModel,
    spaceUuid: string,
): Promise<ChartUuids> {
    const updatedByUser = {
        userUuid: SEED_ORG_1_ADMIN.user_uuid,
        firstName: SEED_ORG_1_ADMIN.first_name,
        lastName: SEED_ORG_1_ADMIN.last_name,
    };

    const chartUuids: ChartUuids = {};

    // Chart 1: String - All Operators
    const chart1 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] String - All Operators'),
            name: '[Filter Test] String - All Operators',
            description:
                'Tests all string filter operators: EQUALS (single/multi), NOT_EQUALS, STARTS_WITH, ENDS_WITH, INCLUDE, NOT_INCLUDE',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'string-all',
                        and: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_status' },
                                operator: FilterOperator.EQUALS,
                                values: ['completed'],
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_source' },
                                operator: FilterOperator.EQUALS,
                                values: ['website', 'mobile_app'],
                            },
                            {
                                id: '3',
                                target: { fieldId: 'orders_shipping_method' },
                                operator: FilterOperator.NOT_EQUALS,
                                values: ['overnight'],
                            },
                            {
                                id: '4',
                                target: { fieldId: 'orders_order_priority' },
                                operator: FilterOperator.NOT_EQUALS,
                                values: ['urgent', 'high'],
                            },
                            {
                                id: '5',
                                target: { fieldId: 'orders_currency' },
                                operator: FilterOperator.STARTS_WITH,
                                values: ['US'],
                            },
                            {
                                id: '6',
                                target: {
                                    fieldId: 'orders_fulfillment_center',
                                },
                                operator: FilterOperator.ENDS_WITH,
                                values: ['coast'],
                            },
                            {
                                id: '7',
                                target: { fieldId: 'orders_promo_code' },
                                operator: FilterOperator.INCLUDE,
                                values: ['SALE'],
                            },
                            {
                                id: '8',
                                target: { fieldId: 'orders_order_notes' },
                                operator: FilterOperator.NOT_INCLUDE,
                                values: ['urgent'],
                            },
                        ],
                    },
                },
                sorts: [{ fieldId: 'orders_status', descending: false }],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: ['orders_status', 'orders_unique_order_count'],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.stringAll = chart1.uuid;

    // Chart 2: String - Null
    const chart2 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] String - Null'),
            name: '[Filter Test] String - Null',
            description: 'Tests NULL and NOT_NULL operators on string fields',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_promo_code'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'string-null',
                        or: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_promo_code' },
                                operator: FilterOperator.NULL,
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_notes' },
                                operator: FilterOperator.NOT_NULL,
                            },
                        ],
                    },
                },
                sorts: [{ fieldId: 'orders_promo_code', descending: false }],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: ['orders_promo_code', 'orders_unique_order_count'],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.stringNull = chart2.uuid;

    // Chart 3: Number - All Operators
    const chart3 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Number - All Operators'),
            name: '[Filter Test] Number - All Operators',
            description:
                'Tests all number filter operators: EQUALS, NOT_EQUALS, LESS_THAN, LESS_THAN_OR_EQUAL, GREATER_THAN, GREATER_THAN_OR_EQUAL, IN_BETWEEN, NOT_IN_BETWEEN',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_id'],
                metrics: ['orders_total_order_amount'],
                filters: {
                    dimensions: {
                        id: 'number-all',
                        and: [
                            {
                                id: '1',
                                target: {
                                    fieldId: 'orders_estimated_delivery_days',
                                },
                                operator: FilterOperator.EQUALS,
                                values: [3],
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_customer_id' },
                                operator: FilterOperator.NOT_EQUALS,
                                values: [1],
                            },
                            {
                                id: '3',
                                target: { fieldId: 'orders_amount' },
                                operator: FilterOperator.LESS_THAN,
                                values: [500],
                            },
                            {
                                id: '4',
                                target: { fieldId: 'orders_shipping_cost' },
                                operator: FilterOperator.LESS_THAN_OR_EQUAL,
                                values: [25],
                            },
                            {
                                id: '5',
                                target: { fieldId: 'orders_tax_rate' },
                                operator: FilterOperator.GREATER_THAN,
                                values: [0.05],
                            },
                            {
                                id: '6',
                                target: { fieldId: 'orders_order_id' },
                                operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                                values: [10],
                            },
                            {
                                id: '7',
                                target: { fieldId: 'orders_amount' },
                                operator: FilterOperator.IN_BETWEEN,
                                values: [50, 200],
                            },
                            {
                                id: '8',
                                target: { fieldId: 'orders_shipping_cost' },
                                operator: FilterOperator.NOT_IN_BETWEEN,
                                values: [0, 5],
                            },
                        ],
                    },
                },
                sorts: [{ fieldId: 'orders_order_id', descending: false }],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: ['orders_order_id', 'orders_total_order_amount'],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.numberAll = chart3.uuid;

    // Chart 4: Number - Null
    const chart4 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Number - Null'),
            name: '[Filter Test] Number - Null',
            description: 'Tests NULL and NOT_NULL operators on number fields',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_tax_rate'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'number-null',
                        or: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_tax_rate' },
                                operator: FilterOperator.NULL,
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_amount' },
                                operator: FilterOperator.NOT_NULL,
                            },
                        ],
                    },
                },
                sorts: [{ fieldId: 'orders_tax_rate', descending: false }],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: ['orders_tax_rate', 'orders_unique_order_count'],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.numberNull = chart4.uuid;

    // Chart 5: Date - Basic (DAY)
    const chart5 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Date - Basic (DAY)'),
            name: '[Filter Test] Date - Basic (DAY)',
            description:
                'Tests EQUALS, NOT_EQUALS, LESS_THAN, GREATER_THAN on DAY interval',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'date-basic-day',
                        and: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_order_date_day' },
                                operator: FilterOperator.EQUALS,
                                values: ['2024-06-15'],
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_date_day' },
                                operator: FilterOperator.NOT_EQUALS,
                                values: ['2024-01-01'],
                            },
                            {
                                id: '3',
                                target: { fieldId: 'orders_order_date_day' },
                                operator: FilterOperator.LESS_THAN,
                                values: ['2024-12-01'],
                            },
                            {
                                id: '4',
                                target: { fieldId: 'orders_order_date_day' },
                                operator: FilterOperator.GREATER_THAN,
                                values: ['2024-01-01'],
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_day', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_day',
                    'orders_unique_order_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dateDay = chart5.uuid;

    // Chart 6: Date - Basic (WEEK)
    const chart6 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Date - Basic (WEEK)'),
            name: '[Filter Test] Date - Basic (WEEK)',
            description:
                'Tests EQUALS, LESS_THAN_OR_EQUAL, GREATER_THAN_OR_EQUAL on WEEK interval',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_week'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'date-basic-week',
                        and: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_order_date_week' },
                                operator: FilterOperator.EQUALS,
                                values: ['2024-06-10'],
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_date_week' },
                                operator: FilterOperator.LESS_THAN_OR_EQUAL,
                                values: ['2024-12-31'],
                            },
                            {
                                id: '3',
                                target: { fieldId: 'orders_order_date_week' },
                                operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                                values: ['2024-01-01'],
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_week', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_week',
                    'orders_unique_order_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dateWeek = chart6.uuid;

    // Chart 7: Date - Basic (MONTH)
    const chart7 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Date - Basic (MONTH)'),
            name: '[Filter Test] Date - Basic (MONTH)',
            description:
                'Tests EQUALS, IN_BETWEEN on MONTH interval (NOT_IN_BETWEEN not implemented for dates)',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'date-basic-month',
                        and: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_order_date_month' },
                                operator: FilterOperator.EQUALS,
                                values: ['2024-06-01'],
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_date_month' },
                                operator: FilterOperator.IN_BETWEEN,
                                values: ['2024-01-01', '2024-06-01'],
                            },
                            // NOTE: NOT_IN_BETWEEN is not implemented for date filters
                            // Only available for number filters
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_unique_order_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dateMonth = chart7.uuid;

    // Chart 8: Date - Basic (YEAR)
    const chart8 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Date - Basic (YEAR)'),
            name: '[Filter Test] Date - Basic (YEAR)',
            description:
                'Tests EQUALS, NOT_EQUALS, IN_BETWEEN on YEAR interval',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_year'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'date-basic-year',
                        and: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_order_date_year' },
                                operator: FilterOperator.EQUALS,
                                values: ['2024-01-01'],
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_date_year' },
                                operator: FilterOperator.NOT_EQUALS,
                                values: ['2022-01-01'],
                            },
                            {
                                id: '3',
                                target: { fieldId: 'orders_order_date_year' },
                                operator: FilterOperator.IN_BETWEEN,
                                values: ['2023-01-01', '2025-01-01'],
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_year', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_year',
                    'orders_unique_order_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dateYear = chart8.uuid;

    // Chart 9: Date - IN_THE_PAST
    const chart9 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Date - IN_THE_PAST'),
            name: '[Filter Test] Date - IN_THE_PAST',
            description:
                'Tests IN_THE_PAST with days/weeks/months/quarters/years, completed true/false',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'date-in-past',
                        or: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_order_date_day' },
                                operator: FilterOperator.IN_THE_PAST,
                                values: [30],
                                settings: {
                                    unitOfTime: UnitOfTime.days,
                                    completed: false,
                                },
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_date_day' },
                                operator: FilterOperator.IN_THE_PAST,
                                values: [7],
                                settings: {
                                    unitOfTime: UnitOfTime.days,
                                    completed: true,
                                },
                            },
                            {
                                id: '3',
                                target: { fieldId: 'orders_order_date_week' },
                                operator: FilterOperator.IN_THE_PAST,
                                values: [4],
                                settings: {
                                    unitOfTime: UnitOfTime.weeks,
                                    completed: false,
                                },
                            },
                            {
                                id: '4',
                                target: { fieldId: 'orders_order_date_month' },
                                operator: FilterOperator.IN_THE_PAST,
                                values: [6],
                                settings: {
                                    unitOfTime: UnitOfTime.months,
                                    completed: true,
                                },
                            },
                            {
                                id: '5',
                                target: { fieldId: 'orders_order_date_month' },
                                operator: FilterOperator.IN_THE_PAST,
                                values: [2],
                                settings: {
                                    unitOfTime: UnitOfTime.quarters,
                                    completed: false,
                                },
                            },
                            {
                                id: '6',
                                target: { fieldId: 'orders_order_date_year' },
                                operator: FilterOperator.IN_THE_PAST,
                                values: [1],
                                settings: {
                                    unitOfTime: UnitOfTime.years,
                                    completed: true,
                                },
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_day', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_day',
                    'orders_unique_order_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dateInPast = chart9.uuid;

    // Chart 10: Date - NOT_IN_THE_PAST
    const chart10 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Date - NOT_IN_THE_PAST'),
            name: '[Filter Test] Date - NOT_IN_THE_PAST',
            description:
                'Tests NOT_IN_THE_PAST with all UnitOfTime, completed true/false',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'date-not-in-past',
                        or: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_order_date_day' },
                                operator: FilterOperator.NOT_IN_THE_PAST,
                                values: [90],
                                settings: {
                                    unitOfTime: UnitOfTime.days,
                                    completed: false,
                                },
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_date_week' },
                                operator: FilterOperator.NOT_IN_THE_PAST,
                                values: [12],
                                settings: {
                                    unitOfTime: UnitOfTime.weeks,
                                    completed: true,
                                },
                            },
                            {
                                id: '3',
                                target: { fieldId: 'orders_order_date_month' },
                                operator: FilterOperator.NOT_IN_THE_PAST,
                                values: [3],
                                settings: {
                                    unitOfTime: UnitOfTime.months,
                                    completed: false,
                                },
                            },
                            {
                                id: '4',
                                target: { fieldId: 'orders_order_date_year' },
                                operator: FilterOperator.NOT_IN_THE_PAST,
                                values: [2],
                                settings: {
                                    unitOfTime: UnitOfTime.years,
                                    completed: true,
                                },
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_day', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_day',
                    'orders_unique_order_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dateNotInPast = chart10.uuid;

    // Chart 11: Date - IN_THE_NEXT
    const chart11 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Date - IN_THE_NEXT'),
            name: '[Filter Test] Date - IN_THE_NEXT',
            description: 'Tests IN_THE_NEXT with days/weeks/months/years',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'date-in-next',
                        or: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_order_date_day' },
                                operator: FilterOperator.IN_THE_NEXT,
                                values: [14],
                                settings: { unitOfTime: UnitOfTime.days },
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_date_week' },
                                operator: FilterOperator.IN_THE_NEXT,
                                values: [2],
                                settings: { unitOfTime: UnitOfTime.weeks },
                            },
                            {
                                id: '3',
                                target: { fieldId: 'orders_order_date_month' },
                                operator: FilterOperator.IN_THE_NEXT,
                                values: [3],
                                settings: { unitOfTime: UnitOfTime.months },
                            },
                            {
                                id: '4',
                                target: { fieldId: 'orders_order_date_year' },
                                operator: FilterOperator.IN_THE_NEXT,
                                values: [1],
                                settings: { unitOfTime: UnitOfTime.years },
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_day', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_day',
                    'orders_unique_order_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dateInNext = chart11.uuid;

    // Chart 12: Date - IN_THE_CURRENT
    const chart12 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Date - IN_THE_CURRENT'),
            name: '[Filter Test] Date - IN_THE_CURRENT',
            description:
                'Tests IN_THE_CURRENT with days/weeks/months/quarters/years',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'date-in-current',
                        or: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_order_date_day' },
                                operator: FilterOperator.IN_THE_CURRENT,
                                values: [1],
                                settings: { unitOfTime: UnitOfTime.days },
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_date_week' },
                                operator: FilterOperator.IN_THE_CURRENT,
                                values: [1],
                                settings: { unitOfTime: UnitOfTime.weeks },
                            },
                            {
                                id: '3',
                                target: { fieldId: 'orders_order_date_month' },
                                operator: FilterOperator.IN_THE_CURRENT,
                                values: [1],
                                settings: { unitOfTime: UnitOfTime.months },
                            },
                            {
                                id: '4',
                                target: { fieldId: 'orders_order_date_month' },
                                operator: FilterOperator.IN_THE_CURRENT,
                                values: [1],
                                settings: { unitOfTime: UnitOfTime.quarters },
                            },
                            {
                                id: '5',
                                target: { fieldId: 'orders_order_date_year' },
                                operator: FilterOperator.IN_THE_CURRENT,
                                values: [1],
                                settings: { unitOfTime: UnitOfTime.years },
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_day', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_day',
                    'orders_unique_order_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dateInCurrent = chart12.uuid;

    // Chart 13: Date - NOT_IN_THE_CURRENT
    const chart13 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Date - NOT_IN_THE_CURRENT'),
            name: '[Filter Test] Date - NOT_IN_THE_CURRENT',
            description: 'Tests NOT_IN_THE_CURRENT with all UnitOfTime',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'date-not-in-current',
                        or: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_order_date_day' },
                                operator: FilterOperator.NOT_IN_THE_CURRENT,
                                values: [1],
                                settings: { unitOfTime: UnitOfTime.days },
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_date_week' },
                                operator: FilterOperator.NOT_IN_THE_CURRENT,
                                values: [1],
                                settings: { unitOfTime: UnitOfTime.weeks },
                            },
                            {
                                id: '3',
                                target: { fieldId: 'orders_order_date_month' },
                                operator: FilterOperator.NOT_IN_THE_CURRENT,
                                values: [1],
                                settings: { unitOfTime: UnitOfTime.months },
                            },
                            {
                                id: '4',
                                target: { fieldId: 'orders_order_date_year' },
                                operator: FilterOperator.NOT_IN_THE_CURRENT,
                                values: [1],
                                settings: { unitOfTime: UnitOfTime.years },
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_day', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_day',
                    'orders_unique_order_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dateNotInCurrent = chart13.uuid;

    // Chart 14: Date - Null
    const chart14 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Date - Null'),
            name: '[Filter Test] Date - Null',
            description: 'Tests NULL and NOT_NULL operators on date fields',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'date-null',
                        or: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_order_date_day' },
                                operator: FilterOperator.NULL,
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_order_date_month' },
                                operator: FilterOperator.NOT_NULL,
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_day', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_day',
                    'orders_unique_order_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dateNull = chart14.uuid;

    // Chart 15: Timestamp - All Operators
    const chart15 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Timestamp - All Operators'),
            name: '[Filter Test] Timestamp - All Operators',
            description:
                'Tests timestamp operators: EQUALS, GREATER_THAN, IN_THE_PAST (hours), IN_THE_CURRENT',
            tableName: 'subscriptions',
            metricQuery: {
                exploreName: 'subscriptions',
                dimensions: ['subscriptions_subscription_start_day'],
                metrics: ['subscriptions_total_subscriptions'],
                filters: {
                    dimensions: {
                        id: 'timestamp-all',
                        and: [
                            {
                                id: '1',
                                target: {
                                    fieldId:
                                        'subscriptions_subscription_start_day',
                                },
                                operator: FilterOperator.EQUALS,
                                values: ['2024-06-15T10:30:00Z'],
                            },
                            {
                                id: '2',
                                target: {
                                    fieldId:
                                        'subscriptions_subscription_start_day',
                                },
                                operator: FilterOperator.GREATER_THAN,
                                values: ['2024-01-01T00:00:00Z'],
                            },
                            {
                                id: '3',
                                target: {
                                    fieldId:
                                        'subscriptions_subscription_start_day',
                                },
                                operator: FilterOperator.IN_THE_PAST,
                                values: [24],
                                settings: {
                                    unitOfTime: UnitOfTime.hours,
                                    completed: false,
                                },
                            },
                            {
                                id: '4',
                                target: {
                                    fieldId:
                                        'subscriptions_subscription_start_month',
                                },
                                operator: FilterOperator.IN_THE_CURRENT,
                                values: [1],
                                settings: { unitOfTime: UnitOfTime.months },
                            },
                        ],
                    },
                },
                sorts: [
                    {
                        fieldId: 'subscriptions_subscription_start_day',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'subscriptions_subscription_start_day',
                    'subscriptions_total_subscriptions',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.timestampAll = chart15.uuid;

    // Chart 16: Boolean - All Operators
    const chart16 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Boolean - All Operators'),
            name: '[Filter Test] Boolean - All Operators',
            description: 'Tests EQUALS true, EQUALS false',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_is_completed'],
                metrics: ['orders_unique_order_count'],
                filters: {
                    dimensions: {
                        id: 'boolean-all',
                        or: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_is_completed' },
                                operator: FilterOperator.EQUALS,
                                values: [true],
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_is_completed' },
                                operator: FilterOperator.EQUALS,
                                values: [false],
                            },
                        ],
                    },
                },
                sorts: [{ fieldId: 'orders_is_completed', descending: false }],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_is_completed',
                    'orders_unique_order_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.booleanAll = chart16.uuid;

    // Chart 17: Boolean - Null
    const chart17 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Boolean - Null'),
            name: '[Filter Test] Boolean - Null',
            description: 'Tests NULL and NOT_NULL operators on boolean fields',
            tableName: 'subscriptions',
            metricQuery: {
                exploreName: 'subscriptions',
                dimensions: ['subscriptions_is_active'],
                metrics: ['subscriptions_total_subscriptions'],
                filters: {
                    dimensions: {
                        id: 'boolean-null',
                        or: [
                            {
                                id: '1',
                                target: { fieldId: 'subscriptions_is_active' },
                                operator: FilterOperator.NULL,
                            },
                            {
                                id: '2',
                                target: { fieldId: 'subscriptions_is_active' },
                                operator: FilterOperator.NOT_NULL,
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'subscriptions_is_active', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'subscriptions_is_active',
                    'subscriptions_total_subscriptions',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.booleanNull = chart17.uuid;

    // Chart 18: Mixed - All Types
    const chart18 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Mixed - All Types'),
            name: '[Filter Test] Mixed - All Types',
            description:
                'Tests combination of string, number, date, boolean filters',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_status', 'orders_order_date_month'],
                metrics: [
                    'orders_unique_order_count',
                    'orders_total_order_amount',
                ],
                filters: {
                    dimensions: {
                        id: 'mixed-all',
                        and: [
                            {
                                id: '1',
                                target: { fieldId: 'orders_status' },
                                operator: FilterOperator.EQUALS,
                                values: ['completed', 'shipped'],
                            },
                            {
                                id: '2',
                                target: { fieldId: 'orders_shipping_method' },
                                operator: FilterOperator.STARTS_WITH,
                                values: ['sta'],
                            },
                            {
                                id: '3',
                                target: { fieldId: 'orders_amount' },
                                operator: FilterOperator.GREATER_THAN,
                                values: [50],
                            },
                            {
                                id: '4',
                                target: { fieldId: 'orders_shipping_cost' },
                                operator: FilterOperator.IN_BETWEEN,
                                values: [5, 30],
                            },
                            {
                                id: '5',
                                target: { fieldId: 'orders_order_date_month' },
                                operator: FilterOperator.IN_THE_PAST,
                                values: [12],
                                settings: {
                                    unitOfTime: UnitOfTime.months,
                                    completed: false,
                                },
                            },
                            {
                                id: '6',
                                target: { fieldId: 'orders_is_completed' },
                                operator: FilterOperator.EQUALS,
                                values: [true],
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_status',
                    'orders_order_date_month',
                    'orders_unique_order_count',
                    'orders_total_order_amount',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.mixedAll = chart18.uuid;

    // Chart 19: Nested Logic
    const chart19 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Filter Test] Nested Logic'),
            name: '[Filter Test] Nested Logic',
            description: 'Tests OR group with AND subgroups for nested logic',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_status', 'orders_order_date_day'],
                metrics: [
                    'orders_unique_order_count',
                    'orders_total_order_amount',
                ],
                filters: {
                    dimensions: {
                        id: 'nested-logic',
                        or: [
                            {
                                id: 'group-1',
                                and: [
                                    {
                                        id: '1a',
                                        target: {
                                            fieldId: 'orders_is_completed',
                                        },
                                        operator: FilterOperator.EQUALS,
                                        values: [true],
                                    },
                                    {
                                        id: '1b',
                                        target: { fieldId: 'orders_amount' },
                                        operator: FilterOperator.GREATER_THAN,
                                        values: [200],
                                    },
                                ],
                            },
                            {
                                id: 'group-2',
                                and: [
                                    {
                                        id: '2a',
                                        target: {
                                            fieldId: 'orders_is_completed',
                                        },
                                        operator: FilterOperator.EQUALS,
                                        values: [false],
                                    },
                                    {
                                        id: '2b',
                                        target: {
                                            fieldId: 'orders_order_date_day',
                                        },
                                        operator: FilterOperator.IN_THE_PAST,
                                        values: [7],
                                        settings: {
                                            unitOfTime: UnitOfTime.days,
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_day', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_status',
                    'orders_order_date_day',
                    'orders_unique_order_count',
                    'orders_total_order_amount',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.nestedLogic = chart19.uuid;

    return chartUuids;
}

async function createFilterTestsDashboard(
    knex: Knex,
    spaceUuid: string,
    chartUuids: ChartUuids,
): Promise<void> {
    const dashboardModel = new DashboardModel({
        database: knex,
    });

    // Dashboard layout: 4 columns, each tile is 9 units wide and 6 units tall
    // Total width is 36 units
    const TILE_WIDTH = 9;
    const TILE_HEIGHT = 6;
    const COLS = 4;

    const chartOrder = [
        // Row 1: String filters
        'stringAll',
        'stringNull',
        // Row 1 continued: Number filters
        'numberAll',
        'numberNull',
        // Row 2: Date basic filters
        'dateDay',
        'dateWeek',
        'dateMonth',
        'dateYear',
        // Row 3: Date relative filters
        'dateInPast',
        'dateNotInPast',
        'dateInNext',
        'dateInCurrent',
        // Row 4: Date null + Timestamp
        'dateNotInCurrent',
        'dateNull',
        'timestampAll',
        'booleanAll',
        // Row 5: Boolean null + Mixed + Nested
        'booleanNull',
        'mixedAll',
        'nestedLogic',
    ];

    const tiles: CreateDashboardChartTile[] = chartOrder.map(
        (chartKey, index) => {
            const row = Math.floor(index / COLS);
            const col = index % COLS;

            return {
                uuid: uuidv4(),
                x: col * TILE_WIDTH,
                y: row * TILE_HEIGHT,
                w: TILE_WIDTH,
                h: TILE_HEIGHT,
                type: DashboardTileTypes.SAVED_CHART,
                tabUuid: undefined,
                properties: {
                    savedChartUuid: chartUuids[chartKey],
                },
            };
        },
    );

    await dashboardModel.create(
        spaceUuid,
        {
            name: 'Filter Tests Dashboard',
            slug: generateSlug('Filter Tests Dashboard'),
            description:
                'Dashboard containing all filter test charts for SQL generation verification',
            tiles,
            tabs: [],
            filters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
        },
        {
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
        },
        SEED_PROJECT.project_uuid,
    );
}

export async function seed(knex: Knex): Promise<void> {
    const savedChartModel = new SavedChartModel({
        database: knex,
        lightdashConfig,
    });

    const spaceModel = new SpaceModel({
        database: knex,
    });

    const [user] = await knex('users').where(
        'user_uuid',
        SEED_ORG_1_ADMIN.user_uuid,
    );

    if (!user) {
        throw new Error(`User ${SEED_ORG_1_ADMIN.user_uuid} not found`);
    }

    // Get or create the [Test SQL Generation] parent space
    const parentSpaceUuid = await getOrCreateSpaceByName(
        knex,
        spaceModel,
        PARENT_SPACE_NAME,
        SEED_PROJECT.project_uuid,
        user.user_id,
        null,
    );

    // Get or create the [Filters] child space
    const childSpaceUuid = await getOrCreateSpaceByName(
        knex,
        spaceModel,
        CHILD_SPACE_NAME,
        SEED_PROJECT.project_uuid,
        user.user_id,
        parentSpaceUuid,
    );

    // Create all filter test charts in the child space
    const chartUuids = await createFilterTestCharts(
        savedChartModel,
        childSpaceUuid,
    );

    // Create dashboard with all charts
    await createFilterTestsDashboard(knex, childSpaceUuid, chartUuids);
}
