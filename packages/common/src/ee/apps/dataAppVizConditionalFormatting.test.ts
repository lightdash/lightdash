import {
    ConditionalFormattingColorApplyTo,
    type ConditionalFormattingColorRange,
    type ConditionalFormattingConfig,
    type ConditionalFormattingConfigWithColorRange,
    type ConditionalFormattingConfigWithSingleColor,
} from '../../types/conditionalFormatting';
import { TableCalculationType, type ItemsMap } from '../../types/field';
import { FilterOperator } from '../../types/filter';
import { getColorFromRange, getGradientColor } from '../../utils/colors';
import { getConditionalFormattingColor } from '../../utils/conditionalFormatting';
import {
    getDataAppVizConditionalFormattingColors,
    getDataAppVizConditionalFormattingFieldIds,
    pruneDataAppVizConditionalFormattings,
} from './dataAppVizConditionalFormatting';
import { type DataAppVizSchema } from './types';

const calc = (name: string, type: TableCalculationType) => ({
    name,
    displayName: name,
    sql: '1',
    type,
});
const itemsMap = {
    revenue: calc('revenue', TableCalculationType.NUMBER),
    target: calc('target', TableCalculationType.NUMBER),
    status: calc('status', TableCalculationType.STRING),
} as ItemsMap;
const cell = (raw: unknown) => ({ value: { raw, formatted: String(raw) } });
const keepColorRange = (range: ConditionalFormattingColorRange) => range;

const singleColor = (
    color: string,
    fieldId: string | null,
    rules: ConditionalFormattingConfigWithSingleColor['rules'],
): ConditionalFormattingConfigWithSingleColor => ({
    target: fieldId ? { fieldId } : null,
    color,
    rules,
});
const greaterThan = (value: number) => ({
    id: `gt-${value}`,
    operator: FilterOperator.GREATER_THAN,
    values: [value],
});
const colorRange = (
    fieldId: string,
    rule: ConditionalFormattingConfigWithColorRange['rule'],
): ConditionalFormattingConfigWithColorRange => ({
    target: { fieldId },
    color: { start: '#000000', end: '#ff0000' },
    rule,
});

const schema: Pick<DataAppVizSchema, 'fields' | 'conditionalFormatting'> = {
    fields: [
        { name: 'label', label: 'Label', type: 'column', required: true },
        {
            name: 'values',
            label: 'Values',
            type: 'metric',
            required: true,
            multiple: true,
        },
    ],
    conditionalFormatting: {},
};
const fieldMapping = { label: 'status', values: ['revenue', 'target'] };

describe('getDataAppVizConditionalFormattingFieldIds', () => {
    it('lists the bound numeric fields of a viz that opts in', () => {
        expect(
            getDataAppVizConditionalFormattingFieldIds(
                schema,
                fieldMapping,
                itemsMap,
            ),
        ).toEqual(['revenue', 'target']);
    });

    it('leaves out a numeric field bound as a series, which pivots away', () => {
        expect(
            getDataAppVizConditionalFormattingFieldIds(
                {
                    ...schema,
                    fields: [
                        ...schema.fields,
                        {
                            name: 'split',
                            label: 'Split',
                            type: 'series',
                            required: false,
                        },
                    ],
                },
                { ...fieldMapping, values: ['revenue'], split: 'target' },
                itemsMap,
            ),
        ).toEqual(['revenue']);
    });

    it('lists none for a viz that does not opt in', () => {
        expect(
            getDataAppVizConditionalFormattingFieldIds(
                { fields: schema.fields },
                fieldMapping,
                itemsMap,
            ),
        ).toEqual([]);
    });
});

describe('pruneDataAppVizConditionalFormattings', () => {
    it('drops rules on unbound fields and conditions comparing against one', () => {
        const compareTo = (fieldId: string) => ({
            id: `compare-${fieldId}`,
            operator: FilterOperator.GREATER_THAN,
            compareTarget: { fieldId },
        });
        const untargeted = singleColor('#111111', null, [greaterThan(1)]);
        const mixed = singleColor('#222222', 'revenue', [
            greaterThan(1),
            compareTo('removed'),
        ]);

        expect(
            pruneDataAppVizConditionalFormattings(
                [
                    untargeted,
                    mixed,
                    singleColor('#333333', 'revenue', [compareTo('removed')]),
                    singleColor('#444444', 'revenue', [compareTo('target')]),
                    colorRange('removed', { min: 'auto', max: 'auto' }),
                ],
                ['revenue', 'target'],
            ),
        ).toEqual([
            untargeted,
            { ...mixed, rules: [greaterThan(1)] },
            singleColor('#444444', 'revenue', [compareTo('target')]),
        ]);
    });

    it('drops text styling and keeps where each rule applies', () => {
        const rule = singleColor('#111111', 'revenue', [greaterThan(1)]);
        expect(
            pruneDataAppVizConditionalFormattings(
                [
                    {
                        ...rule,
                        applyTo: ConditionalFormattingColorApplyTo.ROW,
                        textStyle: { bold: true },
                    },
                    {
                        ...colorRange('target', { min: 'auto', max: 'auto' }),
                        applyTo: ConditionalFormattingColorApplyTo.TEXT,
                    },
                ],
                ['revenue', 'target'],
            ),
        ).toEqual([
            { ...rule, applyTo: ConditionalFormattingColorApplyTo.ROW },
            {
                ...colorRange('target', { min: 'auto', max: 'auto' }),
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
            },
        ]);
    });

    it('keeps nothing when no field can be targeted', () => {
        expect(
            pruneDataAppVizConditionalFormattings(
                [singleColor('#111111', null, [greaterThan(1)])],
                [],
            ),
        ).toEqual([]);
    });
});

describe('getDataAppVizConditionalFormattingColors', () => {
    const rows = [
        { revenue: cell(5), target: cell(10) },
        { revenue: cell(15), target: cell(10) },
        { revenue: cell(25), target: cell(30) },
    ];

    it('colours only matched cells, the last matching rule winning like tables', () => {
        expect(
            getDataAppVizConditionalFormattingColors({
                conditionalFormattings: [
                    singleColor('#00ff00', 'revenue', [greaterThan(10)]),
                    singleColor('#0000ff', 'revenue', [greaterThan(20)]),
                ],
                schema,
                fieldMapping,
                itemsMap,
                rows,
                pivotDetails: null,
                adjustColorRange: keepColorRange,
            }),
        ).toEqual([{}, { revenue: '#00ff00' }, { revenue: '#0000ff' }]);
    });

    it('compares against another field of the same row', () => {
        expect(
            getDataAppVizConditionalFormattingColors({
                conditionalFormattings: [
                    singleColor('#00ff00', 'revenue', [
                        {
                            id: 'above-target',
                            operator: FilterOperator.GREATER_THAN,
                            compareTarget: { fieldId: 'target' },
                        },
                    ]),
                ],
                schema,
                fieldMapping,
                itemsMap,
                rows,
                pivotDetails: null,
                adjustColorRange: keepColorRange,
            }),
        ).toEqual([{}, { revenue: '#00ff00' }, {}]);
    });

    it('interpolates colour ranges in oklab and leaves values outside a fixed range uncoloured', () => {
        const range = { min: 0, max: 20 };
        const colors = getDataAppVizConditionalFormattingColors({
            conditionalFormattings: [colorRange('revenue', range)],
            schema,
            fieldMapping,
            itemsMap,
            rows,
            pivotDetails: null,
            adjustColorRange: keepColorRange,
        });

        expect(colors).toEqual([
            {
                revenue: getGradientColor(
                    { colors: ['#000000', '#ff0000'], ...range },
                    5,
                ),
            },
            {
                revenue: getGradientColor(
                    { colors: ['#000000', '#ff0000'], ...range },
                    15,
                ),
            },
            {},
        ]);
        // Tables keep their sRGB interpolation for the same rule.
        expect(
            getConditionalFormattingColor({
                field: itemsMap.revenue,
                value: 5,
                config: colorRange('revenue', range),
                minMaxMap: {},
                getColorFromRange,
            })?.color,
        ).toBe('#400000');
        expect(colors[0].revenue).not.toBe('#400000');
    });

    it('spans automatic bounds over every pivoted column of a field', () => {
        const pivotValue = (value: string) => [
            { referenceField: 'channel', value },
        ];
        const colors = getDataAppVizConditionalFormattingColors({
            conditionalFormattings: [
                colorRange('revenue', { min: 'auto', max: 'auto' }),
                singleColor('#00ff00', 'target', [
                    {
                        id: 'below-revenue',
                        operator: FilterOperator.LESS_THAN,
                        compareTarget: { fieldId: 'revenue' },
                    },
                ]),
            ],
            schema,
            fieldMapping,
            itemsMap,
            rows: [
                {
                    revenue_web: cell(0),
                    revenue_shop: cell(10),
                    target_web: cell(5),
                    target_shop: cell(5),
                },
            ],
            pivotDetails: {
                valuesColumns: [
                    {
                        referenceField: 'revenue',
                        pivotColumnName: 'revenue_web',
                        pivotValues: pivotValue('web'),
                    },
                    {
                        referenceField: 'revenue',
                        pivotColumnName: 'revenue_shop',
                        pivotValues: pivotValue('shop'),
                    },
                    {
                        referenceField: 'target',
                        pivotColumnName: 'target_web',
                        pivotValues: pivotValue('web'),
                    },
                    {
                        referenceField: 'target',
                        pivotColumnName: 'target_shop',
                        pivotValues: pivotValue('shop'),
                    },
                ],
            },
            adjustColorRange: keepColorRange,
        });

        expect(colors).toEqual([
            {
                revenue_web: '#000000',
                revenue_shop: '#ff0000',
                target_shop: '#00ff00',
            },
        ]);
    });

    it('colours cells with cell rules only, like table cells', () => {
        expect(
            getDataAppVizConditionalFormattingColors({
                conditionalFormattings: [
                    singleColor('#00ff00', 'revenue', [greaterThan(10)]),
                    {
                        ...singleColor('#0000ff', 'revenue', [greaterThan(20)]),
                        applyTo: ConditionalFormattingColorApplyTo.ROW,
                    },
                    {
                        ...singleColor('#ff00ff', 'revenue', [greaterThan(0)]),
                        applyTo: ConditionalFormattingColorApplyTo.TEXT,
                    },
                ],
                schema,
                fieldMapping,
                itemsMap,
                rows,
                pivotDetails: null,
                adjustColorRange: keepColorRange,
            }),
        ).toEqual([{}, { revenue: '#00ff00' }, { revenue: '#00ff00' }]);
    });

    it('blends colour ranges adjusted for the colour scheme', () => {
        const range = { min: 0, max: 20 };
        expect(
            getDataAppVizConditionalFormattingColors({
                conditionalFormattings: [colorRange('revenue', range)],
                schema,
                fieldMapping,
                itemsMap,
                rows: [rows[0]],
                pivotDetails: null,
                adjustColorRange: () => ({ start: '#ffffff', end: '#0000ff' }),
            }),
        ).toEqual([
            {
                revenue: getGradientColor(
                    { colors: ['#ffffff', '#0000ff'], ...range },
                    5,
                ),
            },
        ]);
    });

    describe('pivoted results with an index dimension', () => {
        const pivotedSchema: Pick<
            DataAppVizSchema,
            'fields' | 'conditionalFormatting'
        > = {
            fields: [
                { name: 'x', label: 'X', type: 'dimension', required: true },
                {
                    name: 'values',
                    label: 'Values',
                    type: 'metric',
                    required: true,
                },
                {
                    name: 'split',
                    label: 'Split',
                    type: 'series',
                    required: false,
                },
            ],
            conditionalFormatting: {},
        };
        const pivotedItems = {
            ...itemsMap,
            year: calc('year', TableCalculationType.NUMBER),
            channel: calc('channel', TableCalculationType.NUMBER),
        } as ItemsMap;
        const pivotedMapping = {
            x: 'year',
            values: 'revenue',
            split: 'channel',
        };
        const pivotDetails = {
            valuesColumns: ['1', '2'].map((value) => ({
                referenceField: 'revenue',
                pivotColumnName: `revenue_${value}`,
                pivotValues: [{ referenceField: 'channel', value }],
            })),
        };
        const pivotedRows = [
            { year: cell(2020), revenue_1: cell(3000), revenue_2: cell(10) },
            { year: cell(2024), revenue_1: cell(5), revenue_2: cell(9000) },
        ];

        it('applies rules on the index dimension to its own column', () => {
            expect(
                getDataAppVizConditionalFormattingColors({
                    conditionalFormattings: [
                        singleColor('#00ff00', 'year', [greaterThan(2022)]),
                    ],
                    schema: pivotedSchema,
                    fieldMapping: pivotedMapping,
                    itemsMap: pivotedItems,
                    rows: pivotedRows,
                    pivotDetails,
                    adjustColorRange: keepColorRange,
                }),
            ).toEqual([{}, { year: '#00ff00' }]);
        });

        it('compares a pivoted metric against the index dimension', () => {
            expect(
                getDataAppVizConditionalFormattingColors({
                    conditionalFormattings: [
                        singleColor('#ff0000', 'revenue', [
                            {
                                id: 'above-year',
                                operator: FilterOperator.GREATER_THAN,
                                compareTarget: { fieldId: 'year' },
                            },
                        ]),
                    ],
                    schema: pivotedSchema,
                    fieldMapping: pivotedMapping,
                    itemsMap: pivotedItems,
                    rows: pivotedRows,
                    pivotDetails,
                    adjustColorRange: keepColorRange,
                }),
            ).toEqual([{ revenue_1: '#ff0000' }, { revenue_2: '#ff0000' }]);
        });
    });

    it('is empty without rules', () => {
        const none: ConditionalFormattingConfig[] = [];
        expect(
            getDataAppVizConditionalFormattingColors({
                conditionalFormattings: none,
                schema,
                fieldMapping,
                itemsMap,
                rows,
                pivotDetails: null,
                adjustColorRange: keepColorRange,
            }),
        ).toEqual([]);
    });
});
