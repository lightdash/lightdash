import { describe, expect, it } from 'vitest';
import { getSummaryPhase } from './summaryPhase';
import { type ToolCallSummary } from './types';

const settled = (toolCallId: string): ToolCallSummary => ({
    toolCallId,
    toolName: 'runQuery',
    toolArgs: {},
    toolOutput: { result: 'ok' },
    isPreliminary: false,
});
const running = (toolCallId: string): ToolCallSummary => ({
    toolCallId,
    toolName: 'runQuery',
    toolArgs: {},
});
const tools = (...calls: ToolCallSummary[]) => ({
    kind: 'toolGroup' as const,
    calls,
});
const text = { kind: 'text' as const };

describe('getSummaryPhase', () => {
    it('stays working without an artifact', () => {
        expect(
            getSummaryPhase({
                hasArtifacts: false,
                segments: [tools(settled('a')), text],
                toolResults: [],
            }),
        ).toBe('working');
    });

    it('awaits the summary once the artifact landed and tools settled', () => {
        expect(
            getSummaryPhase({
                hasArtifacts: true,
                segments: [text, tools(settled('a'))],
                toolResults: [],
            }),
        ).toBe('awaitingSummary');
    });

    it('stays settled while the summary text streams', () => {
        expect(
            getSummaryPhase({
                hasArtifacts: true,
                segments: [tools(settled('a')), text],
                toolResults: [],
            }),
        ).toBe('writingSummary');
    });

    it('goes back to working when a new tool call starts', () => {
        expect(
            getSummaryPhase({
                hasArtifacts: true,
                segments: [tools(settled('a')), text, tools(running('b'))],
                toolResults: [],
            }),
        ).toBe('working');
    });
});
