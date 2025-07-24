import { beforeAll, describe, expect, it } from 'vitest';
import {
    getModels,
    getServices,
    getTestContext,
    IntegrationTestContext,
} from '../../../../../vitest.setup.integration';
import { DbAiAgentToolCall } from '../../../../database/entities/ai';
import { AiAgentService } from '../../../AiAgentService';

// Skip if no OpenAI API key
const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeOrSkip = hasApiKey ? describe : describe.skip;

describeOrSkip('agent integration tests', () => {
    let context: IntegrationTestContext;
    const TIMEOUT = 60_000;

    beforeAll(async () => {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is required for integration tests');
        }
        context = getTestContext();
    }, TIMEOUT);

    it(
        'should successfully create agent and generate response',
        async () => {
            const services = getServices(context.app);
            const models = getModels(context.app);

            // Create a test agent
            const agent = await services.aiAgentService.createAgent(
                context.testUser,
                context.testAgent,
            );

            // Create a test thread
            const thread = await services.aiAgentService.createAgentThread(
                context.testUser,
                agent.uuid,
                {
                    prompt: 'What data models are available?',
                },
            );

            if (!thread) {
                throw new Error('Failed to create test thread');
            }

            const threadMessages = await models.aiAgentModel.getThreadMessages(
                context.testUser.organizationUuid!,
                agent.projectUuid,
                thread.uuid,
            );

            const prompt = await models.aiAgentModel.findWebAppPrompt(
                threadMessages.at(-1)!.ai_prompt_uuid,
            );

            const chatHistoryMessages =
                await services.aiAgentService.getChatHistoryFromThreadMessages(
                    threadMessages,
                );

            const response =
                await services.aiAgentService.generateOrStreamAgentResponse(
                    context.testUser,
                    chatHistoryMessages,
                    {
                        prompt: prompt!,
                        stream: false,
                    },
                );

            const toolCalls = await context
                .db<DbAiAgentToolCall>('ai_agent_tool_call')
                .where('ai_prompt_uuid', prompt!.promptUuid)
                .select('*');

            expect(toolCalls.length).toBeGreaterThan(0);
            expect(toolCalls[0].tool_name).toBe('findExplores');

            expect(typeof response).toBe('string');
            // TODO: check if response contains the expected data
            // TODO: add evaluation
        },
        TIMEOUT,
    );
});
