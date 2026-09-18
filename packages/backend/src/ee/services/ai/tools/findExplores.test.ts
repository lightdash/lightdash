import {
    toolFindExploresOutputSchema,
    toolFindExploresStructuredContentSchema,
} from '@lightdash/common';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { getFindExplores } from './findExplores';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const searchResults: Awaited<ReturnType<FindExploresFn>> = {
    exploreSearchResults: [
        {
            name: 'orders',
            label: 'Orders',
            description: 'All customer orders',
            aiHints: ['Use for revenue questions'],
            searchRank: 0.8,
            joinedTables: ['customers'],
            requiredFilters: [
                {
                    fieldId: 'orders_status',
                    fieldRef: 'orders.status',
                    tableName: 'orders',
                    operator: 'equals',
                    values: ['completed'],
                    required: true,
                },
            ],
        },
    ],
    topMatchingFields: [
        {
            name: 'total_revenue',
            label: 'Total revenue',
            tableName: 'orders',
            fieldType: 'metric',
            searchRank: 0.9,
            chartUsage: 4,
            verifiedChartUsage: 1,
        },
    ],
};

const execute = async (findExplores: FindExploresFn) => {
    const tool = getFindExplores({
        findExplores,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        fieldSearchSize: 50,
        toolDescriptionMaxChars: 240,
    });
    if (!tool.execute) {
        throw new Error('Missing executor');
    }
    return tool.execute(
        { searchQuery: 'revenue' },
        { messages: [], toolCallId: 'tool-call-1' },
    );
};

const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

describe('getFindExplores', () => {
    it('returns the rendered result and the same facts as structured content', async () => {
        const output = await execute(vi.fn().mockResolvedValue(searchResults));

        expect(toolFindExploresOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output).toMatchObject({
            metadata: {
                status: 'success',
                ranking: {
                    searchQuery: 'revenue',
                    exploreSearchResults: [
                        {
                            name: 'orders',
                            label: 'Orders',
                            searchRank: 0.8,
                            joinedTables: ['customers'],
                        },
                    ],
                    topMatchingFields: [
                        { name: 'total_revenue', tableName: 'orders' },
                    ],
                },
            },
            structuredContent: {
                searchQuery: 'revenue',
                searchResults: {
                    count: 1,
                    results: [
                        {
                            name: 'orders',
                            label: 'Orders',
                            searchRank: 0.8,
                            description: 'All customer orders',
                            aiHints: ['Use for revenue questions'],
                            joinedTables: {
                                count: 1,
                                tables: ['customers'],
                            },
                            requiredFilters: [{ fieldId: 'orders_status' }],
                        },
                    ],
                },
                topMatchingFields: {
                    count: 1,
                    fields: [
                        {
                            name: 'total_revenue',
                            exploreName: 'orders',
                            fieldType: 'metric',
                            usageInCharts: 4,
                            usageInVerifiedCharts: 1,
                        },
                    ],
                },
            },
        });

        const parsed = toolFindExploresOutputSchema.parse(output);
        expect(parseJson(parsed.result)).toEqual(parsed.structuredContent);
    });

    it('reports no matches on both surfaces', async () => {
        const output = await execute(vi.fn().mockResolvedValue({}));

        expect(toolFindExploresOutputSchema.safeParse(output).success).toBe(
            true,
        );
        const parsed = toolFindExploresOutputSchema.parse(output);
        const structuredContent = toolFindExploresStructuredContentSchema.parse(
            parsed.structuredContent,
        );
        expect(structuredContent.searchResults.count).toBe(0);
        expect(structuredContent.searchResults.note).toContain(
            'No explore matched your search',
        );
        expect(structuredContent.topMatchingFields.count).toBe(0);
        expect(parsed.result).toContain('No explore matched your search');
        expect(parseJson(parsed.result)).toEqual(structuredContent);
    });

    it('mirrors the error text as structured content', async () => {
        const output = await execute(
            vi.fn().mockRejectedValue(new Error('search index unavailable')),
        );

        expect(toolFindExploresOutputSchema.safeParse(output).success).toBe(
            true,
        );
        const parsed = toolFindExploresOutputSchema.parse(output);
        expect(parsed.metadata).toEqual({ status: 'error' });
        expect(parsed.result).toContain('Error listing explores.');
        expect(parsed.result).toContain('search index unavailable');
        expect(parsed.structuredContent).toEqual({ error: parsed.result });
    });
});
