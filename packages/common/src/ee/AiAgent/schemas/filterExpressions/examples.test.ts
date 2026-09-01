import { describe, expect, it } from 'vitest';
import { DimensionType } from '../../../../types/field';
import { FilterOperator, FilterType } from '../../../../types/filter';
import { type AiFilterExample } from '../filters/filterExamples';
import {
    FILTER_EXPRESSION_AND_ONLY_EXAMPLES_DESCRIPTION,
    FILTER_EXPRESSION_EXAMPLES_DESCRIPTION,
    formatFilterExpressionExample,
    getFilterExpressionExamples,
} from './examples';
import { filterExpressionOperatorDefinitions } from './operators';
import { parseFilterExpression } from './parse';

describe('filter expression examples', () => {
    it('covers every supported filter type and operator', () => {
        const examples = getFilterExpressionExamples();

        for (const fieldFilterType of Object.values(FilterType)) {
            for (const definition of filterExpressionOperatorDefinitions) {
                const matchingExamples = examples.filter(
                    (example) =>
                        example.fieldFilterType === fieldFilterType &&
                        example.operator === definition.operator,
                );

                if (
                    definition.argumentCountByFilterType[fieldFilterType] ===
                    null
                ) {
                    expect(matchingExamples).toHaveLength(0);
                } else {
                    expect(matchingExamples.length).toBeGreaterThan(0);
                }
            }
        }
    });

    it('does not generate duplicate expressions', () => {
        const expressions = getFilterExpressionExamples().map(
            ({ expression }) => expression,
        );

        expect(new Set(expressions).size).toBe(expressions.length);
    });

    it('generates parseable expressions', () => {
        for (const { expression } of getFilterExpressionExamples()) {
            expect(parseFilterExpression(expression)).toMatchObject({
                success: true,
            });
        }
    });

    it('generates an AND-only multiple-rule example', () => {
        const exampleLine =
            FILTER_EXPRESSION_AND_ONLY_EXAMPLES_DESCRIPTION.split('\n').find(
                (line) => line.startsWith('- '),
            );
        if (!exampleLine) {
            throw new Error('Missing generated AND-only example');
        }

        expect(FILTER_EXPRESSION_AND_ONLY_EXAMPLES_DESCRIPTION).not.toContain(
            ' OR ',
        );
        expect(parseFilterExpression(exampleLine.slice(2))).toMatchObject({
            success: true,
            expression: { connector: 'and', rules: [{}, {}] },
        });
    });

    it('quotes protected lexical content without changing its value', () => {
        const example: AiFilterExample = {
            fieldId: 'orders customer`name',
            fieldType: DimensionType.STRING,
            fieldFilterType: FilterType.STRING,
            operator: FilterOperator.EQUALS,
            values: ['Coffee Filters (100pk), "special" \\ stock'],
        };
        const expression = formatFilterExpressionExample(example);
        const parsed = parseFilterExpression(expression);

        expect(expression).toBe(
            '`orders customer\\`name` equals="Coffee Filters (100pk), \\"special\\" \\\\ stock"',
        );
        expect(parsed).toMatchObject({
            success: true,
            expression: {
                rules: [
                    {
                        field: { value: 'orders customer`name' },
                        arguments: [
                            {
                                value: 'Coffee Filters (100pk), "special" \\ stock',
                            },
                        ],
                    },
                ],
            },
        });
    });

    it('renders the complete generated instruction matrix', () => {
        expect(FILTER_EXPRESSION_EXAMPLES_DESCRIPTION).toMatchSnapshot();
    });
});
