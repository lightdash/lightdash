import {
    loadMcpToolsToolDefinition,
    type ToolLoadMcpToolsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ExecuteStructuredToolResult } from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';

const editDistance = (left: string, right: string): number => {
    let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
    for (let i = 1; i <= left.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= right.length; j += 1) {
            current[j] = Math.min(
                (current[j - 1] ?? 0) + 1,
                (previous[j] ?? 0) + 1,
                (previous[j - 1] ?? 0) + (left[i - 1] === right[j - 1] ? 0 : 1),
            );
        }
        previous = current;
    }
    return previous[right.length] ?? right.length;
};

const getNearMatches = (name: string, availableNames: string[]): string[] => {
    const maxDistance = Math.max(3, Math.floor(name.length * 0.25));
    return availableNames
        .map((candidate) => ({
            candidate,
            distance: editDistance(name, candidate),
        }))
        .filter(({ distance }) => distance <= maxDistance)
        .sort(
            (a, b) =>
                a.distance - b.distance ||
                a.candidate.localeCompare(b.candidate),
        )
        .slice(0, 3)
        .map(({ candidate }) => candidate);
};

const toolDefinition = loadMcpToolsToolDefinition.for('agent');

export const getLoadMcpTools = (availableNames: string[]) => {
    const available = new Set(availableNames);
    return tool({
        ...toolDefinition,
        execute: async ({
            names,
        }): Promise<
            ExecuteStructuredToolResult<ToolLoadMcpToolsStructuredContent>
        > => {
            const loaded = [
                ...new Set(names.filter((name) => available.has(name))),
            ];
            const unmatched = [
                ...new Set(names.filter((name) => !available.has(name))),
            ].map((name) => ({
                name,
                nearMatches: getNearMatches(name, availableNames),
            }));
            const confirmation =
                loaded.length > 0
                    ? `Loaded MCP tools: ${loaded.join(', ')}.`
                    : 'No MCP tools loaded.';
            const unmatchedLines = unmatched.map(
                ({ name, nearMatches }) =>
                    `- ${name} (near matches: ${nearMatches.join(', ') || 'none'})`,
            );

            return {
                result: [
                    confirmation,
                    ...(unmatchedLines.length > 0
                        ? ['Unmatched names:', ...unmatchedLines]
                        : []),
                ].join('\n'),
                metadata: { status: 'success' },
                structuredContent: { loaded, unmatched },
            };
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};
