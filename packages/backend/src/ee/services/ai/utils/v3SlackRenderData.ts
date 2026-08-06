import {
    isAiAgentMcpToolName,
    isAiAgentToolName,
    type AiAgentToolResult,
} from '@lightdash/common';
import type { AiCanonicalPart } from '../../../database/entities/aiAgentV3';
import { normalizeToolOutput } from '../agents/agentV2';

type SlackToolCall = {
    tool_call_id: string;
    tool_name: string;
    tool_args: unknown;
};

export const projectV3SlackToolData = ({
    promptUuid,
    parts,
}: {
    promptUuid: string;
    parts: AiCanonicalPart[];
}): {
    toolCalls: SlackToolCall[];
    toolResults: AiAgentToolResult[];
    artifactVersionUuids: string[];
} => {
    const toolCalls: SlackToolCall[] = [];
    const toolResults: AiAgentToolResult[] = [];
    const artifactVersionUuids: string[] = [];

    parts.forEach((part) => {
        if (part.type === 'artifact' && part.artifactVersionUuid) {
            artifactVersionUuids.push(part.artifactVersionUuid);
            return;
        }
        if (part.type !== 'tool' || !part.toolCallId) return;

        const { toolName, input, state } = part.payload;
        if (typeof toolName !== 'string' || !isAiAgentToolName(toolName)) {
            return;
        }
        toolCalls.push({
            tool_call_id: part.toolCallId,
            tool_name: toolName,
            tool_args: input,
        });
        if (state !== 'output-available' && state !== 'output-error') return;

        const output = normalizeToolOutput(
            state === 'output-error'
                ? (part.payload.error ?? part.payload.output)
                : part.payload.output,
        );
        const metadata =
            output.metadata ??
            (state === 'output-error' ? { status: 'error' as const } : null);
        const base = {
            uuid: part.uuid,
            promptUuid,
            result: output.result,
            createdAt: new Date(0),
            toolCallId: part.toolCallId,
            toolName,
            metadata,
        };
        toolResults.push(
            (isAiAgentMcpToolName(toolName)
                ? { ...base, toolType: 'mcp' as const }
                : {
                      ...base,
                      toolName,
                      toolType: 'built-in' as const,
                  }) as AiAgentToolResult,
        );
    });

    return { toolCalls, toolResults, artifactVersionUuids };
};
