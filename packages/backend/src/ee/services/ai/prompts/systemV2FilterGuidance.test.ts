import {
    filterExpressionOperatorDefinitions,
    FilterOperator,
    FilterType,
    getFilterExpressionExamples,
    parseFilterExpression,
    type FilterExpressionExample,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { resolveSearchFieldValuesFilterExpression } from '../utils/filterExpressions/resolveFilterExpressionArgs';
import { mockOrdersExplore } from '../utils/validationExplore.mock';
import {
    FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS,
    getFilterExpressionPromptExamples,
    renderFilterExpressionInstructionMatrix,
} from './systemV2FilterGuidance';

const exampleKey = (example: FilterExpressionExample): string =>
    JSON.stringify({
        fieldFilterType: example.fieldFilterType,
        operator: example.operator,
        values: example.values ?? null,
        settings: example.settings ?? null,
    });

const renderExamplesByFilterType = () => {
    const examples = getFilterExpressionPromptExamples();
    return Object.fromEntries(
        Object.values(FilterType).map((fieldFilterType) => [
            fieldFilterType,
            examples
                .filter(
                    (example) => example.fieldFilterType === fieldFilterType,
                )
                .map((example) => `${example.operator}: ${example.expression}`)
                .join('\n'),
        ]),
    );
};

describe('filter expression prompt examples', () => {
    it('renders the generated matrix by filter type', () => {
        expect(renderExamplesByFilterType()).toMatchInlineSnapshot(`
          {
            "boolean": "isNull: orders_is_completed isNull
          notNull: orders_is_completed notNull
          equals: orders_is_completed equals=true
          equals: orders_is_completed equals=false
          notEquals: orders_is_completed notEquals=true
          notEquals: orders_is_completed notEquals=false",
            "date": "isNull: orders_order_date isNull
          notNull: orders_order_date notNull
          equals: orders_order_date equals=2024-01-01
          equals: orders_order_date equals=2024-01-01,2024-02-01
          notEquals: orders_order_date notEquals=2024-01-01T00:00:00Z
          notEquals: orders_order_date notEquals=2024-01-01T00:00:00Z,2024-02-01
          lessThan: orders_order_date lessThan=2024-02-01T00:00:00Z
          lessThanOrEqual: orders_order_date lessThanOrEqual=2024-02-01
          greaterThan: orders_order_date greaterThan=2024-01-01
          greaterThanOrEqual: orders_order_date greaterThanOrEqual=2024-01-01
          inThePast: orders_order_date inThePast=2{unit:days,completed:false}
          inThePast: orders_order_date inThePast=2{unit:days,completed:true}
          inThePast: orders_order_date inThePast=2{unit:weeks,completed:false}
          inThePast: orders_order_date inThePast=2{unit:weeks,completed:true}
          inThePast: orders_order_date inThePast=2{unit:months,completed:false}
          inThePast: orders_order_date inThePast=2{unit:months,completed:true}
          inThePast: orders_order_date inThePast=2{unit:quarters,completed:false}
          inThePast: orders_order_date inThePast=2{unit:quarters,completed:true}
          inThePast: orders_order_date inThePast=2{unit:years,completed:false}
          inThePast: orders_order_date inThePast=2{unit:years,completed:true}
          notInThePast: orders_order_date notInThePast=2{unit:days,completed:false}
          notInThePast: orders_order_date notInThePast=2{unit:days,completed:true}
          notInThePast: orders_order_date notInThePast=2{unit:weeks,completed:false}
          notInThePast: orders_order_date notInThePast=2{unit:weeks,completed:true}
          notInThePast: orders_order_date notInThePast=2{unit:months,completed:false}
          notInThePast: orders_order_date notInThePast=2{unit:months,completed:true}
          notInThePast: orders_order_date notInThePast=2{unit:quarters,completed:false}
          notInThePast: orders_order_date notInThePast=2{unit:quarters,completed:true}
          notInThePast: orders_order_date notInThePast=2{unit:years,completed:false}
          notInThePast: orders_order_date notInThePast=2{unit:years,completed:true}
          inTheNext: orders_order_date inTheNext=2{unit:days,completed:false}
          inTheNext: orders_order_date inTheNext=2{unit:days,completed:true}
          inTheNext: orders_order_date inTheNext=2{unit:weeks,completed:false}
          inTheNext: orders_order_date inTheNext=2{unit:weeks,completed:true}
          inTheNext: orders_order_date inTheNext=2{unit:months,completed:false}
          inTheNext: orders_order_date inTheNext=2{unit:months,completed:true}
          inTheNext: orders_order_date inTheNext=2{unit:quarters,completed:false}
          inTheNext: orders_order_date inTheNext=2{unit:quarters,completed:true}
          inTheNext: orders_order_date inTheNext=2{unit:years,completed:false}
          inTheNext: orders_order_date inTheNext=2{unit:years,completed:true}
          inTheCurrent: orders_order_date inTheCurrent=days
          inTheCurrent: orders_order_date inTheCurrent=weeks
          inTheCurrent: orders_order_date inTheCurrent=months
          inTheCurrent: orders_order_date inTheCurrent=quarters
          inTheCurrent: orders_order_date inTheCurrent=years
          notInTheCurrent: orders_order_date notInTheCurrent=days
          notInTheCurrent: orders_order_date notInTheCurrent=weeks
          notInTheCurrent: orders_order_date notInTheCurrent=months
          notInTheCurrent: orders_order_date notInTheCurrent=quarters
          notInTheCurrent: orders_order_date notInTheCurrent=years
          inBetween: orders_order_date inBetween=2024-01-01,2024-01-31",
            "number": "isNull: orders_amount isNull
          notNull: orders_amount notNull
          equals: orders_amount equals=100
          equals: orders_amount equals=100,500
          notEquals: orders_amount notEquals=100
          notEquals: orders_amount notEquals=100,500
          lessThan: orders_amount lessThan=100
          lessThanOrEqual: orders_amount lessThanOrEqual=100
          greaterThan: orders_amount greaterThan=100
          greaterThanOrEqual: orders_amount greaterThanOrEqual=100
          inBetween: orders_amount inBetween=100,500
          notInBetween: orders_amount notInBetween=100,500",
            "string": "isNull: orders_status isNull
          notNull: orders_status notNull
          equals: orders_status equals=example
          equals: orders_status equals=example,another
          notEquals: orders_status notEquals=excluded
          notEquals: orders_status notEquals=excluded,another
          startsWith: orders_status startsWith=prefix
          startsWith: orders_status startsWith=prefix,another
          endsWith: orders_status endsWith=suffix
          endsWith: orders_status endsWith=suffix,another
          include: orders_status include=contains
          include: orders_status include=contains,another
          doesNotInclude: orders_status doesNotInclude=exclude
          doesNotInclude: orders_status doesNotInclude=exclude,another
          equals: orders_status equals="Coffee Filters (100pk), \\"special\\" \\\\ stock"",
          }
        `);
    });

    it('snapshots the generated matrix size', () => {
        const examples = getFilterExpressionPromptExamples();

        expect({
            total: examples.length,
            byFilterType: Object.fromEntries(
                Object.values(FilterType).map((fieldFilterType) => [
                    fieldFilterType,
                    examples.filter(
                        (example) =>
                            example.fieldFilterType === fieldFilterType,
                    ).length,
                ]),
            ),
        }).toMatchInlineSnapshot(`
          {
            "byFilterType": {
              "boolean": 6,
              "date": 51,
              "number": 12,
              "string": 15,
            },
            "total": 84,
          }
        `);
    });

    it('emits every canonical permutation exactly once', () => {
        const promptExamples = getFilterExpressionPromptExamples();
        const promptExampleKeys = promptExamples.map(exampleKey);

        expect(new Set(promptExampleKeys).size).toBe(promptExampleKeys.length);
        expect(
            new Set(promptExamples.map(({ expression }) => expression)).size,
        ).toBe(promptExamples.length);

        for (const canonicalExample of getFilterExpressionExamples()) {
            const canonicalKey = exampleKey(canonicalExample);
            expect(
                promptExampleKeys.filter((key) => key === canonicalKey),
            ).toHaveLength(1);
        }
    });

    it('emits every supported pair and no unsupported pair', () => {
        const examples = getFilterExpressionPromptExamples();

        for (const fieldFilterType of Object.values(FilterType)) {
            for (const definition of filterExpressionOperatorDefinitions) {
                const matchingExamples = examples.filter(
                    (example) =>
                        example.fieldFilterType === fieldFilterType &&
                        example.operator === definition.operator,
                );
                const isSupported =
                    definition.argumentCountByFilterType[fieldFilterType] !==
                    null;

                expect(matchingExamples.length > 0).toBe(isSupported);
            }
        }
    });

    it('renders lexical protection through the expression formatter', () => {
        expect(
            getFilterExpressionPromptExamples().some(
                ({ expression }) =>
                    expression ===
                    'orders_status equals="Coffee Filters (100pk), \\"special\\" \\\\ stock"',
            ),
        ).toBe(true);
    });

    it('generates parseable raw strings', () => {
        const expressions = [
            ...getFilterExpressionPromptExamples().map(
                ({ expression }) => expression,
            ),
            ...Object.values(FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS),
        ];

        for (const expression of expressions) {
            expect(parseFilterExpression(expression)).toMatchObject({
                success: true,
            });
        }
    });

    it('resolves representative generated strings against typed metadata', () => {
        const examples = getFilterExpressionPromptExamples();
        const representatives = [
            examples.find(
                (example) =>
                    example.fieldFilterType === FilterType.NUMBER &&
                    example.operator === FilterOperator.IN_BETWEEN,
            ),
            examples.find(
                (example) =>
                    example.fieldFilterType === FilterType.DATE &&
                    example.operator === FilterOperator.IN_THE_PAST &&
                    example.settings?.unitOfTime === 'weeks' &&
                    example.settings.completed,
            ),
        ];

        for (const representative of representatives) {
            expect(representative).toBeDefined();
            if (!representative) {
                throw new Error('Missing generated representative example');
            }

            expect(
                resolveSearchFieldValuesFilterExpression({
                    expressionInput: representative.expression,
                    explore: mockOrdersExplore,
                }),
            ).toMatchObject({ success: true });
        }
    });

    it('renders one complete matrix', () => {
        const matrix = renderFilterExpressionInstructionMatrix();

        expect(
            matrix.match(/### Generated raw expression matrix/g),
        ).toHaveLength(1);
    });
});
