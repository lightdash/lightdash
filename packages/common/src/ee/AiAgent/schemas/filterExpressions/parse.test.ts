import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FilterOperator } from '../../../../types/filter';
import { filterExpressionGrammar } from './grammar';
import {
    filterExpressionOperatorDefinitions,
    filterExpressionOperators,
} from './operators';
import {
    FILTER_EXPRESSION_MAX_LENGTH,
    FILTER_EXPRESSION_MAX_LITERAL_LENGTH,
    FILTER_EXPRESSION_MAX_RULES,
    FILTER_EXPRESSION_MAX_VALUES_PER_RULE,
    parseFilterExpression,
} from './parse';

const expectParsed = (input: string) => {
    const result = parseFilterExpression(input);
    expect(result).toMatchObject({ success: true });
    if (!result.success) {
        throw new Error(result.error.message);
    }
    return result.expression;
};

const expectParseError = (input: string) => {
    const result = parseFilterExpression(input);
    expect(result).toMatchObject({ success: false });
    if (result.success) {
        throw new Error('Expected parsing to fail');
    }
    return result.error;
};

const withoutSpans = (input: string) => {
    const expression = expectParsed(input);
    return {
        kind: expression.kind,
        connector: expression.connector,
        rules: expression.rules.map((rule) => ({
            kind: rule.kind,
            field: rule.field.value,
            operator: rule.operator.value,
            arguments: rule.arguments.map(({ kind, value }) => ({
                kind,
                value,
            })),
        })),
    };
};

describe('parseFilterExpression', () => {
    it('parses a single rule with exact source spans', () => {
        expect(expectParsed('orders_status equals=completed')).toEqual({
            kind: 'expression',
            connector: null,
            rules: [
                {
                    kind: 'rule',
                    field: {
                        kind: 'field',
                        value: 'orders_status',
                        span: {
                            start: { offset: 0, line: 1, column: 1 },
                            end: { offset: 13, line: 1, column: 14 },
                        },
                    },
                    operator: {
                        kind: 'operator',
                        value: FilterOperator.EQUALS,
                        span: {
                            start: { offset: 14, line: 1, column: 15 },
                            end: { offset: 20, line: 1, column: 21 },
                        },
                    },
                    arguments: [
                        {
                            kind: 'bare',
                            value: 'completed',
                            span: {
                                start: { offset: 21, line: 1, column: 22 },
                                end: { offset: 30, line: 1, column: 31 },
                            },
                        },
                    ],
                    span: {
                        start: { offset: 0, line: 1, column: 1 },
                        end: { offset: 30, line: 1, column: 31 },
                    },
                },
            ],
            span: {
                start: { offset: 0, line: 1, column: 1 },
                end: { offset: 30, line: 1, column: 31 },
            },
        });
    });

    it.each([
        ['AND', 'and'],
        ['and', 'and'],
        ['OR', 'or'],
        ['or', 'or'],
    ] as const)('parses repeated %s connectors', (connector, expected) => {
        expect(
            withoutSpans(
                `orders_status equals=open ${connector} orders_region equals=emea`,
            ),
        ).toMatchObject({ connector: expected, rules: [{}, {}] });
    });

    it('rejects mixed connectors at the conflicting connector', () => {
        const error = expectParseError(
            'a equals=1 AND b equals=2 OR c equals=3',
        );
        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_MIXED_CONNECTORS',
            span: {
                start: { offset: 26, line: 1, column: 27 },
                end: { offset: 28, line: 1, column: 29 },
            },
        });
    });

    it('reserves connectors without rejecting identifier prefixes', () => {
        expectParseError('and equals=value');
        expectParseError('OR equals=value');
        expect(withoutSpans('`and` equals=value')).toMatchObject({
            rules: [{ field: 'and' }],
        });
        expect(withoutSpans('`field\\`name` equals=value')).toMatchObject({
            rules: [{ field: 'field`name' }],
        });
        expect(withoutSpans('android_version equals=value')).toMatchObject({
            rules: [{ field: 'android_version' }],
        });
        expectParseError('field include=value, AND other equals=value');
    });

    it('parses quoted values, escapes, commas, unicode, and empty strings', () => {
        expect(
            withoutSpans(
                String.raw`field equals='a,b',"line\nvalue",'it\'s','',café`,
            ),
        ).toMatchObject({
            rules: [
                {
                    arguments: [
                        { kind: 'quoted', value: 'a,b' },
                        { kind: 'quoted', value: 'line\nvalue' },
                        { kind: 'quoted', value: "it's" },
                        { kind: 'quoted', value: '' },
                        { kind: 'bare', value: 'café' },
                    ],
                },
            ],
        });
    });

    it('distinguishes bare null from a quoted null string', () => {
        expect(withoutSpans("field equals=NULL,'null'")).toMatchObject({
            rules: [
                {
                    arguments: [
                        { kind: 'bareNull', value: 'NULL' },
                        { kind: 'quoted', value: 'null' },
                    ],
                },
            ],
        });
    });

    it('parses presence operators without arguments', () => {
        expect(withoutSpans('field isNull')).toMatchObject({
            rules: [
                {
                    operator: FilterOperator.NULL,
                    arguments: [],
                },
            ],
        });
        expect(withoutSpans('field notNull')).toMatchObject({
            rules: [
                {
                    operator: FilterOperator.NOT_NULL,
                    arguments: [],
                },
            ],
        });
        expectParseError('field isNull=true');
        expectParseError('field notNull=false');
    });

    it.each([
        '',
        'field equals',
        'field equals=',
        'field equals=value,',
        'field equals=value trailing',
        'field equals=(value)',
        String.raw`field equals='bad\q'`,
    ])('rejects malformed or partially consumed input: %s', (input) => {
        expect(expectParseError(input).code).toBe('FILTER_EXPRESSION_SYNTAX');
    });

    it.each([
        FilterOperator.LESS_THAN_OR_EQUAL,
        FilterOperator.LESS_THAN,
        FilterOperator.NOT_IN_BETWEEN,
        FilterOperator.NOT_EQUALS,
        FilterOperator.NOT_IN_THE_PAST,
        FilterOperator.NOT_IN_THE_CURRENT,
    ])('parses prefix-sensitive operator %s', (operator) => {
        expect(withoutSpans(`field ${operator}=value`)).toMatchObject({
            rules: [{ operator }],
        });
    });

    it('tracks multiline syntax error positions', () => {
        const error = expectParseError('field equals=value AND\nother equals=');
        expect(error.span.start).toMatchObject({ line: 2 });
    });

    it('enforces expression length bounds', () => {
        const error = expectParseError(
            `${'f'.repeat(FILTER_EXPRESSION_MAX_LENGTH)} equals=value`,
        );
        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED',
            limit: 'expressionLength',
            maximum: FILTER_EXPRESSION_MAX_LENGTH,
        });
    });

    it('enforces rule-count bounds', () => {
        const expression = Array.from(
            { length: FILTER_EXPRESSION_MAX_RULES + 1 },
            (_, index) => `field_${index} equals=value`,
        ).join(' AND ');
        expect(expectParseError(expression)).toMatchObject({
            code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED',
            limit: 'ruleCount',
            maximum: FILTER_EXPRESSION_MAX_RULES,
        });
    });

    it('enforces value-count bounds', () => {
        const values = Array.from(
            { length: FILTER_EXPRESSION_MAX_VALUES_PER_RULE + 1 },
            (_, index) => `${index}`,
        ).join(',');
        expect(expectParseError(`field equals=${values}`)).toMatchObject({
            code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED',
            limit: 'valueCount',
            maximum: FILTER_EXPRESSION_MAX_VALUES_PER_RULE,
        });
    });

    it('enforces literal-length bounds', () => {
        const value = 'v'.repeat(FILTER_EXPRESSION_MAX_LITERAL_LENGTH + 1);
        expect(expectParseError(`field equals=${value}`)).toMatchObject({
            code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED',
            limit: 'literalLength',
            maximum: FILTER_EXPRESSION_MAX_LITERAL_LENGTH,
        });
    });
});

describe('filter expression operator definitions', () => {
    it('exposes exactly the current AI filter operator surface', () => {
        expect(filterExpressionOperators).toEqual([
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
            FilterOperator.EQUALS,
            FilterOperator.NOT_EQUALS,
            FilterOperator.STARTS_WITH,
            FilterOperator.ENDS_WITH,
            FilterOperator.INCLUDE,
            FilterOperator.NOT_INCLUDE,
            FilterOperator.LESS_THAN,
            FilterOperator.LESS_THAN_OR_EQUAL,
            FilterOperator.GREATER_THAN,
            FilterOperator.GREATER_THAN_OR_EQUAL,
            FilterOperator.IN_THE_PAST,
            FilterOperator.NOT_IN_THE_PAST,
            FilterOperator.IN_THE_NEXT,
            FilterOperator.IN_THE_CURRENT,
            FilterOperator.NOT_IN_THE_CURRENT,
            FilterOperator.IN_BETWEEN,
            FilterOperator.NOT_IN_BETWEEN,
        ]);
        expect(new Set(filterExpressionOperators).size).toBe(
            filterExpressionOperators.length,
        );
        expect(filterExpressionOperatorDefinitions).toHaveLength(
            filterExpressionOperators.length,
        );
    });

    it('builds every exposed operator into the grammar', () => {
        filterExpressionOperators.forEach((operator) => {
            expect(filterExpressionGrammar).toContain(`"${operator}"`);
        });
    });
});

describe('generated filter expression parser', () => {
    it('contains no runtime eval or Function construction', () => {
        const parserSource = readFileSync(
            path.resolve(__dirname, 'parser.ts'),
            'utf8',
        );
        expect(parserSource).not.toMatch(/\beval\s*\(/u);
        expect(parserSource).not.toMatch(/new\s+Function\s*\(/u);
    });
});
