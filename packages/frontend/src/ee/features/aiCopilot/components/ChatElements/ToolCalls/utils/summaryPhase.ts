import { type AiAgentToolResult } from '@lightdash/common';
import { isToolCallSettled } from './toolCallFailure';
import { type ToolCallSummary } from './types';

type PhaseSegment =
    | { kind: 'text' }
    | { kind: 'toolGroup'; calls: ToolCallSummary[] };

/** `working` until the artifact landed and every tool call settled; only a new tool call reopens it. */
export type SummaryPhase = 'working' | 'awaitingSummary' | 'writingSummary';

export const getSummaryPhase = ({
    hasArtifacts,
    segments,
    toolResults,
}: {
    hasArtifacts: boolean;
    segments: PhaseSegment[];
    toolResults: AiAgentToolResult[];
}): SummaryPhase => {
    if (!hasArtifacts) return 'working';
    const lastToolIndex = segments.findLastIndex(
        (segment) => segment.kind === 'toolGroup',
    );
    const lastToolGroup = segments[lastToolIndex];
    if (
        lastToolGroup?.kind !== 'toolGroup' ||
        !lastToolGroup.calls.every((call) =>
            isToolCallSettled(call, toolResults),
        )
    ) {
        return 'working';
    }
    return lastToolIndex === segments.length - 1
        ? 'awaitingSummary'
        : 'writingSummary';
};
