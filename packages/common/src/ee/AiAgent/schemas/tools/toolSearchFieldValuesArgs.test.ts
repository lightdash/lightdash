import { describe, expect, it } from 'vitest';
import {
    toolSearchFieldValuesArgsSchema,
    toolSearchFieldValuesExpressionArgsSchema,
} from './toolSearchFieldValuesArgs';

const baseArgs = {
    table: 'orders',
    fieldId: 'orders_status',
    query: 'complete',
};

describe('searchFieldValues filter schemas', () => {
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

    it('accepts a dimension expression or null', () => {
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
