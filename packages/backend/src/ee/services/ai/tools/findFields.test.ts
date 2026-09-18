import {
    CatalogType,
    DimensionType,
    FieldType,
    toolFindFieldsOutputSchema,
    type CatalogField,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type {
    FindFieldsFn,
    FindFieldsSearchQueryResult,
    GetExploreFn,
} from '../types/aiAgentDependencies';
import { mockOrdersExplore } from '../utils/validationExplore.mock';
import { getFindFields } from './findFields';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const customerNameField: CatalogField = {
    catalogSearchUuid: 'catalog-search-1',
    type: CatalogType.Field,
    name: 'customer_name',
    label: 'Customer Name',
    fieldType: FieldType.DIMENSION,
    basicType: 'string',
    fieldValueType: DimensionType.STRING,
    tableName: 'orders',
    tableLabel: 'Orders',
    description: 'Name of the customer',
    requiredAttributes: undefined,
    anyAttributes: undefined,
    categories: [],
    chartUsage: 3,
    verifiedChartUsage: 1,
    icon: null,
    aiHints: ['Use for grouping by customer'],
    searchRank: 0.9,
    owner: null,
};

const execute = async (
    tool: ReturnType<typeof getFindFields>,
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

const makeTool = (findFields: FindFieldsFn) =>
    getFindFields({
        getExplore: vi.fn<GetExploreFn>().mockResolvedValue(mockOrdersExplore),
        findFields,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        pageSize: 10,
        toolDescriptionMaxChars: 100,
    });

describe('getFindFields', () => {
    it('returns the same search results as text and structuredContent', async () => {
        const searchResults: FindFieldsSearchQueryResult[] = [
            {
                status: 'success',
                searchQuery: 'Customer Name',
                fields: [customerNameField],
                pagination: {
                    page: 1,
                    pageSize: 10,
                    totalResults: 1,
                    totalPageCount: 1,
                },
            },
            {
                status: 'error',
                searchQuery: 'Missing Field',
                error: 'No fields found',
            },
        ];
        const tool = makeTool(
            vi.fn<FindFieldsFn>().mockResolvedValue(searchResults),
        );

        const output = await execute(tool, {
            table: 'orders',
            fieldSearchQueries: [
                { label: 'Customer Name' },
                { label: 'Missing Field' },
            ],
            page: 1,
        });

        expect(toolFindFieldsOutputSchema.safeParse(output).success).toBe(true);
        expect(output.metadata.status).toBe('success');
        expect(output.structuredContent).toEqual(JSON.parse(output.result));
        expect(output.structuredContent).toEqual({
            searchResults: [
                {
                    status: 'success',
                    searchQuery: 'Customer Name',
                    page: 1,
                    pageSize: 10,
                    totalPageCount: 1,
                    totalResults: 1,
                    fields: [
                        expect.objectContaining({
                            type: FieldType.DIMENSION,
                            baseTable: 'orders',
                            name: 'customer_name',
                            fieldId: 'orders_customer_name',
                            label: 'Customer Name',
                            fieldType: DimensionType.STRING,
                            searchRank: 0.9,
                            chartUsage: 3,
                            usageInVerifiedCharts: 1,
                            isFromJoinedTable: false,
                            caseSensitiveFilters: true,
                            aiHints: ['Use for grouping by customer'],
                            description: 'Name of the customer',
                        }),
                    ],
                },
                {
                    status: 'error',
                    searchQuery: 'Missing Field',
                    error: 'No fields found',
                },
            ],
        });
        expect(output.metadata).toEqual({
            status: 'success',
            ranking: {
                searchQueries: [
                    {
                        status: 'success',
                        label: 'Customer Name',
                        results: [
                            {
                                name: 'customer_name',
                                label: 'Customer Name',
                                tableName: 'orders',
                                fieldType: FieldType.DIMENSION,
                                searchRank: 0.9,
                                chartUsage: 3,
                                verifiedChartUsage: 1,
                            },
                        ],
                        pagination: {
                            page: 1,
                            pageSize: 10,
                            totalResults: 1,
                            totalPageCount: 1,
                        },
                    },
                    {
                        status: 'error',
                        label: 'Missing Field',
                        error: 'No fields found',
                        results: [],
                    },
                ],
            },
        });
    });

    it('returns an empty search result when no fields match', async () => {
        const tool = makeTool(
            vi.fn<FindFieldsFn>().mockResolvedValue([
                {
                    status: 'success',
                    searchQuery: 'Nothing',
                    fields: [],
                    pagination: undefined,
                },
            ]),
        );

        const output = await execute(tool, {
            table: 'orders',
            fieldSearchQueries: [{ label: 'Nothing' }],
            page: null,
        });

        expect(toolFindFieldsOutputSchema.safeParse(output).success).toBe(true);
        expect(output.structuredContent).toEqual(JSON.parse(output.result));
        expect(output.structuredContent).toEqual({
            searchResults: [
                {
                    status: 'success',
                    searchQuery: 'Nothing',
                    page: null,
                    pageSize: null,
                    totalPageCount: null,
                    totalResults: null,
                    fields: [],
                },
            ],
        });
    });

    it('mirrors the error text in structuredContent when the search fails', async () => {
        const tool = makeTool(
            vi
                .fn<FindFieldsFn>()
                .mockRejectedValue(new Error('catalog unavailable')),
        );

        const output = await execute(tool, {
            table: 'orders',
            fieldSearchQueries: [{ label: 'Customer Name' }],
            page: null,
        });

        expect(toolFindFieldsOutputSchema.safeParse(output).success).toBe(true);
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Error finding fields for search queries: Customer Name',
        );
        expect(output.result).toContain('catalog unavailable');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
