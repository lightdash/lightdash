import { describe, expect, it } from 'vitest';
import {
    estimateEnabledMcpToolDefinitionTokens,
    estimateMcpToolDefinitionTokens,
    formatTokenEstimate,
} from './mcpToolTokenEstimates';

const shortTool = {
    toolName: 'find_issue',
    description: 'Find one issue',
    inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
    },
};

describe('MCP tool token estimates', () => {
    it('estimates larger definitions as using more tokens', () => {
        const shortEstimate = estimateMcpToolDefinitionTokens(
            shortTool,
            'Linear',
        );
        const longEstimate = estimateMcpToolDefinitionTokens(
            {
                ...shortTool,
                description:
                    'Find one issue and return its full activity history',
                inputSchema: {
                    ...shortTool.inputSchema,
                    properties: {
                        ...shortTool.inputSchema.properties,
                        includeComments: { type: 'boolean' },
                        includeRelations: { type: 'boolean' },
                    },
                },
            },
            'Linear',
        );

        expect(shortEstimate).toBeGreaterThan(0);
        expect(longEstimate).toBeGreaterThan(shortEstimate);
    });

    it('accounts for the UTF-8 size of non-ASCII definitions', () => {
        expect(
            estimateMcpToolDefinitionTokens(
                {
                    ...shortTool,
                    description: '🔍🔍🔍🔍',
                },
                'Linear',
            ),
        ).toBeGreaterThan(
            estimateMcpToolDefinitionTokens(
                {
                    ...shortTool,
                    description: 'aaaa',
                },
                'Linear',
            ),
        );
    });

    it('counts only enabled definitions in totals', () => {
        expect(
            estimateEnabledMcpToolDefinitionTokens(
                [
                    { ...shortTool, enabled: true },
                    {
                        ...shortTool,
                        toolName: 'list_issues',
                        enabled: false,
                    },
                ],
                'Linear',
            ),
        ).toBe(estimateMcpToolDefinitionTokens(shortTool, 'Linear'));
    });

    it('formats compact approximate counts', () => {
        expect(formatTokenEstimate(640)).toBe('640');
        expect(formatTokenEstimate(1_100)).toBe('1.1k');
        expect(formatTokenEstimate(24_600)).toBe('24.6k');
    });
});
