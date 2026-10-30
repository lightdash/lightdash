import {
    DimensionType,
    FieldType,
    FilterOperator,
    getItemId,
    UnitOfTime,
    type ApiError,
    type DashboardControlSection,
    type DashboardFilterRule,
    type DashboardTab,
    type FieldValueSearchResult,
    type FilterableDimension,
} from '@lightdash/common';
import { type LightdashApi, type LightdashApiProps } from '../../api';
import mockHealthResponse from '../../testing/__mocks__/api/healthResponse.mock';

export const PROJECT_UUID = '3675b69e-8324-4110-bdca-059031aa8da3';
export const DASHBOARD_UUID = 'b1f0c6a2-3c7e-4a51-9d55-2f0f3c8a9e10';
export const TOTAL_TILE_COUNT = 29;

const dimension = (
    table: string,
    name: string,
    label: string,
    type: FilterableDimension['type'],
    description?: string,
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
});

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

export const dashboardFilters = {
    dimensions: [
        rules.firstName,
        rules.city,
        rules.amountBetween,
        rules.orderDatePast,
        rules.isCompleted,
        rules.statusSettings,
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

const readSearch = (body: LightdashApiProps['body']): string => {
    if (typeof body !== 'string') return '';
    try {
        const parsed: unknown = JSON.parse(body);
        return typeof parsed === 'object' &&
            parsed !== null &&
            'search' in parsed &&
            typeof parsed.search === 'string'
            ? parsed.search
            : '';
    } catch {
        return '';
    }
};

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

const respond = async (props: LightdashApiProps): Promise<unknown> => {
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
        await delay(300);
        if (fieldId === FAILING_FIELD_ID) throw warehouseError;
        const search = readSearch(props.body).toLowerCase();
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

export const MAPPED_TILE_COUNT = 8;

/** The tiles "Choose tiles" maps a new control to, all on one field. */
export const getMappedTileTargets = (
    field: FilterableDimension,
): DashboardFilterRule['tileTargets'] =>
    Object.fromEntries(
        Array.from({ length: MAPPED_TILE_COUNT }, (_, index) => [
            `tile-${index + 1}`,
            { fieldId: getItemId(field), tableName: field.table },
        ]),
    );
