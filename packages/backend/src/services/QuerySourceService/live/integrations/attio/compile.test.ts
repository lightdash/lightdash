import {
    ApiConnectorType,
    FilterOperator,
    getApiSourceQueryIssues,
    getItemMap,
    SupportedDbtAdapter,
    UnitOfTime,
    type FilterGroup,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { attioIntegration } from '.';
import { compileLiveMetricQuery } from '../../explores/build';
import { buildLiveExplore } from '../../explores/definition';
import { ATTIO_DEAL_ATTRIBUTES } from './attio.fixtures';
import { isInternalAttioField } from './attributes';
import { compileAttioQuery } from './compile';
import {
    ATTIO_MAX_RECORDS,
    ATTIO_RECORDS_EXPLORE,
    withAttioAttributeFields,
} from './explores';

const DEFINITION = withAttioAttributeFields(
    ATTIO_RECORDS_EXPLORE,
    ATTIO_DEAL_ATTRIBUTES,
);

const DEALS = buildLiveExplore({
    definition: DEFINITION,
    exploreName: 'attio_records',
    label: 'Attio deals',
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.ATTIO,
    baseVersion: 1,
    capabilities: attioIntegration.capabilities,
    warehouseSqlBuilder: warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
    ),
});

const field = (name: string) => `attio_records_${name}`;

const rule = (
    name: string,
    operator: FilterOperator,
    values: unknown[],
    settings?: FilterRule['settings'],
): FilterRule => ({
    id: `${name}-${operator}-${values.join(',')}`,
    target: { fieldId: field(name) },
    operator,
    values,
    ...(settings ? { settings } : {}),
});

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: DEALS.name,
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    ...overrides,
});

const compile = (metricQuery: MetricQuery) => {
    const { query: request, localSorts } = compileAttioQuery({
        explore: DEALS,
        metricQuery,
        today: '2026-11-17',
    });
    return { request: JSON.parse(request), localSorts };
};

const filterBy = (group: FilterGroup) =>
    compile(
        query({
            dimensions: [field('name')],
            filters: { dimensions: group },
        }),
    ).request.filter;

describe('Attio scanned fields', () => {
    const names = (kind: 'dimensions' | 'metrics') =>
        DEFINITION[kind].map(({ name, apiName }) => `${name} ${apiName}`);

    it('adds a dimension per attribute, reading the property each type keeps its value in', () => {
        expect(names('dimensions')).toEqual([
            'record_id record_id',
            'web_url web_url',
            'created_at created_at',
            'created_at_week created_at_week',
            'created_at_month created_at_month',
            'created_at_year created_at_year',
            'name name',
            'stage stage.status',
            'value value.currency_value',
            'probability probability',
            'close_date close_date',
            'is_won is_won',
            'categories categories.option',
            'owner owner.referenced_actor_id',
            'associated_company associated_company.target_record_id',
            'point_of_contact point_of_contact.full_name',
            'contact_email contact_email.email_address',
            // A slug a built-in field already uses keeps a prefix
            'attribute_count count',
        ]);
    });

    it('totals number and currency attributes', () => {
        expect(names('metrics')).toEqual([
            'count count',
            'total_value total:value.currency_value',
            'total_probability total:probability',
            'total_count total:count',
        ]);
    });

    it('keeps record and member ids out of the default field list', () => {
        expect(isInternalAttioField('owner.referenced_actor_id')).toBe(true);
        expect(
            isInternalAttioField('associated_company.target_record_id'),
        ).toBe(true);
        expect(isInternalAttioField('stage.status')).toBe(false);
    });

    it('adds nothing from an attribute list it cannot read', () => {
        expect(
            withAttioAttributeFields(ATTIO_RECORDS_EXPLORE, { data: 'x' }),
        ).toBe(ATTIO_RECORDS_EXPLORE);
    });
});

describe('compileAttioQuery', () => {
    it('lists the selected columns, sorted by Attio', () => {
        expect(
            compile(
                query({
                    dimensions: [field('name'), field('value')],
                    sorts: [{ fieldId: field('value'), descending: true }],
                }),
            ),
        ).toEqual({
            request: {
                columns: ['name', 'value.currency_value'],
                sorts: [
                    {
                        attribute: 'value',
                        field: 'currency_value',
                        direction: 'desc',
                    },
                ],
            },
            localSorts: [],
        });
    });

    it('sorts by created_at as the record attribute', () => {
        expect(
            compile(
                query({
                    dimensions: [field('created_at')],
                    sorts: [
                        { fieldId: field('created_at'), descending: false },
                    ],
                }),
            ).request.sorts,
        ).toEqual([{ attribute: 'created_at', direction: 'asc' }]);
    });

    it('sorts every column itself when Attio cannot sort one of them', () => {
        const sorts = [
            { fieldId: field('name'), descending: false },
            { fieldId: field('stage'), descending: false },
        ];
        expect(compile(query({ dimensions: [field('name')], sorts }))).toEqual({
            request: { columns: ['name'] },
            localSorts: sorts,
        });
    });

    it('groups count and totals by the dimensions, sorting them itself', () => {
        const sorts = [{ fieldId: field('count'), descending: true }];
        expect(
            compile(
                query({
                    dimensions: [field('stage'), field('created_at_month')],
                    metrics: [field('count'), field('total_value')],
                    sorts,
                }),
            ),
        ).toEqual({
            request: {
                columns: [
                    'stage.status',
                    'created_at_month',
                    'count',
                    'total:value.currency_value',
                ],
            },
            localSorts: sorts,
        });
    });

    it('filters text and names by their property, several values with $or', () => {
        expect(
            filterBy({
                id: 'root',
                and: [
                    rule('name', FilterOperator.INCLUDE, ['acme', 'globex']),
                    rule('point_of_contact', FilterOperator.STARTS_WITH, [
                        'Ada',
                    ]),
                    rule('contact_email', FilterOperator.NOT_EQUALS, [
                        'x@example.com',
                    ]),
                ],
            }),
        ).toEqual({
            $and: [
                {
                    $or: [
                        { name: { $contains: 'acme' } },
                        { name: { $contains: 'globex' } },
                    ],
                },
                { point_of_contact: { full_name: { $starts_with: 'Ada' } } },
                {
                    $not: {
                        contact_email: {
                            email_address: { $eq: 'x@example.com' },
                        },
                    },
                },
            ],
        });
    });

    it('matches statuses and select options by title', () => {
        expect(
            filterBy({
                id: 'root',
                and: [
                    rule('stage', FilterOperator.EQUALS, ['Won', 'Lost']),
                    rule('categories', FilterOperator.NOT_EQUALS, ['SMB']),
                ],
            }),
        ).toEqual({
            $and: [
                { $or: [{ stage: 'Won' }, { stage: 'Lost' }] },
                { $not: { categories: 'SMB' } },
            ],
        });
    });

    it('filters numbers, currencies and checkboxes', () => {
        expect(
            filterBy({
                id: 'root',
                and: [
                    rule('value', FilterOperator.GREATER_THAN_OR_EQUAL, [
                        '500',
                    ]),
                    rule('probability', FilterOperator.IN_BETWEEN, [0.2, 0.8]),
                    rule('is_won', FilterOperator.EQUALS, [true]),
                ],
            }),
        ).toEqual({
            $and: [
                { value: { currency_value: { $gte: 500 } } },
                { probability: { $gte: 0.2, $lte: 0.8 } },
                { is_won: { $eq: true } },
            ],
        });
    });

    it('refuses a number filter that is not a number', () => {
        expect(() =>
            filterBy({
                id: 'root',
                and: [rule('value', FilterOperator.LESS_THAN, ['lots'])],
            }),
        ).toThrow('must be a number');
    });

    it('filters dates as whole UTC days, and created_at as a timestamp', () => {
        expect(
            filterBy({
                id: 'root',
                and: [
                    rule('close_date', FilterOperator.IN_BETWEEN, [
                        '2026-12-01',
                        '2026-12-31',
                    ]),
                    rule('created_at', FilterOperator.IN_THE_PAST, [7], {
                        unitOfTime: UnitOfTime.days,
                        completed: false,
                    }),
                ],
            }),
        ).toEqual({
            $and: [
                { close_date: { $gte: '2026-12-01', $lt: '2027-01-01' } },
                {
                    created_at: {
                        $gte: '2026-11-10T00:00:00.000Z',
                        $lt: '2026-11-18T00:00:00.000Z',
                    },
                },
            ],
        });
    });

    it('leaves the far side of a one-sided date filter open, so future dates match', () => {
        expect(
            filterBy({
                id: 'root',
                and: [
                    rule('close_date', FilterOperator.GREATER_THAN, [
                        '2026-12-01',
                    ]),
                    rule('created_at', FilterOperator.LESS_THAN_OR_EQUAL, [
                        '2026-01-31',
                    ]),
                ],
            }),
        ).toEqual({
            $and: [
                { close_date: { $gte: '2026-12-02' } },
                { created_at: { $lt: '2026-02-01T00:00:00.000Z' } },
            ],
        });
    });

    it('keeps OR groups and nested groups', () => {
        const group: FilterGroup = {
            id: 'root',
            or: [
                rule('stage', FilterOperator.EQUALS, ['Won']),
                {
                    id: 'nested',
                    and: [
                        rule('is_won', FilterOperator.EQUALS, [false]),
                        rule('value', FilterOperator.GREATER_THAN, [1000]),
                        {
                            ...rule('name', FilterOperator.EQUALS, ['x']),
                            disabled: true,
                        },
                    ],
                },
            ],
        };
        expect(
            getApiSourceQueryIssues(
                DEALS.apiSource!,
                query({
                    dimensions: [field('name')],
                    filters: { dimensions: group },
                }),
                { itemsMap: getItemMap(DEALS) },
            ),
        ).toEqual([]);
        expect(filterBy(group)).toEqual({
            $or: [
                { stage: 'Won' },
                {
                    $and: [
                        { is_won: { $eq: false } },
                        { value: { currency_value: { $gt: 1000 } } },
                    ],
                },
            ],
        });
    });

    it('reads every matching record when the rows are sorted here', () => {
        const compiled = compileLiveMetricQuery({
            explore: DEALS,
            metricQuery: query({
                dimensions: [field('stage')],
                metrics: [field('count')],
                sorts: [{ fieldId: field('count'), descending: true }],
                limit: 10,
            }),
            timezone: 'UTC',
            now: new Date('2026-11-17T12:00:00Z'),
        });
        expect(compiled.requestLimit).toBe(ATTIO_MAX_RECORDS);
        expect(compiled.fieldIdsByColumn).toEqual({
            'stage.status': field('stage'),
            count: field('count'),
        });
    });
});
