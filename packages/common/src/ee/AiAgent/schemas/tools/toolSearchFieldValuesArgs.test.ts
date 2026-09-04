import { describe, expect, it } from 'vitest';
import { type ToolDescriptionContext } from '../defineTool';
import {
    TOOL_SEARCH_FIELD_VALUES_FILTER_EXPRESSION_DESCRIPTION,
    toolSearchFieldValuesArgsSchema,
    toolSearchFieldValuesExpressionArgsSchema,
} from './toolSearchFieldValuesArgs';

const baseArgs = {
    table: 'orders',
    fieldId: 'orders_status',
    query: 'complete',
};

const descriptionContexts = [
    { runtime: 'agent', toolName: 'searchFieldValues' },
    { runtime: 'mcp', toolName: 'search_field_values' },
] satisfies ToolDescriptionContext[];

describe('searchFieldValues filter schemas', () => {
    it.each(descriptionContexts)(
        'advertises AND-only expressions to the $runtime runtime',
        (context) => {
            const description =
                TOOL_SEARCH_FIELD_VALUES_FILTER_EXPRESSION_DESCRIPTION(context);

            expect(description).toContain(
                'Join flat rules with AND only. OR is not supported by this tool.',
            );
            expect(description).not.toContain('Join flat rules with AND or OR');
            expect(description).toContain('### string');
            expect(description).toContain('### date');
        },
    );

    it('tells the expression Agent to omit unscoped filters', () => {
        const description =
            TOOL_SEARCH_FIELD_VALUES_FILTER_EXPRESSION_DESCRIPTION({
                runtime: 'agent',
                toolName: 'searchFieldValues',
            });

        expect(description).toContain(
            'Omit filters when the search does not need additional filters',
        );
        expect(description).toContain(
            'When filters is present, it scopes the candidate-value search',
        );
        expect(description).not.toContain('Set filters to null');
    });

    it('keeps the structured schema', () => {
        expect(
            toolSearchFieldValuesArgsSchema.parse({
                ...baseArgs,
                filters: {
                    type: 'and',
                    dimensions: null,
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        ).toMatchObject({
            filters: { type: 'and' },
        });
    });

    it('accepts a dimension expression or null and defaults omission to null', () => {
        expect(
            toolSearchFieldValuesExpressionArgsSchema.parse({
                ...baseArgs,
                filters: 'orders_status equals=completed',
            }),
        ).toMatchObject({
            filters: 'orders_status equals=completed',
        });
        expect(
            toolSearchFieldValuesExpressionArgsSchema.parse({
                ...baseArgs,
                filters: null,
            }),
        ).toMatchObject({ filters: null });
        expect(
            toolSearchFieldValuesExpressionArgsSchema.parse(baseArgs),
        ).toMatchObject({ filters: null });
    });

    it('rejects extra properties', () => {
        expect(
            toolSearchFieldValuesExpressionArgsSchema.safeParse({
                ...baseArgs,
                filters: null,
                unexpected: true,
            }).success,
        ).toBe(false);
    });

    it.each([
        '',
        [],
        {
            type: 'and',
            dimensions: null,
            metrics: null,
            tableCalculations: null,
        },
    ])('rejects a non-expression filter value: %j', (filters) => {
        expect(
            toolSearchFieldValuesExpressionArgsSchema.safeParse({
                ...baseArgs,
                filters,
            }).success,
        ).toBe(false);
    });
});
