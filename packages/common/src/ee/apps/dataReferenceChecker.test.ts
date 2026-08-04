import { describe, expect, it } from 'vitest';
import { type CompiledDimension, type CompiledMetric } from '../../types/field';
import { ValidationErrorType } from '../../types/validation';
import {
    buildDataAppExploreIndexFromExplores,
    buildDataAppExploreIndexFromModelFiles,
    checkDataAppDataReferences,
    type DataAppExploreIndex,
} from './dataReferenceChecker';
import {
    type ExtractedGlobalFilterReference,
    type ExtractedQueryReference,
    type ExtractedSavedChartReference,
} from './dataReferences';

// getItemId only reads table+name; the rest of the compiled shape is irrelevant here.
const dim = (table: string, name: string) =>
    ({ table, name }) as CompiledDimension;
const met = (table: string, name: string) =>
    ({ table, name }) as CompiledMetric;
type ExploreInput = Parameters<typeof buildDataAppExploreIndexFromExplores>[0];

const compiledExplores = [
    {
        name: 'orders',
        tables: {
            orders: {
                dimensions: {
                    customer_segment: dim('orders', 'customer_segment'),
                    region: dim('orders', 'region'),
                    order_date_month: dim('orders', 'order_date_month'),
                    status: dim('orders', 'status'),
                },
                metrics: {
                    total_revenue: met('orders', 'total_revenue'),
                    order_count: met('orders', 'order_count'),
                },
            },
            customers: {
                dimensions: {
                    name: dim('customers', 'name'),
                    segment: dim('customers', 'segment'),
                },
                metrics: {
                    customer_count: met('customers', 'customer_count'),
                },
            },
        },
    },
    {
        name: 'customers',
        tables: {
            customers: {
                dimensions: {
                    name: dim('customers', 'name'),
                    segment: dim('customers', 'segment'),
                },
                metrics: {
                    customer_count: met('customers', 'customer_count'),
                },
            },
        },
    },
] as unknown as ExploreInput;

const modelFiles = [
    {
        path: '.lightdash/context/models/_index.md',
        content: '# Semantic layer — 2 models\n',
    },
    {
        path: '.lightdash/context/models/orders.yml',
        content: [
            'models:',
            '  - name: orders',
            '    meta:',
            '      metrics:',
            '        total_revenue:',
            '          type: sum',
            '        order_count:',
            '          type: count',
            '      joins:',
            '        - join: customers',
            '    columns:',
            '      - name: customer_segment',
            '      - name: region',
            '      - name: order_date_month',
        ].join('\n'),
    },
    {
        path: '.lightdash/context/models/orders.part2.yml',
        content: [
            'models:',
            '  - name: orders',
            '    columns:',
            '      - name: status',
        ].join('\n'),
    },
    {
        path: '.lightdash/context/models/customers.yml',
        content: [
            'models:',
            '  - name: customers',
            '    meta:',
            '      metrics:',
            '        customer_count:',
            '          type: count_distinct',
            '    columns:',
            '      - name: name',
            '      - name: segment',
        ].join('\n'),
    },
];

const queryRef = (
    overrides: Partial<ExtractedQueryReference> & {
        explore: string | null;
    },
): ExtractedQueryReference => ({
    kind: 'query',
    dimensions: [],
    metrics: [],
    filterFields: [],
    sortFields: [],
    parameterKeys: [],
    localFields: [],
    unresolved: [],
    location: { path: 'src/App.tsx', line: 10, column: 5 },
    ...overrides,
});

const indexes: [string, DataAppExploreIndex][] = [
    [
        'compiled explores',
        buildDataAppExploreIndexFromExplores(compiledExplores),
    ],
    ['model files', buildDataAppExploreIndexFromModelFiles(modelFiles)],
];

describe.each(indexes)('checkDataAppDataReferences (%s)', (_, index) => {
    it('accepts a valid query including joined-table dot refs and explore-prefixed refs', () => {
        const errors = checkDataAppDataReferences(
            [
                queryRef({
                    explore: 'orders',
                    dimensions: [
                        'customer_segment',
                        'orders_region', // SDK passes explore-prefixed refs through unchanged
                        'customers.name', // joined table via dot notation
                    ],
                    metrics: ['total_revenue', 'customers.customer_count'],
                    filterFields: ['status'],
                    sortFields: ['order_date_month', 'total_revenue'],
                }),
            ],
            index,
        );
        expect(errors).toEqual([]);
    });

    it('reports a missing explore with a close-name suggestion', () => {
        const errors = checkDataAppDataReferences(
            [queryRef({ explore: 'ordrs', dimensions: ['region'] })],
            index,
        );
        expect(errors).toEqual([
            expect.objectContaining({
                errorType: ValidationErrorType.Model,
                error: "Explore 'ordrs' does not exist — did you mean 'orders'?",
                modelName: 'ordrs',
                fieldName: null,
            }),
        ]);
    });

    it('reports missing fields per role with the matching error type', () => {
        const errors = checkDataAppDataReferences(
            [
                queryRef({
                    explore: 'orders',
                    dimensions: ['customer_segmnet'],
                    metrics: ['total_revenu'],
                    filterFields: ['customers.nope'],
                    sortFields: ['missing_sort_field'],
                }),
            ],
            index,
        );
        expect(errors).toEqual([
            expect.objectContaining({
                errorType: ValidationErrorType.Dimension,
                error: "Dimension 'customer_segmnet' not found in explore 'orders' — did you mean 'customer_segment'?",
            }),
            expect.objectContaining({
                errorType: ValidationErrorType.Metric,
                error: "Metric 'total_revenu' not found in explore 'orders' — did you mean 'total_revenue'?",
            }),
            expect.objectContaining({
                errorType: ValidationErrorType.Filter,
                fieldName: 'customers.nope',
            }),
            expect.objectContaining({
                errorType: ValidationErrorType.Sorting,
                fieldName: 'missing_sort_field',
            }),
        ]);
    });

    it('omits the suggestion when nothing is within edit distance 2', () => {
        const errors = checkDataAppDataReferences(
            [queryRef({ explore: 'orders', dimensions: ['zzzzzzzzz'] })],
            index,
        );
        expect(errors[0].error).toBe(
            "Dimension 'zzzzzzzzz' not found in explore 'orders'",
        );
    });

    it('flags kind mix-ups in both directions', () => {
        const errors = checkDataAppDataReferences(
            [
                queryRef({
                    explore: 'orders',
                    dimensions: ['total_revenue'],
                    metrics: ['region'],
                }),
            ],
            index,
        );
        expect(errors).toEqual([
            expect.objectContaining({
                errorType: ValidationErrorType.Dimension,
                error: "'total_revenue' is a metric, not a dimension — select it with .metrics()",
            }),
            expect.objectContaining({
                errorType: ValidationErrorType.Metric,
                error: "'region' is a dimension, not a metric — select it with .dimensions()",
            }),
        ]);
    });

    it('skips locally defined fields, including additional metrics selected by bare name', () => {
        const errors = checkDataAppDataReferences(
            [
                queryRef({
                    explore: 'orders',
                    dimensions: ['region'],
                    metrics: ['my_custom_metric'],
                    sortFields: ['my_table_calc'],
                    localFields: ['my_custom_metric', 'my_table_calc'],
                }),
            ],
            index,
        );
        expect(errors).toEqual([]);
    });

    it('suppresses field checks when local definitions are unresolved, but still checks the explore', () => {
        const errors = checkDataAppDataReferences(
            [
                queryRef({
                    explore: 'orders',
                    dimensions: ['definitely_missing'],
                    unresolved: ['localFields'],
                }),
                queryRef({
                    explore: 'nope',
                    unresolved: ['localFields'],
                }),
            ],
            index,
        );
        expect(errors).toEqual([
            expect.objectContaining({
                errorType: ValidationErrorType.Model,
                modelName: 'nope',
            }),
        ]);
    });

    it('still checks resolved entries when a field list is marked incomplete', () => {
        const errors = checkDataAppDataReferences(
            [
                queryRef({
                    explore: 'orders',
                    dimensions: ['customer_segmnet'],
                    unresolved: ['dimensions'],
                }),
            ],
            index,
        );
        expect(errors).toHaveLength(1);
        expect(errors[0].errorType).toBe(ValidationErrorType.Dimension);
    });

    it('checks only dot refs when the explore is unknown', () => {
        const errors = checkDataAppDataReferences(
            [
                queryRef({
                    explore: null,
                    unresolved: ['explore'],
                    dimensions: [
                        'region', // bare ref: cannot qualify without the explore
                        'customers.name', // exists
                        'customers.nope', // exists nowhere → broken in every explore
                    ],
                }),
            ],
            index,
        );
        expect(errors).toEqual([
            expect.objectContaining({
                errorType: ValidationErrorType.Dimension,
                error: "Dimension 'customers.nope' not found in any explore",
                modelName: null,
            }),
        ]);
    });

    it('checks saved-chart filter fields verbatim against all explores', () => {
        const savedChart: ExtractedSavedChartReference = {
            kind: 'savedChart',
            chartUuid: 'chart-1',
            filterFields: [
                'orders_status', // valid full id
                'orders.status', // sent verbatim by the SDK, so a dotted ref matches nothing
            ],
            unresolved: [],
            location: { path: 'src/App.tsx', line: 3, column: 1 },
        };
        const errors = checkDataAppDataReferences([savedChart], index);
        expect(errors).toEqual([
            expect.objectContaining({
                errorType: ValidationErrorType.Filter,
                error: "Filter field 'orders.status' does not exist in any explore — did you mean 'orders_status'?",
            }),
        ]);
    });

    it('validates global filter fields against their explore', () => {
        const base: Omit<ExtractedGlobalFilterReference, 'field'> = {
            kind: 'globalFilter',
            explore: 'orders',
            unresolved: [],
            location: { path: 'src/lib/filters.tsx', line: 7, column: 9 },
        };
        const errors = checkDataAppDataReferences(
            [
                { ...base, field: 'region' },
                { ...base, field: 'regoin' },
            ],
            index,
        );
        expect(errors).toEqual([
            expect.objectContaining({
                errorType: ValidationErrorType.Filter,
                error: "Global filter field 'regoin' not found in explore 'orders' — did you mean 'region'?",
            }),
        ]);
    });
});

describe('buildDataAppExploreIndexFromModelFiles', () => {
    it('merges .partN.yml overflow files into their model', () => {
        const index = buildDataAppExploreIndexFromModelFiles(modelFiles);
        expect(index.explores.get('orders')?.dimensionIds).toContain(
            'orders_status',
        );
    });

    it('skips YAML files without a models root', () => {
        const index = buildDataAppExploreIndexFromModelFiles([
            ...modelFiles,
            {
                path: '.lightdash/context/parameters.yml',
                content: 'parameters:\n  season:\n    default: 2026\n',
            },
        ]);
        expect([...index.explores.keys()].sort()).toEqual([
            'customers',
            'orders',
        ]);
    });

    it('throws on an unparseable model file instead of dropping it', () => {
        expect(() =>
            buildDataAppExploreIndexFromModelFiles([
                {
                    path: '.lightdash/context/models/broken.yml',
                    content: 'models:\n  - name: [unclosed',
                },
            ]),
        ).toThrow(/broken\.yml/);
    });

    it('throws when no models are found at all', () => {
        expect(() =>
            buildDataAppExploreIndexFromModelFiles([
                { path: 'models/_index.md', content: '# empty' },
            ]),
        ).toThrow(/no models found/);
    });
});
