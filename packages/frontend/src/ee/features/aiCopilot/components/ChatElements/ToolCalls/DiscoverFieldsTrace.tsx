import { Stack } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallRow } from './ToolCallRow';
import type { ToolCallSummary } from './utils/types';

/** @deprecated History-only trace entry for old discoverFields tool calls. */
export type TraceEntry = {
    toolCallId: string;
    toolName: 'findExplores' | 'findFields';
    toolArgs: unknown;
};

/** @deprecated History-only renderer for old discoverFields tool calls. */
export const DiscoverFieldsTrace: FC<{ trace: TraceEntry[] }> = ({ trace }) => {
    if (!trace || trace.length === 0) return null;

    return (
        <Stack gap={2}>
            {trace.map((entry) => {
                const call: ToolCallSummary = {
                    toolCallId: entry.toolCallId,
                    toolName: entry.toolName,
                    toolArgs:
                        entry.toolArgs &&
                        typeof entry.toolArgs === 'object' &&
                        !Array.isArray(entry.toolArgs)
                            ? (entry.toolArgs as Record<string, unknown>)
                            : {},
                };
                return (
                    <ToolCallRow
                        key={entry.toolCallId}
                        toolName={entry.toolName}
                        toolCalls={[call]}
                        status="done"
                    />
                );
            })}
        </Stack>
    );
};
