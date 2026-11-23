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
    ATTIO_EXPLORES,
    ATTIO_LEGACY_RECORDS,
    ATTIO_MAX_RECORDS,
    ATTIO_SCANNED_MODELS,
    getAttioLegacyObject,
    readAttioAttributes,
    toAttioObject,
    toAttioRequestObject,
    withAttioAttributeFields,
} from './explores';

const LEGACY_SETTINGS = {
    connector: ApiConnectorType.ATTIO,
    object: 'companies',
} as const;

const DEALS_EXPLORE = ATTIO_EXPLORES.find(({ name }) => name === 'deals')!;

const DEFINITION = withAttioAttributeFields(
    DEALS_EXPLORE,
    ATTIO_DEAL_ATTRIBUTES,
);

const DEALS = buildLiveExplore({
    definition: DEFINITION,
    exploreName: 'attio_deals',
    label: 'Attio deals',
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.ATTIO,
    baseVersion: 1,
    capabilities: attioIntegration.capabilities,
    warehouseSqlBuilder: warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
    ),
});

const field = (name: string) => `attio_deals_${name}`;

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
            'name name',
            'stage stage.status',
            'stage__entered_at stage.active_from',
            'value value.currency_value',
            'probability probability',
            'close_date close_date',
            'is_won is_won',
            'categories categories.option',
            'owner owner.referenced_actor_id',
            'owner__name owner.member_name',
            'associated_company associated_company.target_record_id',
            'point_of_contact point_of_contact.full_name',
            'contact_email contact_email.email_address',
            // A slug an old built-in field used keeps a prefix
            'attribute_count count',
            // So does one that could collide with a derived field
            'attribute_stage__entered_at stage__entered_at',
            // Other double underscores keep their name
            'arr__usd arr__usd',
        ]);
    });

    it('labels derived fields after their attribute', () => {
        const byName = new Map(
            DEFINITION.dimensions.map((dimension) => [
                dimension.name,
                dimension,
            ]),
        );
        expect(byName.get('stage__entered_at')).toMatchObject({
            label: 'Deal stage entered at',
            type: 'timestamp',
            filterOperators: [],
        });
        expect(byName.get('owner__name')).toMatchObject({
            label: 'Deal owner name',
            type: 'string',
            filterOperators: [],
        });
    });

    it('adds no metrics', () => {
        expect(names('metrics')).toEqual([]);
    });

    it('keeps record and member ids out of the default field list', () => {
        expect(isInternalAttioField('owner.referenced_actor_id')).toBe(true);
        expect(
            isInternalAttioField('associated_company.target_record_id'),
        ).toBe(true);
        expect(isInternalAttioField('stage.status')).toBe(false);
        expect(isInternalAttioField('owner.member_name')).toBe(false);
    });

    it('adds nothing from an attribute list it cannot read', () => {
        expect(withAttioAttributeFields(DEALS_EXPLORE, { data: 'x' })).toBe(
            DEALS_EXPLORE,
        );
    });
});

describe('Attio explores', () => {
    it('has one explore per standard object, companies first', () => {
        expect(ATTIO_EXPLORES.map(({ name, label }) => [name, label])).toEqual([
            ['companies', 'Companies'],
            ['people', 'People'],
            ['deals', 'Deals'],
            ['users', 'Users'],
            ['workspaces', 'Workspaces'],
        ]);
        expect(ATTIO_SCANNED_MODELS).toEqual([
            'people',
            'deals',
            'users',
            'workspaces',
        ]);
        expect(attioIntegration.explores).toBe(ATTIO_EXPLORES);
    });

    it('reads each object from its explore name', () => {
        expect(toAttioObject('people')).toBe('people');
        expect(() => toAttioObject('tickets')).toThrow(
            "Refresh the source's fields",
        );
    });

    it("leaves a legacy records table's object to its source", () => {
        expect(toAttioRequestObject('people')).toBe('people');
        expect(toAttioRequestObject(ATTIO_LEGACY_RECORDS)).toBeUndefined();
        // A stored legacy source keeps its object when its settings are read
        expect(attioIntegration.settings.parse(LEGACY_SETTINGS)).toEqual(
            LEGACY_SETTINGS,
        );
        expect(getAttioLegacyObject(LEGACY_SETTINGS)).toBe('companies');
        expect(
            getAttioLegacyObject({
                ...LEGACY_SETTINGS,
                object: '0b7e8a3c-1d2f-4a5b-9c6d-7e8f9a0b1c2d',
            }),
        ).toBe('0b7e8a3c-1d2f-4a5b-9c6d-7e8f9a0b1c2d');
        expect(
            getAttioLegacyObject({ connector: ApiConnectorType.ATTIO }),
        ).toBeUndefined();
        // Never a path of its own
        expect(
            getAttioLegacyObject({ ...LEGACY_SETTINGS, object: '../lists' }),
        ).toBeUndefined();
    });

    it("reads one object's attributes from a scan, and none from anything else", () => {
        const scanned = { deals: ATTIO_DEAL_ATTRIBUTES };
        expect(readAttioAttributes(scanned, 'deals')).toBe(
            ATTIO_DEAL_ATTRIBUTES,
        );
        expect(readAttioAttributes(scanned, 'people')).toBeUndefined();
        expect(readAttioAttributes(null, 'deals')).toBeUndefined();
        // A scan from before objects had their own explores
        expect(
            readAttioAttributes(ATTIO_DEAL_ATTRIBUTES, 'deals'),
        ).toBeUndefined();
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
                object: 'deals',
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

    it("names no object on a legacy records table, so it reads its source's own", () => {
        const legacy = buildLiveExplore({
            definition: { ...DEALS_EXPLORE, name: ATTIO_LEGACY_RECORDS },
            exploreName: 'attio_records',
            label: 'Attio',
            connectionUuid: 'connection-uuid',
            integration: ApiConnectorType.ATTIO,
            baseVersion: 1,
            capabilities: attioIntegration.capabilities,
            warehouseSqlBuilder: warehouseSqlBuilderFromType(
                SupportedDbtAdapter.DUCKDB,
            ),
        });
        const { query: request } = compileAttioQuery({
            explore: legacy,
            metricQuery: query({
                exploreName: legacy.name,
                dimensions: ['attio_records_record_id'],
            }),
            today: '2026-11-17',
        });
        expect(JSON.parse(request)).toEqual({ columns: ['record_id'] });
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
            request: { object: 'deals', columns: ['name'] },
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
                dimensions: [field('name'), field('stage')],
                sorts: [{ fieldId: field('stage'), descending: true }],
                limit: 10,
            }),
            timezone: 'UTC',
            now: new Date('2026-11-17T12:00:00Z'),
        });
        expect(compiled.requestLimit).toBe(ATTIO_MAX_RECORDS);
        expect(compiled.fieldIdsByColumn).toEqual({
            name: field('name'),
            'stage.status': field('stage'),
        });
    });
});
