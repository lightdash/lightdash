import {
    ConditionalFormattingColorApplyTo,
    type ConditionalFormattingConfig,
} from '../types/conditionalFormatting';
import { DimensionType, FieldType } from '../types/field';
import { FilterOperator } from '../types/filter';
import {
    createConditionalFormattingConfigWithSingleColor,
    createConditionalFormattingRuleWithValues,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    getConditionalFormattingTextStyle,
    getPivotRowContextKey,
    getRowConditionalFormattingColor,
    hasMatchingConditionalRules,
} from './conditionalFormatting';

// Mock field for testing
const mockNumericField = {
    name: 'test_field',
    table: 'test_table',
    type: DimensionType.NUMBER,
    fieldType: FieldType.DIMENSION,
    sql: 'test_sql',
    tableLabel: 'Test Table',
    label: 'Test Field',
    hidden: false,
};

describe('hasMatchingConditionalRules', () => {
    describe('LESS_THAN_OR_EQUAL operator', () => {
        it('should return true when field value is less than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                5, // less than 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return true when field value equals rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // equals 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return false when field value is greater than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                15, // greater than 10
                {},
                config,
            );

            expect(result).toBe(false);
        });
    });

    describe('GREATER_THAN_OR_EQUAL operator', () => {
        it('should return true when field value is greater than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                15, // greater than 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return true when field value equals rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // equals 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return false when field value is less than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                5, // less than 10
                {},
                config,
            );

            expect(result).toBe(false);
        });
    });

    describe('Edge cases', () => {
        it('should handle multiple values with LESS_THAN_OR_EQUAL', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [5, 15];
            config.rules = [rule];

            // Should match if value is <= any of the rule values
            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // <= 15 (second value)
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should handle multiple values with GREATER_THAN_OR_EQUAL', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [5, 15];
            config.rules = [rule];

            // Should match if value is >= any of the rule values
            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // >= 5 (first value)
                {},
                config,
            );

            expect(result).toBe(true);
        });
    });

    describe('color range config', () => {
        const colorRangeConfig = {
            target: null,
            color: { start: '#ffffff', end: '#000000' },
            rule: { min: 100, max: 1000 },
        };

        it('should match values within the range', () => {
            expect(
                hasMatchingConditionalRules(
                    mockNumericField,
                    500,
                    {},
                    colorRangeConfig,
                ),
            ).toBe(true);
        });

        it('should not match values above the max', () => {
            expect(
                hasMatchingConditionalRules(
                    mockNumericField,
                    2397,
                    {},
                    colorRangeConfig,
                ),
            ).toBe(false);
        });

        it('should not match values below the min', () => {
            expect(
                hasMatchingConditionalRules(
                    mockNumericField,
                    38,
                    {},
                    colorRangeConfig,
                ),
            ).toBe(false);
        });

        it('should not match when min is greater than max', () => {
            expect(
                hasMatchingConditionalRules(
                    mockNumericField,
                    500,
                    {},
                    {
                        ...colorRangeConfig,
                        rule: { min: 1000, max: 100 },
                    },
                ),
            ).toBe(false);
        });

        it('should not match non-numeric values', () => {
            expect(
                hasMatchingConditionalRules(
                    mockNumericField,
                    'not a number',
                    {},
                    colorRangeConfig,
                ),
            ).toBe(false);
        });

        it('should not match empty cells even when the range contains 0', () => {
            // Number(null) and Number('') coerce to 0 — must not match [-10, 10]
            const rangeAroundZero = {
                ...colorRangeConfig,
                rule: { min: -10, max: 10 },
            };
            expect(
                hasMatchingConditionalRules(
                    mockNumericField,
                    null,
                    {},
                    rangeAroundZero,
                ),
            ).toBe(false);
            expect(
                hasMatchingConditionalRules(
                    mockNumericField,
                    '',
                    {},
                    rangeAroundZero,
                ),
            ).toBe(false);
            expect(
                hasMatchingConditionalRules(
                    mockNumericField,
                    undefined,
                    {},
                    rangeAroundZero,
                ),
            ).toBe(false);
        });
    });
});

describe('getConditionalFormattingConfig', () => {
    it('selects the last matching rule for a specific apply target', () => {
        const cellConfig =
            createConditionalFormattingConfigWithSingleColor('#00ff00');
        cellConfig.rules[0].operator = FilterOperator.GREATER_THAN_OR_EQUAL;
        cellConfig.rules[0].values = [0];

        const textConfig =
            createConditionalFormattingConfigWithSingleColor('#ff0000');
        textConfig.applyTo = ConditionalFormattingColorApplyTo.TEXT;
        textConfig.rules[0].operator = FilterOperator.LESS_THAN_OR_EQUAL;
        textConfig.rules[0].values = [10];

        const conditionalFormattings = [cellConfig, textConfig];

        expect(
            getConditionalFormattingConfig({
                field: mockNumericField,
                value: 5,
                minMaxMap: {},
                conditionalFormattings,
                applyTo: ConditionalFormattingColorApplyTo.CELL,
            }),
        ).toBe(cellConfig);

        expect(
            getConditionalFormattingConfig({
                field: mockNumericField,
                value: 5,
                minMaxMap: {},
                conditionalFormattings,
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
            }),
        ).toBe(textConfig);

        expect(
            getConditionalFormattingConfig({
                field: mockNumericField,
                value: 5,
                minMaxMap: {},
                conditionalFormattings,
            }),
        ).toBe(textConfig);
    });

    describe('color range rules with out-of-range values', () => {
        const lowRange = {
            target: null,
            color: { start: '#ffffff', end: '#0000ff' },
            rule: { min: 0, max: 100 },
        };
        const highRange = {
            target: null,
            color: { start: '#ffffff', end: '#ff0000' },
            rule: { min: 100, max: 200 },
        };
        const singleColorAbove500 = {
            target: null,
            color: '#00ff00',
            rules: [
                {
                    id: '1',
                    operator: FilterOperator.GREATER_THAN,
                    values: [500],
                },
            ],
        };

        const pick = (
            value: unknown,
            conditionalFormattings: ConditionalFormattingConfig[],
        ) =>
            getConditionalFormattingConfig({
                field: mockNumericField,
                value,
                minMaxMap: {},
                conditionalFormattings,
            });

        it('returns a single color range rule for an out-of-range value so it can clamp', () => {
            expect(pick(999, [lowRange])).toBe(lowRange);
            expect(pick(-10, [lowRange])).toBe(lowRange);
        });

        it('prefers the rule whose range contains the value over a later range rule', () => {
            expect(pick(50, [lowRange, highRange])).toBe(lowRange);
            expect(pick(150, [lowRange, highRange])).toBe(highRange);
        });

        it('falls back to the nearest color range rule when the value is outside all ranges', () => {
            expect(pick(999, [lowRange, highRange])).toBe(highRange);
            expect(pick(-10, [lowRange, highRange])).toBe(lowRange);
            expect(pick(-10, [highRange, lowRange])).toBe(lowRange);
        });

        it('picks the nearest rule for values in a gap between two ranges', () => {
            const band1 = { ...lowRange, rule: { min: 0, max: 50 } };
            const band2 = { ...highRange, rule: { min: 100, max: 200 } };
            expect(pick(60, [band1, band2])).toBe(band1);
            expect(pick(90, [band1, band2])).toBe(band2);
        });

        it('breaks distance ties by picking the later rule', () => {
            const band1 = { ...lowRange, rule: { min: 0, max: 50 } };
            const band2 = { ...highRange, rule: { min: 100, max: 200 } };
            // 75 is equidistant from both bands
            expect(pick(75, [band1, band2])).toBe(band2);
            expect(pick(75, [band2, band1])).toBe(band1);
        });

        it('does not fall back for empty cells', () => {
            expect(pick(null, [lowRange])).toBeUndefined();
            expect(pick(undefined, [lowRange])).toBeUndefined();
            expect(pick('', [lowRange])).toBeUndefined();
        });

        it('prefers a matching single color rule over an out-of-range color range rule', () => {
            expect(pick(600, [singleColorAbove500, lowRange])).toBe(
                singleColorAbove500,
            );
        });

        it('falls back to a color range rule when no rule matches strictly', () => {
            expect(pick(300, [lowRange, singleColorAbove500])).toBe(lowRange);
        });

        it('does not fall back to a color range rule with min greater than max', () => {
            expect(
                pick(300, [{ ...lowRange, rule: { min: 100, max: 0 } }]),
            ).toBeUndefined();
        });

        it('does not fall back to a color range rule targeting another field', () => {
            expect(
                pick(999, [
                    {
                        ...lowRange,
                        target: { fieldId: 'other_table_other_field' },
                    },
                ]),
            ).toBeUndefined();
        });

        it('respects applyTo when falling back', () => {
            const textRange = {
                ...lowRange,
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
            };
            expect(
                getConditionalFormattingConfig({
                    field: mockNumericField,
                    value: 999,
                    minMaxMap: {},
                    conditionalFormattings: [textRange],
                    applyTo: ConditionalFormattingColorApplyTo.CELL,
                }),
            ).toBeUndefined();
        });
    });
});

describe('getConditionalFormattingDescription', () => {
    const getRuleLabel = () => ({ field: '', operator: '', value: '' });
    const colorRangeConfig = {
        target: null,
        color: { start: '#ffffff', end: '#000000' },
        rule: { min: 0, max: 100 },
    };

    const describeValue = (value: unknown) =>
        getConditionalFormattingDescription(
            mockNumericField,
            colorRangeConfig,
            value,
            {},
            {},
            getRuleLabel,
        );

    it('describes the range for in-range values', () => {
        expect(describeValue(50)).toBe(
            'is greater than or equal to 0 and is less than or equal to 100',
        );
    });

    it('describes clamped out-of-range values truthfully', () => {
        expect(describeValue(250)).toBe(
            'is above the color scale maximum (100)',
        );
        expect(describeValue(-5)).toBe(
            'is below the color scale minimum (0)',
        );
    });
});

describe('getPivotRowContextKey', () => {
    it('is stable regardless of key insertion order', () => {
        const a = getPivotRowContextKey({ dim_b: 'y', dim_a: 'x' });
        const b = getPivotRowContextKey({ dim_a: 'x', dim_b: 'y' });
        expect(a).toEqual(b);
    });

    it('distinguishes different values', () => {
        expect(getPivotRowContextKey({ dim_a: 'x' })).not.toEqual(
            getPivotRowContextKey({ dim_a: 'z' }),
        );
    });

    it('distinguishes different fields with equal values', () => {
        expect(getPivotRowContextKey({ dim_a: 'x' })).not.toEqual(
            getPivotRowContextKey({ dim_b: 'x' }),
        );
    });

    it('normalizes null/undefined consistently', () => {
        expect(getPivotRowContextKey({ dim_a: null })).toEqual(
            getPivotRowContextKey({ dim_a: undefined }),
        );
    });
});

describe('getRowConditionalFormattingColor', () => {
    // Reuse the same numeric field fixture used by hasMatchingConditionalRules tests
    const triggerField = {
        name: 'status',
        table: 'orders',
        type: DimensionType.NUMBER,
        fieldType: FieldType.DIMENSION,
        sql: 'status',
        tableLabel: 'Orders',
        label: 'Status',
        hidden: false,
    };
    const fieldId = 'orders_status';
    const target = { fieldId };

    const makeMatchingConfig = (color: string) => {
        const config = createConditionalFormattingConfigWithSingleColor(
            color,
            target,
        );
        const rule = createConditionalFormattingRuleWithValues();
        rule.operator = FilterOperator.EQUALS;
        rule.values = [42];
        config.rules = [rule];
        config.applyTo = ConditionalFormattingColorApplyTo.ROW;
        return config;
    };

    const rowFields = {
        [fieldId]: { field: triggerField, value: 42 },
    };

    it('returns the configured color when trigger field matches', () => {
        const config = makeMatchingConfig('#ff0000');
        const result = getRowConditionalFormattingColor({
            conditionalFormattings: [config],
            rowFields,
            minMaxMap: {},
        });
        expect(result).toBe('#ff0000');
    });

    it('returns null when trigger field value does not match', () => {
        const config = makeMatchingConfig('#ff0000');
        const nonMatchingRowFields = {
            [fieldId]: { field: triggerField, value: 99 },
        };
        const result = getRowConditionalFormattingColor({
            conditionalFormattings: [config],
            rowFields: nonMatchingRowFields,
            minMaxMap: {},
        });
        expect(result).toBeNull();
    });

    it('ignores configs with applyTo: CELL even when rule would match', () => {
        const config = makeMatchingConfig('#00ff00');
        config.applyTo = ConditionalFormattingColorApplyTo.CELL;
        const result = getRowConditionalFormattingColor({
            conditionalFormattings: [config],
            rowFields,
            minMaxMap: {},
        });
        expect(result).toBeNull();
    });

    it('returns null when config target is null', () => {
        const config = createConditionalFormattingConfigWithSingleColor(
            '#0000ff',
            null,
        );
        const rule = createConditionalFormattingRuleWithValues();
        rule.operator = FilterOperator.EQUALS;
        rule.values = [42];
        config.rules = [rule];
        config.applyTo = ConditionalFormattingColorApplyTo.ROW;
        const result = getRowConditionalFormattingColor({
            conditionalFormattings: [config],
            rowFields,
            minMaxMap: {},
        });
        expect(result).toBeNull();
    });

    it('returns null when conditionalFormattings is undefined', () => {
        const result = getRowConditionalFormattingColor({
            conditionalFormattings: undefined,
            rowFields,
            minMaxMap: {},
        });
        expect(result).toBeNull();
    });

    it('returns color of first matching ROW config when multiple exist', () => {
        const first = makeMatchingConfig('#aaaaaa');
        const second = makeMatchingConfig('#bbbbbb');
        const result = getRowConditionalFormattingColor({
            conditionalFormattings: [first, second],
            rowFields,
            minMaxMap: {},
        });
        expect(result).toBe('#aaaaaa');
    });
});

describe('getConditionalFormattingTextStyle', () => {
    it('returns undefined when no configs have text styling', () => {
        const config =
            createConditionalFormattingConfigWithSingleColor('#ff0000');
        expect(
            getConditionalFormattingTextStyle([config, undefined]),
        ).toBeUndefined();
    });

    it('returns the text style of a single matching config', () => {
        const config =
            createConditionalFormattingConfigWithSingleColor('#ff0000');
        config.textStyle = { bold: true };
        expect(getConditionalFormattingTextStyle([config])).toEqual({
            bold: true,
            italic: false,
            underline: false,
        });
    });

    it('unions text styles across multiple matching configs', () => {
        const boldConfig =
            createConditionalFormattingConfigWithSingleColor('#ff0000');
        boldConfig.textStyle = { bold: true };
        const underlineConfig =
            createConditionalFormattingConfigWithSingleColor('#00ff00');
        underlineConfig.textStyle = { underline: true };

        expect(
            getConditionalFormattingTextStyle([
                boldConfig,
                undefined,
                underlineConfig,
            ]),
        ).toEqual({ bold: true, italic: false, underline: true });
    });

    it('ignores a config whose text style has all toggles off', () => {
        const config =
            createConditionalFormattingConfigWithSingleColor('#ff0000');
        config.textStyle = { bold: false, italic: false, underline: false };
        expect(getConditionalFormattingTextStyle([config])).toBeUndefined();
    });
});
