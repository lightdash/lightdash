import { toolSearchSemanticLayerOutputSchema } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type { SearchSemanticLayerFn } from '../types/aiAgentDependencies';
import { getSearchSemanticLayer } from './searchSemanticLayer';

const execute = async (
    tool: ReturnType<typeof getSearchSemanticLayer>,
    args: Parameters<NonNullable<typeof tool.execute>>[0],
) => {
    if (!tool.execute) throw new Error('Tool has no execute function');
    const output = await tool.execute(args, {
        messages: [],
        toolCallId: 'tool-call-1',
    });
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

const searchResult: Awaited<ReturnType<SearchSemanticLayerFn>> = {
    fields: [
        {
            name: 'total_revenue',
            label: 'Total revenue',
            tableName: 'orders',
            fieldType: 'metric',
            description: 'Sum of order amounts, net of refunds',
            chartUsage: 3,
            searchRank: 0.9,
        },
        {
            name: 'status',
            label: 'Status',
            tableName: 'orders',
            fieldType: 'dimension',
        },
    ],
    pagination: {
        page: 1,
        pageSize: 200,
        totalPageCount: 2,
        totalResults: 250,
    },
};

const buildTool = (
    searchSemanticLayer: SearchSemanticLayerFn,
    toolDescriptionMaxChars = 1000,
) =>
    getSearchSemanticLayer({
        searchSemanticLayer,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        maxPageSize: 500,
        toolDescriptionMaxChars,
    });

describe('getSearchSemanticLayer', () => {
    it('returns structured content that parses and mirrors the text', async () => {
        const searchSemanticLayer = vi.fn().mockResolvedValue(searchResult);
        const tool = buildTool(searchSemanticLayer);

        const output = await execute(tool, {
            searchQuery: 'revenue',
            type: null,
            page: 1,
            pageSize: null,
        });

        expect(
            toolSearchSemanticLayerOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.metadata.status).toBe('success');
        expect(output.structuredContent).toEqual({
            pagination: {
                page: 1,
                pageSize: 200,
                totalPageCount: 2,
                totalResults: 250,
            },
            fields: [
                {
                    name: 'total_revenue',
                    label: 'Total revenue',
                    exploreName: 'orders',
                    fieldType: 'metric',
                    usageInCharts: 3,
                    description: 'Sum of order amounts, net of refunds',
                },
                {
                    name: 'status',
                    label: 'Status',
                    exploreName: 'orders',
                    fieldType: 'dimension',
                    usageInCharts: 0,
                    description: null,
                },
            ],
        });

        expect(output.result).toContain(
            '<semanticLayerFields page="1" pageSize="200" totalPageCount="2" totalResults="250">',
        );
        expect(output.result).toContain(
            '<field name="total_revenue" label="Total revenue" exploreName="orders" fieldType="metric" usageInCharts="3">',
        );
        expect(output.result).toContain(
            '<description>Sum of order amounts, net of refunds</description>',
        );
        expect(output.result).toContain(
            '<field name="status" label="Status" exploreName="orders" fieldType="dimension" usageInCharts="0"/>',
        );
    });

    it('truncates descriptions identically in text and structured content', async () => {
        const searchSemanticLayer = vi.fn().mockResolvedValue(searchResult);
        const tool = buildTool(searchSemanticLayer, 10);

        const output = await execute(tool, {
            searchQuery: null,
            type: 'metric',
            page: 1,
            pageSize: 50,
        });

        if (!('fields' in output.structuredContent)) {
            throw new Error('Expected success structured content');
        }
        const [revenue] = output.structuredContent.fields;
        expect(revenue.description).toBe('Sum of ord...(truncated)');
        expect(output.result).toContain(
            '<description>Sum of ord...(truncated)</description>',
        );
        expect(searchSemanticLayer).toHaveBeenCalledWith({
            searchQuery: null,
            type: 'metric',
            page: 1,
            pageSize: 50,
        });
    });

    it('reports an empty page when nothing matched', async () => {
        const searchSemanticLayer = vi.fn().mockResolvedValue({
            fields: [],
            pagination: undefined,
        });
        const tool = buildTool(searchSemanticLayer);

        const output = await execute(tool, {
            searchQuery: 'nonexistent',
            type: null,
            page: 1,
            pageSize: null,
        });

        expect(
            toolSearchSemanticLayerOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.structuredContent).toEqual({
            pagination: null,
            fields: [],
        });
        expect(output.result).toContain('<semanticLayerFields>');
        expect(output.result).not.toContain('<field ');
    });

    it('returns an error envelope when the search fails', async () => {
        const searchSemanticLayer = vi
            .fn()
            .mockRejectedValue(new Error('search index unavailable'));
        const tool = buildTool(searchSemanticLayer);

        const output = await execute(tool, {
            searchQuery: 'revenue',
            type: null,
            page: 1,
            pageSize: null,
        });

        expect(
            toolSearchSemanticLayerOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error searching the semantic layer.');
        expect(output.result).toContain('search index unavailable');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
