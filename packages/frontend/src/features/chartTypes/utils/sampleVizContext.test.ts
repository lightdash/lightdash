import {
    getDataAppVizFieldIds,
    type DataAppVizSchema,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildSampleVizContext } from './sampleVizContext';

const baseSchema: DataAppVizSchema = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: true,
        },
        { name: 'split', label: 'Split', type: 'series', required: false },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [
        {
            type: 'boolean',
            name: 'showLegend',
            label: 'Show legend',
            default: true,
        },
    ],
    colorPalette: null,
};

describe.each(['metric', 'column'] as const)('%s sample values', (type) => {
    it('resolves per-field defaults for the fabricated binding', () => {
        const context = buildSampleVizContext({
            ...baseSchema,
            fields: baseSchema.fields.map((field) =>
                field.name === 'value'
                    ? {
                          ...field,
                          configOptions: [
                              {
                                  type: 'color',
                                  name: 'color',
                                  label: 'Color',
                                  default: '#ff0000',
                              },
                          ],
                      }
                    : field,
            ),
        });
        expect(context.fieldOptions).toEqual({
            value: { sample_value: { color: '#ff0000' } },
        });
    });
    const schema: DataAppVizSchema = {
        ...baseSchema,
        fields: baseSchema.fields.map((field) =>
            field.type === 'metric' ? { ...field, type } : field,
        ),
    };
    const flatSchema: DataAppVizSchema = {
        ...schema,
        fields: schema.fields.filter((f) => f.type !== 'series'),
    };
    it('maps every declared field, required or not', () => {
        const context = buildSampleVizContext(schema);

        expect(Object.keys(context.fieldMapping)).toEqual([
            'category',
            'split',
            'value',
        ]);
    });

    it('resolves options to their declared defaults', () => {
        const context = buildSampleVizContext(schema);

        expect(context.options).toEqual({ showLegend: true });
    });

    it('is deterministic', () => {
        expect(buildSampleVizContext(schema)).toEqual(
            buildSampleVizContext(schema),
        );
    });

    it('uses one labeled sample column while preserving a multiple binding', () => {
        const context = buildSampleVizContext({
            ...flatSchema,
            fields: flatSchema.fields.map((field) =>
                field.name === 'value' ? { ...field, multiple: true } : field,
            ),
        });

        expect(context.fieldMapping.value).toEqual(['sample_value']);
        expect(context.fields.sample_value.label).toBe('Value');
        expect(Object.keys(context.rows[0])).toEqual([
            'sample_category',
            'sample_value',
        ]);
    });

    it('includes single and multiple column slots in sample rows', () => {
        const context = buildSampleVizContext({
            ...flatSchema,
            fields: [
                {
                    name: 'column',
                    label: 'Column',
                    type: 'column',
                    required: true,
                },
                {
                    name: 'columns',
                    label: 'Columns',
                    type: 'column',
                    required: true,
                    multiple: true,
                },
            ],
        });

        for (const id of Object.values(context.fieldMapping).flatMap(
            getDataAppVizFieldIds,
        )) {
            expect(context.rows[0][id]).toBeDefined();
        }
    });

    it.each([false, true])(
        'keeps generated columns unique when a scalar slot uses a multiple slot suffix (series: %s)',
        (withSeries) => {
            const source = withSeries ? schema : flatSchema;
            const value = source.fields.find((field) => field.name === 'value');
            if (!value) throw new Error('Missing value field');
            const context = buildSampleVizContext({
                ...source,
                fields: [
                    ...source.fields.map((field) =>
                        field.name === 'value'
                            ? { ...field, multiple: true }
                            : field,
                    ),
                    { ...value, name: 'value_1', label: 'Other value' },
                ],
            });
            const mappedIds = Object.values(context.fieldMapping).flatMap(
                getDataAppVizFieldIds,
            );

            expect(new Set(mappedIds).size).toBe(mappedIds.length);
            expect(context.fieldMapping.value_1).toBe('sample_value_1');
            expect(
                getDataAppVizFieldIds(context.fieldMapping.value),
            ).not.toContain('sample_value_1');
            if (withSeries) {
                expect(
                    Object.keys(context.pivotDetails?.originalColumns ?? {}),
                ).toEqual(expect.arrayContaining(mappedIds));
                const pivotColumns =
                    context.pivotDetails?.valuesColumns.map(
                        ({ pivotColumnName }) => pivotColumnName,
                    ) ?? [];
                expect(new Set(pivotColumns).size).toBe(pivotColumns.length);
                expect(Object.keys(context.rows[0])).toEqual(
                    expect.arrayContaining(pivotColumns),
                );
            } else {
                expect(Object.keys(context.rows[0])).toEqual(
                    expect.arrayContaining(mappedIds),
                );
            }
        },
    );

    describe('without a series field', () => {
        it('leaves the rows flat', () => {
            const context = buildSampleVizContext(flatSchema);

            expect(context.pivotDetails).toBeNull();
            expect(context.rows.length).toBe(12);
        });

        it('writes a cell for every mapped column in every row', () => {
            const context = buildSampleVizContext(flatSchema);

            for (const row of context.rows) {
                for (const columnId of Object.values(
                    context.fieldMapping,
                ).flatMap(getDataAppVizFieldIds)) {
                    expect(row[columnId].value.raw).toBeDefined();
                    expect(row[columnId].value.formatted).not.toBe('');
                }
            }
        });

        it('gives dimensions date raw values with display-formatted labels', () => {
            const context = buildSampleVizContext(flatSchema);
            const [columnId] = getDataAppVizFieldIds(
                context.fieldMapping.category,
            );

            for (const row of context.rows) {
                const { raw, formatted } = row[columnId].value;
                expect(Number.isNaN(Date.parse(String(raw)))).toBe(false);
                expect(formatted).not.toBe(String(raw));
            }
        });
    });

    describe('with a series field', () => {
        it('counts pivot groups independently of separately declared metrics', () => {
            const context = buildSampleVizContext({
                ...schema,
                fields: [
                    ...schema.fields,
                    {
                        name: 'second',
                        label: 'Second measure',
                        type,
                        required: true,
                    },
                    {
                        name: 'third',
                        label: 'Third measure',
                        type,
                        required: true,
                    },
                ],
            });

            expect(context.pivotDetails?.valuesColumns).toHaveLength(9);
            expect(context.pivotDetails?.totalColumnCount).toBe(3);
        });

        it('pivots the metric into one column per series value', () => {
            const context = buildSampleVizContext(schema);

            expect(context.pivotDetails?.valuesColumns).toEqual([
                expect.objectContaining({
                    referenceField: 'sample_value',
                    pivotColumnName: 'sample_value_any_Series A',
                    pivotValues: [
                        {
                            referenceField: 'sample_split',
                            value: 'Series A',
                            formatted: 'Series A',
                        },
                    ],
                }),
                expect.objectContaining({
                    pivotColumnName: 'sample_value_any_Series B',
                }),
                expect.objectContaining({
                    pivotColumnName: 'sample_value_any_Series C',
                }),
            ]);
        });

        it('indexes rows on the dimension and keys metrics by pivot column', () => {
            const { rows, pivotDetails } = buildSampleVizContext(schema);

            expect(pivotDetails).not.toBeNull();
            if (!pivotDetails) return;
            const pivotColumnNames = pivotDetails.valuesColumns.map(
                ({ pivotColumnName }) => pivotColumnName,
            );

            // One row per category, not one per category × series value.
            expect(rows.length).toBe(12);
            for (const row of rows) {
                expect(Object.keys(row).sort()).toEqual(
                    ['sample_category', ...pivotColumnNames].sort(),
                );
                for (const columnName of pivotColumnNames) {
                    expect(typeof row[columnName].value.raw).toBe('number');
                }
            }
        });

        it('declares the dimension as the index and the series as the pivot column', () => {
            const context = buildSampleVizContext(schema);

            expect(context.pivotDetails?.indexColumn).toEqual([
                { reference: 'sample_category', type: 'time' },
            ]);
            expect(context.pivotDetails?.groupByColumns).toEqual([
                { reference: 'sample_split' },
            ]);
        });

        it('describes the unpivoted columns behind the pivot', () => {
            const context = buildSampleVizContext(schema);

            expect(context.pivotDetails?.originalColumns).toEqual({
                sample_category: {
                    reference: 'sample_category',
                    type: 'date',
                    label: 'Category',
                },
                sample_split: {
                    reference: 'sample_split',
                    type: 'string',
                    label: 'Split',
                },
                sample_value: {
                    reference: 'sample_value',
                    type: 'number',
                    label: 'Value',
                },
            });
        });

        it('stays flat when there is no value field to spread', () => {
            const context = buildSampleVizContext({
                ...schema,
                fields: schema.fields.filter((f) => f.name !== 'value'),
            });

            expect(context.pivotDetails).toBeNull();
        });
    });

    it('leaves host-resolved colors empty for synthetic rows', () => {
        const context = buildSampleVizContext(schema);

        expect(context.seriesColors).toEqual({});
        expect(context.valueColors).toEqual({});
    });
});

describe('mixed metric and column fields', () => {
    it.each([false, true])(
        'generates distinct numeric values (pivoted: %s)',
        (pivoted) => {
            const schema: DataAppVizSchema = {
                ...baseSchema,
                fields: [
                    ...baseSchema.fields.filter(
                        (field) => pivoted || field.type !== 'series',
                    ),
                    {
                        name: 'anyValue',
                        label: 'Any value',
                        type: 'column',
                        required: true,
                    },
                ],
            };
            const context = buildSampleVizContext(schema);
            const metricKey = pivoted
                ? 'sample_value_any_Series A'
                : 'sample_value';
            const columnKey = pivoted
                ? 'sample_anyValue_any_Series A'
                : 'sample_anyValue';

            for (const row of context.rows) {
                expect(typeof row[columnKey]?.value.raw).toBe('number');
                expect(row[columnKey].value.formatted).toBe(
                    String(row[columnKey].value.raw),
                );
                expect(row[columnKey].value.raw).not.toBe(
                    row[metricKey].value.raw,
                );
            }
        },
    );
});

describe('authored preview data', () => {
    it.each([false, true])(
        'maps authored rows to multiple-field inputs (series: %s)',
        (withSeries) => {
            const schema: DataAppVizSchema = {
                ...baseSchema,
                fields: baseSchema.fields.filter(
                    (field) => withSeries || field.type !== 'series',
                ),
            };
            const preview = {
                rows: [
                    {
                        category: 'North',
                        value: 30,
                        ...(withSeries ? { split: 'Retail' } : {}),
                    },
                ],
            };
            const context = buildSampleVizContext(
                {
                    ...schema,
                    fields: schema.fields.map((field) => ({
                        ...field,
                        multiple: true,
                    })),
                },
                undefined,
                {},
                preview,
            );
            const scalarContext = buildSampleVizContext(
                schema,
                undefined,
                {},
                preview,
            );

            expect(context.fieldMapping).toEqual(
                Object.fromEntries(
                    schema.fields.map((field) => [
                        field.name,
                        [`sample_${field.name}`],
                    ]),
                ),
            );
            expect(context.rows).toEqual(scalarContext.rows);
            expect(context.pivotDetails).toEqual(scalarContext.pivotDetails);
        },
    );

    it('uses field names and preserves primitive and null values', () => {
        const schema: DataAppVizSchema = {
            ...baseSchema,
            fields: [
                {
                    name: 'value',
                    label: 'Value',
                    type: 'column',
                    required: true,
                },
            ],
        };
        const context = buildSampleVizContext(
            schema,
            ['#123456'],
            {},
            {
                rows: [
                    { value: 75 },
                    { value: 'Ready' },
                    { value: false },
                    { value: null },
                ],
                optionValues: { showLegend: false },
            },
        );
        expect(context.rows.map((row) => row.sample_value.value)).toEqual([
            { raw: 75, formatted: '75' },
            { raw: 'Ready', formatted: 'Ready' },
            { raw: false, formatted: 'false' },
            { raw: null, formatted: '' },
        ]);
        expect(context.pivotDetails).toBeNull();
        expect(context.options).toEqual({ showLegend: false });
        expect(context.colorPalette).toEqual(['#123456']);
        expect(context.underlyingData.enabled).toBe(false);
    });

    it('merges demo options over defaults and explicit options over demo options', () => {
        const preview = { optionValues: { showLegend: false } };
        expect(
            buildSampleVizContext(baseSchema, undefined, {}, preview).options
                .showLegend,
        ).toBe(false);
        expect(
            buildSampleVizContext(
                baseSchema,
                undefined,
                { showLegend: true },
                preview,
            ).options.showLegend,
        ).toBe(true);
        expect(
            buildSampleVizContext(baseSchema, undefined, {}, preview).rows,
        ).toEqual(buildSampleVizContext(baseSchema).rows);
    });

    it('applies validated per-field preview overrides to the sample binding', () => {
        const schema: DataAppVizSchema = {
            ...baseSchema,
            fields: baseSchema.fields.map((field) =>
                field.name === 'value'
                    ? {
                          ...field,
                          configOptions: [
                              {
                                  type: 'color',
                                  name: 'color',
                                  label: 'Color',
                                  default: '#ff0000',
                              },
                          ],
                      }
                    : field,
            ),
        };

        const context = buildSampleVizContext(
            schema,
            undefined,
            {},
            {
                fieldOptionValues: {
                    value: { sample_value: { color: '#00ff00' } },
                },
            },
        );

        expect(context.fieldOptions).toEqual({
            value: { sample_value: { color: '#00ff00' } },
        });
    });

    it('resolves declared and preview gradient colors for sample values', () => {
        const gradient = {
            enabled: true,
            start: '#000000',
            end: '#ffffff',
            min: 'auto',
            max: 'auto',
        } as const;
        const schema: DataAppVizSchema = {
            ...baseSchema,
            fields: [
                {
                    name: 'value',
                    label: 'Value',
                    type: 'metric',
                    required: true,
                    colorOptions: { gradient },
                },
            ],
        };
        const context = buildSampleVizContext(
            schema,
            undefined,
            {},
            {
                rows: [{ value: 0 }, { value: 10 }],
                fieldColorValues: {
                    value: {
                        sample_value: {
                            gradient: { ...gradient, end: '#ff0000' },
                        },
                    },
                },
            },
        );

        expect(context.fieldColors).toEqual({
            value: { sample_value: { '0': '#000', '10': '#f00' } },
        });
    });

    it('pivots authored series, preserving sparse groups and column metadata', () => {
        const context = buildSampleVizContext(
            baseSchema,
            undefined,
            {},
            {
                rows: [
                    { category: 'North', split: 'Retail', value: 30 },
                    { category: 'North', split: 'Online', value: 45 },
                    { category: 'South', split: 'Retail', value: 20 },
                    { category: 'North', split: 'Retail', value: 99 },
                ],
            },
        );
        expect(context.rows).toHaveLength(2);
        expect(context.rows[0].sample_value_any_Retail.value.raw).toBe(30);
        expect(context.rows[0].sample_value_any_Online.value.raw).toBe(45);
        expect(context.rows[1].sample_value_any_Online.value.raw).toBeNull();
        expect(context.pivotDetails?.valuesColumns).toHaveLength(2);
        expect(context.pivotDetails?.indexColumn).toEqual([
            { reference: 'sample_category', type: 'category' },
        ]);
        expect(
            context.pivotDetails?.originalColumns?.sample_category.type,
        ).toBe('string');
    });

    it('uses null cells for omitted optional fields', () => {
        const context = buildSampleVizContext(
            {
                ...baseSchema,
                fields: baseSchema.fields.filter(
                    (field) => field.type !== 'metric',
                ),
            },
            undefined,
            {},
            {
                rows: [{ category: 'North' }],
            },
        );
        expect(context.rows[0].sample_split.value.raw).toBeNull();
    });

    it('falls back safely when demo data no longer matches the schema', () => {
        expect(
            buildSampleVizContext(
                baseSchema,
                undefined,
                {},
                { rows: [{ removedField: 1 }] },
            ),
        ).toEqual(buildSampleVizContext(baseSchema));
    });
});
