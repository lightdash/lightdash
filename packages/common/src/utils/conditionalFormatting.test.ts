import { ConditionalFormattingColorApplyTo } from '../types/conditionalFormatting';
import { DimensionType, FieldType } from '../types/field';
import { FilterOperator } from '../types/filter';
import {
    createConditionalFormattingConfigWithSingleColor,
    createConditionalFormattingRuleWithValues,
    getConditionalFormattingConfig,
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
