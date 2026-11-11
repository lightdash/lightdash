import {
    DashboardTileTypes,
    DateGranularity,
    DimensionType,
    FieldType,
    FilterOperator,
    getItemId,
    UnitOfTime,
    type ApiError,
    type DashboardControlSection,
    type DateZoomControl,
    type DashboardFilterRule,
    type DashboardTab,
    type FieldValueSearchResult,
    type DashboardFilterableField,
    type DashboardFilters,
    type DashboardTile,
    type FilterableDimension,
    type ParametersValuesMap,
    type ParameterValue,
    TimeFrames,
} from '@lightdash/common';
import { expect, waitFor } from 'storybook/test';
import { type LightdashApi, type LightdashApiProps } from '../../api';
import mockHealthResponse from '../../testing/__mocks__/api/healthResponse.mock';
import {
    type ParameterControl,
    type ParameterOption,
} from './parameterOptions';

export const PROJECT_UUID = '3675b69e-8324-4110-bdca-059031aa8da3';
export const DASHBOARD_UUID = 'b1f0c6a2-3c7e-4a51-9d55-2f0f3c8a9e10';
export const PROJECT_TIMEZONE = 'Europe/Lisbon';

const dimension = (
    table: string,
    name: string,
    label: string,
    type: FilterableDimension['type'],
    description?: string,
    timeInterval?: TimeFrames,
): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label,
    table,
    tableLabel: table === 'customers' ? 'Customers' : 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
    description,
    ...(timeInterval && {
        timeInterval,
        timeIntervalBaseDimensionName: 'order_date',
    }),
});

// A date dimension's interval, as dbt generates `order_date_week` and co
const orderDateInterval = (interval: TimeFrames, label: string) =>
    dimension(
        'orders',
        `order_date_${interval.toLowerCase()}`,
        label,
        DimensionType.DATE,
        undefined,
        interval,
    );

export const fields = {
    firstName: dimension(
        'customers',
        'first_name',
        'First name',
        DimensionType.STRING,
        "The customer's first name, as entered at checkout.",
    ),
    city: dimension('customers', 'city', 'City', DimensionType.STRING),
    region: dimension('customers', 'region', 'Region', DimensionType.STRING),
    status: dimension(
        'orders',
        'status',
        'Status',
        DimensionType.STRING,
        'Where the order is in fulfilment: placed, shipped, completed or returned.',
    ),
    amount: dimension('orders', 'amount', 'Amount', DimensionType.NUMBER),
    orderDate: dimension(
        'orders',
        'order_date',
        'Order date',
        DimensionType.DATE,
    ),
    createdAt: dimension(
        'orders',
        'created_at',
        'Created at',
        DimensionType.TIMESTAMP,
    ),
    isCompleted: dimension(
        'orders',
        'is_completed',
        'Is completed',
        DimensionType.BOOLEAN,
    ),
    orderWeek: orderDateInterval(TimeFrames.WEEK, 'Order week'),
    orderMonth: orderDateInterval(TimeFrames.MONTH, 'Order month'),
    orderQuarter: orderDateInterval(TimeFrames.QUARTER, 'Order quarter'),
    orderYear: orderDateInterval(TimeFrames.YEAR, 'Order year'),
};

export const itemsMap: Record<string, FilterableDimension> = Object.fromEntries(
    Object.values(fields).map((field) => [getItemId(field), field]),
);

export const tabs: DashboardTab[] = [
    { uuid: 'tab-overview', name: 'Overview', order: 0 },
    { uuid: 'tab-orders', name: 'Orders', order: 1 },
    { uuid: 'tab-finance', name: 'Finance', order: 2 },
];

export const sections: DashboardControlSection[] = [
    { id: 'section-customers', name: 'Customers' },
    { id: 'section-orders', name: 'Orders' },
];

const chartTile = (uuid: string, tabUuid: string): DashboardTile => ({
    uuid,
    tabUuid,
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    w: 6,
    h: 4,
    properties: { savedChartUuid: `chart-${uuid}` },
});

/** The dashboard's chart tiles; parameters and fields refer to these uuids. */
export const tiles: DashboardTile[] = [
    chartTile('tile-revenue', 'tab-overview'),
    chartTile('tile-region-mix', 'tab-overview'),
    chartTile('tile-customers', 'tab-overview'),
    chartTile('tile-weekly', 'tab-orders'),
    chartTile('tile-orders-table', 'tab-orders'),
    chartTile('tile-payments', 'tab-finance'),
];

export const TOTAL_TILE_COUNT = tiles.length;

/** The fields each tile can be filtered by, as the dashboard computes them. */
export const availableTileFilters: Record<string, DashboardFilterableField[]> =
    {
        'tile-revenue': [
            fields.orderDate,
            fields.orderWeek,
            fields.orderMonth,
            fields.amount,
            fields.status,
            fields.isCompleted,
        ],
        'tile-region-mix': [fields.region, fields.city, fields.amount],
        'tile-customers': [fields.firstName, fields.city, fields.region],
        'tile-weekly': [fields.orderWeek, fields.orderDate, fields.status],
        'tile-orders-table': [
            fields.status,
            fields.amount,
            fields.orderDate,
            fields.createdAt,
            fields.isCompleted,
        ],
        'tile-payments': [
            fields.amount,
            fields.createdAt,
            fields.orderQuarter,
            fields.orderYear,
        ],
    };

const rule = (
    id: string,
    field: FilterableDimension,
    overrides: Partial<DashboardFilterRule>,
): DashboardFilterRule => ({
    id,
    label: undefined,
    target: { fieldId: getItemId(field), tableName: field.table },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: false,
    tileTargets: {},
    ...overrides,
});

export const rules = {
    firstName: rule('filter-first-name', fields.firstName, {
        values: ['Aaron', 'Bella'],
    }),
    firstNameSingle: rule('filter-first-name-single', fields.firstName, {
        values: ['Aaron'],
        singleValue: true,
    }),
    amountSingle: rule('filter-amount-single', fields.amount, {
        values: [100],
        singleValue: true,
    }),
    amountGreater: rule('filter-amount-greater', fields.amount, {
        operator: FilterOperator.GREATER_THAN,
        values: [100],
    }),
    amountNotBetween: rule('filter-amount-not-between', fields.amount, {
        operator: FilterOperator.NOT_IN_BETWEEN,
        values: [10, 250],
    }),
    orderDateIs: rule('filter-order-date-is', fields.orderDate, {
        values: ['2026-09-01', '2026-09-15'],
    }),
    createdAtIs: rule('filter-created-at-is', fields.createdAt, {
        values: ['2026-09-01T09:00:00.000Z'],
    }),
    orderDateAfter: rule('filter-order-date-after', fields.orderDate, {
        operator: FilterOperator.GREATER_THAN,
        values: ['2026-09-01'],
    }),
    orderWeekAfter: rule('filter-order-week-after', fields.orderWeek, {
        operator: FilterOperator.GREATER_THAN,
        values: ['2026-09-07'],
    }),
    orderMonthAfter: rule('filter-order-month-after', fields.orderMonth, {
        operator: FilterOperator.GREATER_THAN,
        values: ['2026-09-01'],
    }),
    orderQuarterAfter: rule('filter-order-quarter-after', fields.orderQuarter, {
        operator: FilterOperator.GREATER_THAN,
        values: ['2026-07-01'],
    }),
    orderYearAfter: rule('filter-order-year-after', fields.orderYear, {
        operator: FilterOperator.GREATER_THAN,
        values: ['2026-01-01'],
    }),
    orderDateCurrentToDate: rule(
        'filter-order-date-current',
        fields.orderDate,
        {
            operator: FilterOperator.IN_THE_CURRENT,
            values: [1],
            settings: {
                unitOfTime: UnitOfTime.months,
                completed: false,
                toDate: true,
            },
        },
    ),
    orderDateCurrentExcludeToday: rule(
        'filter-order-date-current-exclude-today',
        fields.orderDate,
        {
            operator: FilterOperator.IN_THE_CURRENT,
            values: [1],
            settings: {
                unitOfTime: UnitOfTime.months,
                completed: false,
                toDate: true,
                excludeToday: true,
            },
        },
    ),
    orderDatePeriodToDate: rule('filter-order-date-to-date', fields.orderDate, {
        operator: FilterOperator.IN_PERIOD_TO_DATE,
        values: [],
        settings: { unitOfTime: UnitOfTime.quarters, completed: false },
    }),
    regionInGroup: rule('filter-region-in-group', fields.region, {
        label: 'Customer region',
        values: [],
        disabled: true,
        requiredGroupId: 'group-location',
    }),
    regionRequiredAlone: rule('filter-region-required', fields.region, {
        label: 'Sales region',
        values: [],
        disabled: true,
        required: true,
    }),
    statusOpen: rule('filter-status-open', fields.status, {
        label: 'Open orders',
        values: [],
        disabled: true,
    }),
    cityInGroup: rule('filter-city-in-group', fields.city, {
        label: 'Customer city',
        values: ['Lisbon'],
        requiredGroupId: 'group-location',
    }),
    city: rule('filter-city', fields.city, { values: ['Lisbon'] }),
    amountBetween: rule('filter-amount-between', fields.amount, {
        operator: FilterOperator.IN_BETWEEN,
        values: [10, 250],
    }),
    amountMany: rule('filter-amount-many', fields.amount, {
        label: 'Order amounts',
        values: Array.from({ length: 620 }, (_, index) => index * 5),
    }),
    orderDatePast: rule('filter-order-date-past', fields.orderDate, {
        operator: FilterOperator.IN_THE_PAST,
        values: [14],
        settings: { unitOfTime: UnitOfTime.days, completed: true },
    }),
    orderDateBetween: rule('filter-order-date-between', fields.orderDate, {
        operator: FilterOperator.IN_BETWEEN,
        values: ['2026-09-01', '2026-09-30'],
    }),
    createdBetween: rule('filter-created-between', fields.createdAt, {
        operator: FilterOperator.IN_BETWEEN,
        values: ['2026-09-01T00:00:00.000Z', '2026-09-30T23:59:00.000Z'],
    }),
    isCompleted: rule('filter-is-completed', fields.isCompleted, {
        values: [true],
    }),
    cityIsNull: rule('filter-city-null', fields.city, {
        label: 'Missing city',
        operator: FilterOperator.NULL,
    }),
    sqlRegion: {
        id: 'filter-sql-region',
        label: undefined,
        target: {
            fieldId: 'region',
            tableName: '',
            isSqlColumn: true,
            fallbackType: DimensionType.STRING,
        },
        operator: FilterOperator.EQUALS,
        values: ['EMEA'],
        disabled: false,
        tileTargets: {},
    } satisfies DashboardFilterRule,
    statusRequiredLocked: rule('filter-status', fields.status, {
        label: 'Order status',
        values: [],
        disabled: true,
        required: true,
        lockedTabUuids: ['tab-overview'],
    }),
    statusSaved: rule('filter-status-saved', fields.status, {
        label: 'Order status',
        values: ['completed', 'shipped'],
    }),
    statusBusy: rule('filter-status', fields.status, {
        label: 'Order status',
        values: ['completed'],
        singleValue: true,
        required: true,
        lockedTabUuids: ['tab-overview', 'tab-orders'],
        sectionId: 'section-orders',
    }),
    statusSettings: rule('filter-status', fields.status, {
        label: 'Order status',
        values: ['completed'],
        required: true,
        lockedTabUuids: ['tab-overview', 'tab-orders'],
        sectionId: 'section-orders',
    }),
};

export const dashboardFilters: DashboardFilters = {
    dimensions: [
        rules.firstName,
        rules.city,
        rules.amountBetween,
        rules.orderDatePast,
        rules.isCompleted,
        rules.statusSettings,
        rules.regionInGroup,
        rules.cityInGroup,
        rules.regionRequiredAlone,
        rules.statusOpen,
    ],
    metrics: [],
    tableCalculations: [],
};

const FIRST_NAMES = [
    'Aaron',
    'Adam',
    'Alan',
    'Albert',
    'Alice',
    'Amanda',
    'Amy',
    'Andrea',
    'Andrew',
    'Angela',
    'Ann',
    'Anna',
    'Anne',
    'Annie',
    'Anthony',
    'Antonio',
    'Arthur',
    'Ashley',
    'Barbara',
    'Bella',
];

const VALUES_BY_FIELD: Record<string, string[]> = {
    [getItemId(fields.firstName)]: FIRST_NAMES,
    [getItemId(fields.region)]: [
        'APAC',
        'Americas',
        'Americas North',
        'Americas South',
        'EMEA',
        'LATAM',
    ],
    payments_payment_method: [
        'bank_transfer',
        'coupon',
        'credit_card',
        'gift_card',
    ],
    [getItemId(fields.status)]: [
        'completed',
        'placed',
        'return_pending',
        'returned',
        'shipped',
    ],
};

// Suggestions for this field fail, to show the picker's error and retry
const FAILING_FIELD_ID = getItemId(fields.city);

const FIELD_SEARCH_URL = /^\/projects\/[^/]+\/field\/([^/]+)\/search$/;

type FieldSearchBody = { search: string; parameters: ParametersValuesMap };

const readBody = (body: LightdashApiProps['body']): FieldSearchBody => {
    if (typeof body !== 'string') return { search: '', parameters: {} };
    try {
        const parsed: unknown = JSON.parse(body);
        if (typeof parsed !== 'object' || parsed === null)
            return { search: '', parameters: {} };
        return {
            search:
                'search' in parsed && typeof parsed.search === 'string'
                    ? parsed.search
                    : '',
            parameters:
                'parameters' in parsed &&
                typeof parsed.parameters === 'object' &&
                parsed.parameters !== null
                    ? (parsed.parameters as ParametersValuesMap)
                    : {},
        };
    } catch {
        return { search: '', parameters: {} };
    }
};

/** Every value search since the story began, with the parameter values it
 * sent; a story's `beforeEach` empties it. */
export const fieldSearchRequests: {
    fieldId: string;
    parameters: ParametersValuesMap;
}[] = [];

let pendingRequests = 0;

/** Waits for the stubbed requests to answer, so a play ends on a settled page. */
export const waitForApiIdle = () =>
    waitFor(() => expect(pendingRequests).toBe(0), { timeout: 3000 });

const warehouseError: ApiError = {
    status: 'error',
    error: {
        name: 'WarehouseQueryError',
        statusCode: 500,
        message: 'Query exceeded the 30 second timeout',
        data: {},
    },
};

const delay = (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const answer = async (props: LightdashApiProps): Promise<unknown> => {
    if (props.url.startsWith('/health')) return mockHealthResponse();
    if (props.url.startsWith('/feature-flag/'))
        return { id: props.url.split('/').pop(), enabled: false };
    if (props.url === `/projects/${PROJECT_UUID}`)
        return {
            projectUuid: PROJECT_UUID,
            name: 'Jaffle shop',
            useProjectTimezoneInFilters: false,
        };
    const fieldSearch = FIELD_SEARCH_URL.exec(props.url);
    if (fieldSearch) {
        const fieldId = fieldSearch[1];
        const body = readBody(props.body);
        fieldSearchRequests.push({ fieldId, parameters: body.parameters });
        await delay(300);
        if (fieldId === FAILING_FIELD_ID) throw warehouseError;
        const search = body.search.toLowerCase();
        const results = (VALUES_BY_FIELD[fieldId] ?? []).filter((value) =>
            value.toLowerCase().includes(search),
        );
        return {
            search,
            results,
            cached: true,
            refreshedAt: new Date(),
        } satisfies FieldValueSearchResult<string>;
    }
    throw new Error(`Not stubbed in this story: ${props.method} ${props.url}`);
};

const respond = async (props: LightdashApiProps): Promise<unknown> => {
    pendingRequests += 1;
    try {
        return await answer(props);
    } finally {
        pendingRequests -= 1;
    }
};

const notStubbed = () => Promise.reject(new Error('Not stubbed in this story'));

// Answers the requests the shipped pickers make, offline
export const storyLightdashApi: LightdashApi = Object.assign(
    <T>(props: LightdashApiProps) => respond(props) as Promise<T>,
    {
        response: notStubbed,
        stream: notStubbed,
        getResultsFromStream: notStubbed,
    },
);

const REGIONS = ['Global', 'EMEA', 'APAC', 'Americas'];

// One per model's parameter, as the add menu lists them: same-named ones stay
// apart, since each resolves by its own key. `tile-region-mix` uses both
// Regions, so a control setting both counts it once
export const parameters = {
    ordersRegion: {
        key: 'orders.region',
        source: { type: 'model', modelName: 'orders', modelLabel: 'Orders' },
        tileUuids: ['tile-revenue', 'tile-region-mix'],
        definition: {
            label: 'Region',
            description: 'The sales region orders are reported in.',
            type: 'string',
            default: 'Global',
            options: REGIONS,
        },
    },
    paymentsRegion: {
        key: 'payments.region',
        source: {
            type: 'model',
            modelName: 'payments',
            modelLabel: 'Payments',
        },
        tileUuids: ['tile-region-mix', 'tile-payments'],
        definition: {
            label: 'Region',
            type: 'string',
            default: 'Global',
            options: REGIONS,
        },
    },
    ordersWeekStart: {
        key: 'orders.week_start',
        source: { type: 'model', modelName: 'orders', modelLabel: 'Orders' },
        tileUuids: ['tile-revenue', 'tile-weekly'],
        definition: {
            label: 'Week starts on',
            type: 'string',
            default: 'Monday',
            options: ['Monday', 'Sunday'],
        },
    },
    ordersMinAmount: {
        key: 'orders.min_amount',
        source: { type: 'model', modelName: 'orders', modelLabel: 'Orders' },
        tileUuids: ['tile-revenue'],
        definition: {
            label: 'Minimum amount',
            type: 'number',
            default: 100,
            options: [50, 100, 250],
            allow_custom_values: true,
        },
    },
    ordersStartDate: {
        key: 'orders.start_date',
        source: { type: 'model', modelName: 'orders', modelLabel: 'Orders' },
        tileUuids: ['tile-weekly'],
        definition: {
            label: 'Start date',
            type: 'date',
            default: 'today',
        },
    },
    customersSegments: {
        key: 'customers.segments',
        source: {
            type: 'model',
            modelName: 'customers',
            modelLabel: 'Customers',
        },
        tileUuids: ['tile-customers'],
        definition: {
            label: 'Segments',
            type: 'string',
            multiple: true,
            default: ['Enterprise', 'SMB'],
            options: ['Enterprise', 'Mid-market', 'SMB'],
        },
    },
    paymentsMethod: {
        key: 'payments.method',
        source: {
            type: 'model',
            modelName: 'payments',
            modelLabel: 'Payments',
        },
        tileUuids: ['tile-payments'],
        definition: {
            label: 'Payment method',
            type: 'string',
            default: 'credit_card',
            options_from_dimension: {
                model: 'payments',
                dimension: 'payment_method',
            },
        },
    },
    fiscalYearStart: {
        key: 'fiscal_year_start',
        source: { type: 'project' },
        tileUuids: ['tile-revenue', 'tile-payments'],
        definition: {
            label: 'Fiscal year starts',
            type: 'string',
            default: 'January',
            options: ['January', 'April', 'July', 'October'],
        },
    },
    paymentsCurrency: {
        key: 'payments.currency',
        source: {
            type: 'model',
            modelName: 'payments',
            modelLabel: 'Payments',
        },
        tileUuids: ['tile-payments'],
        definition: {
            label: 'Currency',
            type: 'string',
            options: ['EUR', 'USD', 'GBP'],
        },
    },
} satisfies Record<string, ParameterOption>;

export const parameterList: ParameterOption[] = Object.values(parameters);

/** The dashboard's parameter values, which a field's value search sends. */
export const parameterValues: ParametersValuesMap = {
    'orders.region': 'EMEA',
    'payments.currency': 'EUR',
};

// A wide project: 2,000 dimensions over 20 tables, all on one tile
export const manyFields: FilterableDimension[] = Array.from(
    { length: 2000 },
    (_, index) => {
        const table = `table_${String(index % 20).padStart(2, '0')}`;
        return {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: `field_${String(index).padStart(4, '0')}`,
            label: `Field ${String(index).padStart(4, '0')}`,
            table,
            tableLabel: `Table ${table.slice(-2)}`,
            sql: `\${TABLE}.field_${index}`,
            hidden: false,
        };
    },
);

export const manyFieldsTiles: DashboardTile[] = [
    chartTile('tile-wide', 'tab-overview'),
];

export const manyFieldsByTile: Record<string, DashboardFilterableField[]> = {
    'tile-wide': manyFields,
};

/** Already set by a control on the bar: a pick in the add menu adds a second one. */
export const ON_BAR_PARAMETER_KEYS = [parameters.ordersWeekStart.key];

/** A control setting `options` on every tile that uses them, or on `tileUuids`. */
export const createParameterControl = (
    options: ParameterOption[],
    value: ParameterValue | null,
    tileUuids: string[] = [
        ...new Set(options.flatMap((option) => option.tileUuids)),
    ],
): ParameterControl => ({
    id: `parameter-${options.map(({ key }) => key).join('-')}`,
    label: null,
    parameters: options,
    tileUuids,
    sectionId: null,
    value,
});

/** The dashboard's custom grains, as the tiles' dbt project names them. */
export const customGranularityLabels: Record<string, string> = {
    fiscal_quarter: 'Fiscal quarter',
    retail_week: 'Retail week',
};

/** The grains viewers can pick: the shipped list's usual five. */
export const enabledGranularities: string[] = [
    DateGranularity.DAY,
    DateGranularity.WEEK,
    DateGranularity.MONTH,
    DateGranularity.QUARTER,
    DateGranularity.YEAR,
];

/** A named zoom at Week, on no section, shown to viewers. */
export const createDateZoomControl = (
    overrides: Partial<DateZoomControl> = {},
): DateZoomControl => ({
    uuid: 'zoom-revenue',
    name: 'Revenue zoom',
    granularity: DateGranularity.WEEK,
    ...overrides,
});
