import type { AnyType } from '@lightdash/common';
import type { ToolSet } from 'ai';
import {
    runWithAiAgentLogContext,
    type AiAgentLogContext,
} from '../../../../logging/aiAgentLogContext';
import { VERSION } from '../../../../version';
import type { AiAgentArgs } from '../types/aiAgent';
import { getAiAgentModelName } from './telemetry';

export const getAgentLogContext = (args: AiAgentArgs): AiAgentLogContext => {
    const { projectUuid, uuid: agentUuid } = args.agentSettings;
    return {
        organizationUuid: args.organizationId,
        projectUuid,
        agentUuid,
        threadUuid: args.threadUuid,
        promptUuid: args.promptUuid,
        toolCallId: null,
        toolName: null,
        model: getAiAgentModelName(args.model),
        serverVersion: VERSION,
        threadUrl: `${args.siteUrl}/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${args.threadUuid}`,
    };
};

/** Each tool runs with the turn's log context plus its own tool call id. */
export const withToolCallLogContext = (
    tools: ToolSet,
    context: AiAgentLogContext,
): ToolSet =>
    Object.fromEntries(
        Object.entries(tools).map(([toolName, toolDef]) => {
            const { execute } = toolDef;
            if (typeof execute !== 'function') return [toolName, toolDef];
            return [
                toolName,
                {
                    ...toolDef,
                    execute: (input: AnyType, options: AnyType) =>
                        runWithAiAgentLogContext(
                            {
                                ...context,
                                toolCallId: options?.toolCallId ?? null,
                                toolName,
                            },
                            () => execute(input, options),
                        ),
                },
            ];
        }),
    ) as ToolSet;
