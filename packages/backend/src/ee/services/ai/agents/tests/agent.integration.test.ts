import {
    AiAgent,
    AiWebAppPrompt,
    CatalogType,
    isDateItem,
    toolFindFieldsArgsSchema,
    toolTableVizArgsSchema,
    toolTimeSeriesArgsSchema,
    toolVerticalBarArgsSchema,
} from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { CatalogSearchContext } from '../../../../../models/CatalogModel/CatalogModel';
import {
    getModels,
    getServices,
    getTestContext,
    IntegrationTestContext,
} from '../../../../../vitest.setup.integration';
import { DbAiAgentToolCall } from '../../../../database/entities/ai';
import { getOpenaiGptmodel } from '../../models/openai-gpt';
import { getGenerateBarVizConfig } from '../../tools/generateBarVizConfig';
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
        threadUuid?: string,
    ): Promise<{
        response: string;
        prompt: AiWebAppPrompt | undefined;
        threadUuid: string;
    }> => {
        if (!createdAgent) {
            throw new Error('Agent not created');
        }

        let threadUuidToUse = threadUuid;

        const services = getServices(context.app);
        const models = getModels(context.app);

        if (threadUuidToUse) {
            // Add message to existing thread
            await models.aiAgentModel.createWebAppPrompt({
                threadUuid: threadUuidToUse,
                createdByUserUuid: context.testUser.userUuid,
                prompt,
            });
        } else {
            // Create new thread
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
            threadUuidToUse = thread.uuid;
        }

        const threadMessages = await models.aiAgentModel.getThreadMessages(
            context.testUser.organizationUuid!,
            createdAgent.projectUuid,
            threadUuidToUse,
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

        return { response, prompt: promptData, threadUuid: threadUuidToUse };
    };

    it(
        'should be able to tell the user what data models are available to explore with their agent',
        async () => {
            const services = getServices(context.app);
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

            const { data: tables } =
                await services.catalogService.searchCatalog({
                    projectUuid: createdAgent.projectUuid!,
                    catalogSearch: {
                        type: CatalogType.Table,
                        yamlTags: context.testAgent.tags ?? undefined,
                    },
                    userAttributes: {},
                    context: CatalogSearchContext.AI_AGENT,
                    paginateArgs: {
                        page: 1,
                        pageSize: 100,
                    },
                    tables: null,
                });

            const tablesText = tables.map((table) => table.name).join(', ');

            const factualityEvaluation = await llmAsAJudge({
                query: promptQueryText,
                response,
                expectedAnswer: `You can explore data models such as ${tablesText}`,
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

        const generateTableVizConfigToolCall = toolCalls.find(
            (call) => call.tool_name === 'generateTableVizConfig',
        );
        expect(generateTableVizConfigToolCall).toBeDefined();
        const generateTableVizConfigToolCallParsed =
            toolTableVizArgsSchema.safeParse(
                generateTableVizConfigToolCall?.tool_args,
            );
        expect(generateTableVizConfigToolCallParsed.success).toBe(true);
        expect(generateTableVizConfigToolCallParsed.data?.vizConfig.limit).toBe(
            1,
        );

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
        const findFieldsToolCallParsed = toolFindFieldsArgsSchema.safeParse(
            toolCalls[1].tool_args,
        );
        expect(findFieldsToolCallParsed.success).toBe(true);
        expect(findFieldsToolCallParsed.data?.table).toBe('payments');
        findFieldsToolCallParsed.data?.fieldSearchQueries.forEach((field) => {
            expect(field.label).toMatch(/revenue|month/i);
        });

        expect(toolCalls[2].tool_name).toBe('generateTimeSeriesVizConfig');

        const generateTimeSeriesVizConfigToolCallParsed =
            toolTimeSeriesArgsSchema.safeParse(toolCalls[2].tool_args);
        expect(generateTimeSeriesVizConfigToolCallParsed.success).toBe(true);

        const vizConfig =
            generateTimeSeriesVizConfigToolCallParsed.data?.vizConfig;

        const factualityEvaluation = await llmAsAJudge({
            query: promptQueryText,
            response,
            expectedAnswer:
                "I've generated a chart of revenue over time (monthly) with Payments explore, order date month on the x axis and total revenue on the y axis",
            scorerType: 'factuality',
            model,
        });

        if (!factualityEvaluation) {
            throw new Error('Factuality evaluation not found');
        }

        expect(factualityEvaluation.answer).toBeOneOf(['A', 'B']);
        expect(factualityEvaluation.rationale).toBeDefined();

        const vizConfigExpected = {
            limit: 1000,
            sorts: [{ fieldId: 'orders_order_date_month', descending: false }],
            lineType: 'line',
            yMetrics: ['payments_total_revenue'],
            xAxisLabel: 'Order date month',
            xDimension: 'orders_order_date_month',
            yAxisLabel: 'Total revenue',
            exploreName: 'payments',
            breakdownByDimension: null,
        };

        const vizConfigJsonDiffEvaluation = await llmAsAJudge({
            model,
            query: promptQueryText,
            response: JSON.stringify(vizConfig),
            expectedAnswer: JSON.stringify(vizConfigExpected),
            scorerType: 'jsonDiff',
        });

        if (!vizConfigJsonDiffEvaluation) {
            throw new Error('JSON diff evaluation not found');
        }

        expect(vizConfigJsonDiffEvaluation.score).toBeGreaterThanOrEqual(0.9);
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

    it(
        'should answer "How many orders were there in 2018?" and generate a one line result',
        async () => {
            if (!createdAgent) {
                throw new Error('Agent not created');
            }

            const promptQueryText = 'How many orders were there in 2018?';

            const { response, prompt } = await promptAgent(promptQueryText);

            const toolCalls = await context
                .db<DbAiAgentToolCall>('ai_agent_tool_call')
                .where('ai_prompt_uuid', prompt!.promptUuid)
                .select('*');

            // Should have exactly 3 tool calls in sequence
            expect(toolCalls.length).toBe(3);

            // First tool call: findExplores
            expect(toolCalls[0].tool_name).toBe('findExplores');
            expect(toolCalls[0].tool_args).toEqual({
                page: 1,
                type: 'find_explores',
            });

            // Second tool call: findFields with specific search for order count and date
            expect(toolCalls[1].tool_name).toBe('findFields');
            expect(toolCalls[1].tool_args).toEqual({
                page: 1,
                type: 'find_fields',
                table: 'orders',
                fieldSearchQueries: [
                    { label: 'Unique order count' },
                    { label: 'Order date year' },
                ],
            });

            // Third tool call: generateTableVizConfig with 2018 filter
            expect(toolCalls[2].tool_name).toBe('generateTableVizConfig');

            const tableVizArgsParsed = toolTableVizArgsSchema.safeParse(
                toolCalls[2].tool_args,
            );

            if (!tableVizArgsParsed.success) {
                throw new Error('Failed to parse table viz args');
            }

            const tableVizArgs = tableVizArgsParsed.data;

            expect(tableVizArgs.filters?.dimensions?.[0]).toMatchObject({
                rule: { values: ['2018'], operator: 'equals' },
                type: 'or',
                target: {
                    type: 'date',
                    fieldId: 'orders_order_date_year',
                },
            });

            expect(tableVizArgs.vizConfig.metrics).toContain(
                'orders_unique_order_count',
            );
            expect(tableVizArgsParsed.data.vizConfig.exploreName).toBe(
                'orders',
            );

            const factualityEvaluation = await llmAsAJudge({
                query: promptQueryText,
                response,
                expectedAnswer: 'There were 99 orders in 2018',
                scorerType: 'factuality',
                model,
            });

            if (!factualityEvaluation) {
                throw new Error('Factuality evaluation not found');
            }

            expect(factualityEvaluation.answer).toBeOneOf(['A', 'B']);
            expect(factualityEvaluation.rationale).toBeDefined();
        },
        TIMEOUT,
    );

    it('gives an intro explanation of what the agent can do', async () => {
        if (!createdAgent) {
            throw new Error('Agent not created');
        }

        const promptQueryText = 'What can you do?';

        const { response } = await promptAgent(promptQueryText);

        const availableExplores = await getServices(
            context.app,
        ).catalogService.searchCatalog({
            projectUuid: createdAgent.projectUuid!,
            catalogSearch: {
                type: CatalogType.Table,
                yamlTags: context.testAgent.tags ?? undefined,
            },
            userAttributes: {},
            context: CatalogSearchContext.AI_AGENT,
            tables: null,
        });

        const availableExploresText = availableExplores.data
            .map((explore) => explore.name)
            .join(', ');

        const factualityEvaluation = await llmAsAJudge({
            query: promptQueryText,
            response,
            expectedAnswer: `I can help you analyze your data with the following explores: ${availableExploresText}
                I can give you a summary of the data in each explore, breakdown by categories, show trends over time, and generate charts and tables.
                Chart types available are bar charts, time series charts, and tables.
                `,
            scorerType: 'factuality',
            model,
        });

        if (!factualityEvaluation) {
            throw new Error('Factuality evaluation not found');
        }

        expect(factualityEvaluation.answer).toBeOneOf(['A', 'B']);
        expect(factualityEvaluation.rationale).toBeDefined();
    });

    it(
        'should handle multiple consecutive prompts in the same thread maintaining context',
        async () => {
            if (!createdAgent) {
                throw new Error('Agent not created');
            }

            // Should know on prompt 3 to use the same metric as prompt 2
            const prompt1 = 'What data models are available to analyze?';
            const prompt2 = 'Does payments have a metric for total revenue?';
            const prompt3 =
                'Then show me a breakdown of that metric by payment method';

            const { threadUuid } = await promptAgent(prompt1);
            await promptAgent(prompt2, threadUuid);

            const {
                response: response3,
                prompt: webPrompt3,
                threadUuid: threadUuid3,
            } = await promptAgent(prompt3, threadUuid);

            const toolCalls = await context
                .db<DbAiAgentToolCall>('ai_agent_tool_call')
                .where('ai_prompt_uuid', webPrompt3!.promptUuid)
                .select('*');

            expect(toolCalls.length).toBe(2);

            expect(toolCalls[0].tool_name).toBe('findFields');
            const findFieldsArgs = toolFindFieldsArgsSchema.safeParse(
                toolCalls[0].tool_args,
            );
            expect(findFieldsArgs.success).toBe(true);
            expect(findFieldsArgs.data?.table).toBe('payments');
            expect(
                findFieldsArgs.data?.fieldSearchQueries.some((q) =>
                    q.label.toLowerCase().includes('payment method'),
                ),
            ).toBe(true);
            expect(toolCalls[1].tool_name).toBe('generateBarVizConfig');
            const barVizArgs = toolVerticalBarArgsSchema.safeParse(
                toolCalls[1].tool_args,
            );
            expect(barVizArgs.success).toBe(true);
            expect(barVizArgs.data?.vizConfig.yMetrics).toContain(
                'payments_total_revenue',
            );

            expect(barVizArgs.data?.vizConfig.xDimension).toBe(
                'payments_payment_method',
            );
            expect(barVizArgs.data?.vizConfig.exploreName).toBe('payments');
        },
        TIMEOUT * 2, // Double timeout for multiple prompts
    );
});
