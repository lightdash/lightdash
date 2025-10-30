import { AiAgent } from '@lightdash/common';
import type { IntegrationTestContext } from '../../../../../../vitest.setup.integration';
import {
    getModels,
    getServices,
} from '../../../../../../vitest.setup.integration';
import { DbAiAgentToolCall } from '../../../../../database/entities/ai';

export interface PromptAndGetToolCallsResult {
    response: string;
    threadUuid: string;
    toolCalls: Array<DbAiAgentToolCall & { result?: unknown }>;
}

export const promptAndGetToolCalls = async (
    context: IntegrationTestContext,
    createdAgent: AiAgent,
    prompt: string,
    threadUuid?: string,
): Promise<PromptAndGetToolCallsResult> => {
    const services = getServices(context.app);
    const models = getModels(context.app);

    let threadUuidToUse = threadUuid;
    let messageUuid: string;

    if (!threadUuidToUse) {
        const thread = await services.aiAgentService.createAgentThread(
            context.testUser,
            createdAgent.uuid,
            { prompt },
        );

        if (!thread) throw new Error('Failed to create test thread');

        threadUuidToUse = thread.uuid;
        messageUuid = thread.firstMessage!.uuid;
    } else {
        const message = await services.aiAgentService.createAgentThreadMessage(
            context.testUser,
            createdAgent.uuid,
            threadUuidToUse,
            { prompt },
        );
        messageUuid = message.uuid;
    }

    const response = await services.aiAgentService.generateAgentThreadResponse(
        context.testUser,
        {
            agentUuid: createdAgent.uuid,
            threadUuid: threadUuidToUse,
        },
    );

    const toolCalls = await context
        .db<DbAiAgentToolCall>('ai_agent_tool_call')
        .leftJoin(
            'ai_agent_tool_result',
            'ai_agent_tool_call.tool_call_id',
            'ai_agent_tool_result.tool_call_id',
        )
        .where('ai_agent_tool_call.ai_prompt_uuid', messageUuid)
        .select<Array<DbAiAgentToolCall & { result?: unknown }>>('*');

    return {
        response,
        threadUuid: threadUuidToUse,
        toolCalls,
    };
};
