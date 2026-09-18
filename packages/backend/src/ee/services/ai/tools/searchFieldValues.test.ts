import {
    DimensionType,
    FilterOperator,
    FilterType,
    toolSearchFieldValuesExpressionArgsSchema,
    toolSearchFieldValuesOutputSchema,
    type Explore,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { mockOrdersExplore } from '../utils/validationExplore.mock';
import { getSearchFieldValues } from './searchFieldValues';

const execute = async (
    tool: ReturnType<typeof getSearchFieldValues>,
    args: Parameters<NonNullable<typeof tool.execute>>[0],
) => {
    const output = await tool.execute!(args, {
        messages: [],
        toolCallId: 'tool-call-1',
        context: {},
    });
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('getSearchFieldValues', () => {
    it('keeps structured filters when expressions are disabled', async () => {
        const searchFieldValues = vi.fn().mockResolvedValue(['completed']);
        const tool = getSearchFieldValues({
            searchFieldValues,
            getExplore: vi.fn(),
            enableFilterExpressions: false,
        });

        const output = await execute(tool, {
            table: 'orders',
            fieldId: 'orders_status',
            query: 'complete',
            filters: {
                type: 'and',
                dimensions: [
                    {
                        fieldId: 'orders_customer_name',
                        fieldType: DimensionType.STRING,
                        fieldFilterType: FilterType.STRING,
                        operator: FilterOperator.EQUALS,
                        values: ['Alice'],
                    },
                ],
                metrics: null,
                tableCalculations: null,
            },
        });

        expect(output.metadata.status).toBe('success');
        expect(output.structuredContent).toEqual({
            results: ['completed'],
            note: null,
        });
        expect(
            toolSearchFieldValuesOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(searchFieldValues).toHaveBeenCalledWith(
            expect.objectContaining({
                filters: expect.objectContaining({
                    dimensions: expect.objectContaining({
                        and: [
                            expect.objectContaining({
                                target: expect.objectContaining({
                                    fieldId: 'orders_customer_name',
                                }),
                                values: ['Alice'],
                            }),
                        ],
                    }),
                    metrics: expect.objectContaining({ and: [] }),
                    tableCalculations: expect.objectContaining({ and: [] }),
                }),
            }),
        );
    });

    it('resolves expression filters when enabled', async () => {
        const searchFieldValues = vi.fn().mockResolvedValue(['completed']);
        const getExplore = vi
            .fn<(args: { table: string }) => Promise<Explore>>()
            .mockResolvedValue(mockOrdersExplore);
        const tool = getSearchFieldValues({
            searchFieldValues,
            getExplore,
            enableFilterExpressions: true,
        });

        const output = await execute(tool, {
            table: 'orders',
            fieldId: 'orders_status',
            query: 'complete',
            filters:
                'orders_customer_name equals=Alice AND orders_amount greaterThan=100',
        });

        expect(output.metadata.status).toBe('success');
        expect(getExplore).toHaveBeenCalledWith({ table: 'orders' });
        expect(searchFieldValues).toHaveBeenCalledWith(
            expect.objectContaining({
                filters: expect.objectContaining({
                    dimensions: expect.objectContaining({
                        and: [
                            expect.objectContaining({
                                target: expect.objectContaining({
                                    fieldId: 'orders_customer_name',
                                }),
                                values: ['Alice'],
                            }),
                            expect.objectContaining({
                                target: expect.objectContaining({
                                    fieldId: 'orders_amount',
                                }),
                                values: [100],
                            }),
                        ],
                    }),
                    metrics: expect.objectContaining({ and: [] }),
                    tableCalculations: expect.objectContaining({ and: [] }),
                }),
            }),
        );
    });

    it('returns typed expression failures without running a search', async () => {
        const searchFieldValues = vi.fn();
        const tool = getSearchFieldValues({
            searchFieldValues,
            getExplore: vi.fn().mockResolvedValue(mockOrdersExplore),
            enableFilterExpressions: true,
        });

        const output = await execute(tool, {
            table: 'orders',
            fieldId: 'orders_status',
            query: 'complete',
            filters:
                'orders_customer_name equals=Alice OR orders_customer_name equals=Bob',
        });

        expect(output).toMatchInlineSnapshot(`
          {
            "metadata": {
              "status": "error",
            },
            "result": "[FILTER_EXPRESSION_SEARCH_FIELD_VALUES_OR]
          Invalid dimension filter expression.

          Location: line 1, column 38
          Problem: Field-value search filter rules are always combined with AND and cannot use OR.
          How to fix: Keep only dimension rules that should all scope the value search, joined with AND.",
            "structuredContent": {
              "error": "[FILTER_EXPRESSION_SEARCH_FIELD_VALUES_OR]
          Invalid dimension filter expression.

          Location: line 1, column 38
          Problem: Field-value search filter rules are always combined with AND and cannot use OR.
          How to fix: Keep only dimension rules that should all scope the value search, joined with AND.",
            },
          }
        `);
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(
            toolSearchFieldValuesOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(searchFieldValues).not.toHaveBeenCalled();
    });

    it('mirrors search failures as an error envelope', async () => {
        const tool = getSearchFieldValues({
            searchFieldValues: vi
                .fn()
                .mockRejectedValue(new Error('warehouse unavailable')),
            getExplore: vi.fn(),
            enableFilterExpressions: false,
        });

        const output = await execute(tool, {
            table: 'orders',
            fieldId: 'orders_status',
            query: 'complete',
            filters: null,
        });

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error searching field values.');
        expect(output.result).toContain('warehouse unavailable');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(
            toolSearchFieldValuesOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    it('carries the note alongside the values when the search returns one', async () => {
        const note = 'Values come from curated field metadata.';
        const tool = getSearchFieldValues({
            searchFieldValues: vi
                .fn()
                .mockResolvedValue({ results: ['shipped', 42, true], note }),
            getExplore: vi.fn(),
            enableFilterExpressions: false,
        });

        const output = await execute(tool, {
            table: 'orders',
            fieldId: 'orders_status',
            query: 'ship',
            filters: null,
        });

        expect(output).toEqual({
            result: [
                '```json',
                JSON.stringify(
                    { results: ['shipped', 42, true], note },
                    null,
                    2,
                ),
                '```',
            ].join('\n'),
            metadata: { status: 'success' },
            structuredContent: { results: ['shipped', 42, true], note },
        });
        expect(
            toolSearchFieldValuesOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    it('reports no results as an empty success', async () => {
        const tool = getSearchFieldValues({
            searchFieldValues: vi.fn().mockResolvedValue([]),
            getExplore: vi.fn(),
            enableFilterExpressions: false,
        });

        const output = await execute(tool, {
            table: 'orders',
            fieldId: 'orders_status',
            query: 'nothing',
            filters: null,
        });

        expect(output).toEqual({
            result: '```json\n[]\n```',
            metadata: { status: 'success' },
            structuredContent: { results: [], note: null },
        });
        expect(
            toolSearchFieldValuesOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    it.each([
        { name: 'omitted', filters: undefined },
        { name: 'null', filters: null },
    ])(
        'runs an unscoped search without loading Explore metadata when filters are $name',
        async ({ filters }) => {
            const getExplore = vi.fn();
            const searchFieldValues = vi.fn().mockResolvedValue(['shipped']);
            const tool = getSearchFieldValues({
                searchFieldValues,
                getExplore,
                enableFilterExpressions: true,
            });

            const args = toolSearchFieldValuesExpressionArgsSchema.parse({
                table: 'orders',
                fieldId: 'orders_status',
                query: 'ship',
                ...(filters === null ? { filters } : {}),
            });
            const output = await execute(tool, args);

            expect(output).toEqual({
                result: '```json\n[\n  "shipped"\n]\n```',
                metadata: { status: 'success' },
                structuredContent: { results: ['shipped'], note: null },
            });
            expect(getExplore).not.toHaveBeenCalled();
            expect(searchFieldValues).toHaveBeenCalledWith({
                table: 'orders',
                fieldId: 'orders_status',
                query: 'ship',
                filters: undefined,
            });
        },
    );
});
