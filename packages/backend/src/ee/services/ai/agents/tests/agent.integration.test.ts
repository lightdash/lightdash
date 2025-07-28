import {
    AiAgent,
    AiWebAppPrompt,
    isDateItem,
    SessionAccount,
} from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    getModels,
    getServices,
    getTestContext,
    IntegrationTestContext,
} from '../../../../../vitest.setup.integration';
import { DbAiAgentToolCall } from '../../../../database/entities/ai';
import { getOpenaiGptmodel } from '../../models/openai-gpt';
import { llmAsAJudge } from './utils/llmAsAJudge';

// Skip if no OpenAI API key
const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeOrSkip = hasApiKey ? describe : describe.skip;

describeOrSkip('agent integration tests', () => {
    let context: IntegrationTestContext;
    const TIMEOUT = 60_000;
    let createdAgent: AiAgent | null = null;
    const model = getOpenaiGptmodel({
        apiKey: process.env.OPENAI_API_KEY!,
        modelName: 'gpt-4.1',
    });

    beforeAll(async () => {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is required for integration tests');
        }

        context = getTestContext();
        // Create a test agent
        const agent = await getServices(context.app).aiAgentService.createAgent(
            context.testUser,
            context.testAgent,
        );
        createdAgent = agent;
    }, TIMEOUT);

    const promptAgent = async (
        prompt: string,
    ): Promise<{
        response: string;
        prompt: AiWebAppPrompt | undefined;
    }> => {
        if (!createdAgent) {
            throw new Error('Agent not created');
        }

        const services = getServices(context.app);
        const models = getModels(context.app);

        const thread = await services.aiAgentService.createAgentThread(
            context.testUser,
            createdAgent.uuid,
            {
                prompt,
            },
        );

        if (!thread) {
            throw new Error('Failed to create test thread');
        }

        const threadMessages = await models.aiAgentModel.getThreadMessages(
            context.testUser.organizationUuid!,
            createdAgent.projectUuid,
            thread.uuid,
        );

        const promptData = await models.aiAgentModel.findWebAppPrompt(
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
                    prompt: promptData!,
                    stream: false,
                },
            );

        return { response, prompt: promptData };
    };

    it(
        'should be able to find explores and be factual',
        async () => {
            if (!createdAgent) {
                throw new Error('Agent not created');
            }

            const promptQueryText = 'What data models are available?';

            const { response, prompt } = await promptAgent(promptQueryText);

            const toolCalls = await context
                .db<DbAiAgentToolCall>('ai_agent_tool_call')
                .where('ai_prompt_uuid', prompt!.promptUuid)
                .select('*');

            expect(toolCalls.length).toBeGreaterThan(0);
            expect(toolCalls[0].tool_name).toBe('findExplores');

            const factualityEvaluation = await llmAsAJudge({
                query: promptQueryText,
                response,
                expectedAnswer:
                    'You can explore data models such as Orders, Customers, Payments, Events, Subscriptions, Tracks',
                model,
                scorerType: 'factuality',
            });

            if (!factualityEvaluation) {
                throw new Error('Factuality evaluation not found');
            }

            expect(factualityEvaluation.answer).toBeOneOf(['A', 'B']);
            expect(factualityEvaluation.rationale).toBeDefined();
        },
        TIMEOUT,
    );

    it('should be able to get total revenue', async () => {
        if (!createdAgent) {
            throw new Error('Agent not created');
        }

        const promptQueryText = 'What is the total revenue?';

        const { response, prompt } = await promptAgent(promptQueryText);

        const toolCalls = await context
            .db<DbAiAgentToolCall>('ai_agent_tool_call')
            .where('ai_prompt_uuid', prompt!.promptUuid)
            .select('*');

        expect(toolCalls.length).toBeGreaterThan(0);
        expect(toolCalls[0].tool_name).toBe('findExplores');
        expect(toolCalls[1].tool_name).toBe('findFields');

        const factualityEvaluation = await llmAsAJudge({
            query: promptQueryText,
            response,
            expectedAnswer: '1989.37',
            scorerType: 'factuality',
            model,
        });

        if (!factualityEvaluation) {
            throw new Error('Factuality evaluation not found');
        }

        expect(factualityEvaluation.answer).toBeOneOf(['A', 'B']);
        expect(factualityEvaluation.rationale).toBeDefined();
    });

    it('should generate a time-series chart', async () => {
        if (!createdAgent) {
            throw new Error('Agent not created');
        }

        const promptQueryText =
            'Generate a time-series chart of revenue over time monthly';

        const { response, prompt } = await promptAgent(promptQueryText);

        const toolCalls = await context
            .db<DbAiAgentToolCall>('ai_agent_tool_call')
            .where('ai_prompt_uuid', prompt!.promptUuid)
            .select('*');

        expect(toolCalls.length).toBeGreaterThan(0);
        expect(toolCalls[0].tool_name).toBe('findExplores');
        expect(toolCalls[1].tool_name).toBe('findFields');
        expect(toolCalls[2].tool_name).toBe('generateTimeSeriesVizConfig');

        const vizConfig = JSON.stringify(
            toolCalls.find(
                (toolCall) =>
                    toolCall.tool_name === 'generateTimeSeriesVizConfig',
            )?.tool_args,
        );

        const factualityEvaluation = await llmAsAJudge({
            query: promptQueryText,
            response,
            expectedAnswer:
                "I've been able to generate a time-series chart of revenue over time monthly on the orders explore",
            scorerType: 'factuality',
            model,
        });

        if (!factualityEvaluation) {
            throw new Error('Factuality evaluation not found');
        }

        expect(factualityEvaluation.answer).toBeOneOf(['A', 'B']);
        expect(factualityEvaluation.rationale).toBeDefined();

        const jsonExpected = JSON.stringify({
            title: 'Monthly Orders over time',
            filters: null,
            description:
                'This is a time-series chart that displays the number of orders aggregated by month, showing trends in orders over time.',
            followUpTools: ['generate_time_series_viz'],
            vizConfig: {
                limit: 1000,
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: false },
                ],
                yMetrics: ['orders_total_order_amount'],
                stackBars: null,
                xAxisType: 'time',
                xAxisLabel: 'Order Month',
                xDimension: 'orders_order_date_month',
                yAxisLabel: 'Total Revenue',
                exploreName: 'orders',
                followUpTools: ['generate_time_series_viz'],
                breakdownByDimension: null,
            },
        });

        const jsonDiffEvaluation = await llmAsAJudge({
            model,
            query: promptQueryText,
            response: vizConfig,
            expectedAnswer: jsonExpected,
            scorerType: 'jsonDiff',
        });

        if (!jsonDiffEvaluation) {
            throw new Error('JSON diff evaluation not found');
        }

        expect(jsonDiffEvaluation.score).toBeGreaterThanOrEqual(0.5);
    });

    it(
        'should retrieve relevant context for a time-based query',
        async () => {
            if (!createdAgent) {
                throw new Error('Agent not created');
            }

            const promptQueryText =
                'Show me revenue by month from the orders data';

            const { response, prompt } = await promptAgent(promptQueryText);

            const toolCalls = await context
                .db<DbAiAgentToolCall>('ai_agent_tool_call')
                .leftJoin(
                    'ai_agent_tool_result',
                    'ai_agent_tool_call.tool_call_id',
                    'ai_agent_tool_result.tool_call_id',
                )
                .where('ai_agent_tool_call.ai_prompt_uuid', prompt!.promptUuid)
                .select('*');

            const findFieldsToolCall = toolCalls.find(
                (call) => call.tool_name === 'findFields',
            );
            expect(findFieldsToolCall).toBeDefined();

            if (!findFieldsToolCall?.result) {
                throw new Error('findFields tool call did not have a response');
            }

            const ordersExplore = await getServices(
                context.app,
            ).projectService.getExplore(
                context.testUserSessionAccount,
                createdAgent.projectUuid!,
                'orders',
            );

            // TODO: Check if we should get the fields from the tool call result or from the explore
            const exploreDateFields: string[] = Object.values(
                ordersExplore.tables.orders.dimensions,
            ).reduce((acc: string[], field) => {
                if (isDateItem(field)) {
                    acc.push(
                        `Field: ${field.name}, Label: ${field.label}, Description: ${field.description}`,
                    );
                }
                return acc;
            }, []);

            const contextForEval = [...exploreDateFields, 'Explore: orders'];

            const contextRelevancyEvaluation = await llmAsAJudge({
                query: promptQueryText,
                response,
                context: contextForEval,
                model,
                scorerType: 'contextRelevancy',
            });

            // The retrieved fields should be highly relevant to the query
            expect(contextRelevancyEvaluation.score).toBeGreaterThanOrEqual(
                0.7,
            );
            expect(contextRelevancyEvaluation.reason).toBeDefined();
        },
        TIMEOUT,
    );
});
