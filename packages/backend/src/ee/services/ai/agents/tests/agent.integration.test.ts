import {
    AiAgent,
    AiWebAppPrompt,
    AVAILABLE_VISUALIZATION_TYPES,
    CatalogType,
    isDateItem,
} from '@lightdash/common';
import moment from 'moment';
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
import { llmAsAJudge } from './utils/llmAsAJudge';
import { llmAsJudgeForTools } from './utils/llmAsJudgeForTools';
import { setTaskMeta } from './utils/taskMeta';

// Skip if no OpenAI API key
const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeOrSkip = hasApiKey ? describe : describe.skip;

describeOrSkip.concurrent('agent integration tests', () => {
    let context: IntegrationTestContext;
    const TIMEOUT = 60_000;
    let createdAgent: AiAgent | null = null;
    const { model, callOptions } = getOpenaiGptmodel({
        apiKey: process.env.OPENAI_API_KEY!,
        modelName: 'gpt-4.1',
        temperature: process.env.OPENAI_TEMPERATURE
            ? parseFloat(process.env.OPENAI_TEMPERATURE)
            : 0.2,
        responsesApi: false,
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
                    canManageAgent: true,
                },
            );

        return { response, prompt: promptData, threadUuid: threadUuidToUse };
    };

    it(
        'should be able to tell the user what data models are available to explore with their agent',
        async ({ task }) => {
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

            const { data: tables } =
                await services.catalogService.searchExplores({
                    user: context.testUser,
                    projectUuid: createdAgent.projectUuid!,
                    exploreName: null,
                    yamlTags: context.testAgent.tags,
                    searchQuery: null,
                    paginateArgs: {
                        page: 1,
                        pageSize: 100,
                    },
                });

            const tablesText = tables.map((table) => table.name).join(', ');
            const expectedAnswer = `You can explore data models such as ${tablesText}`;
            const { result: factualityEvaluation, meta: factualityMeta } =
                await llmAsAJudge({
                    query: promptQueryText,
                    response,
                    expectedAnswer,
                    model,
                    callOptions,
                    scorerType: 'factuality',
                });

            if (!factualityEvaluation) {
                throw new Error('Factuality evaluation not found');
            }

            const isFactualityPassing =
                factualityEvaluation.answer === 'A' ||
                factualityEvaluation.answer === 'B';

            const toolsEvaluation = await llmAsJudgeForTools({
                prompt: promptQueryText,
                toolCalls,
                expectedOutcome:
                    'It should have skipped the tool calls because the agent has access to the data models already',
                model,
                callOptions,
            });

            // ================================
            // Report creation
            // ================================
            setTaskMeta(task.meta, 'llmJudgeResults', [
                { ...factualityMeta, passed: isFactualityPassing },
            ]);

            setTaskMeta(
                task.meta,
                'toolCalls',
                toolCalls.map((tc) => tc.tool_name),
            );
            setTaskMeta(task.meta, 'prompts', [promptQueryText]);
            setTaskMeta(task.meta, 'responses', [response]);
            setTaskMeta(task.meta, 'llmToolJudgeResults', [toolsEvaluation]);

            // ================================
            // Assertions
            // ================================
            expect(isFactualityPassing).toBe(true);
            expect(toolsEvaluation.passed).toBe(true);
        },
        TIMEOUT,
    );

    it('should be able to get total revenue', async ({ task }) => {
        if (!createdAgent) {
            throw new Error('Agent not created');
        }

        const promptQueryText = 'What is the total revenue?';

        const { response, prompt } = await promptAgent(promptQueryText);

        const toolCalls = await context
            .db<DbAiAgentToolCall>('ai_agent_tool_call')
            .where('ai_prompt_uuid', prompt!.promptUuid)
            .select('*');

        const { result: factualityEvaluation, meta: factualityMeta } =
            await llmAsAJudge({
                query: promptQueryText,
                response,
                expectedAnswer: '3,053.87',
                scorerType: 'factuality',
                model,
                callOptions,
            });

        if (!factualityEvaluation) {
            throw new Error('Factuality evaluation not found');
        }

        const isFactualityPassing =
            factualityEvaluation.answer === 'A' ||
            factualityEvaluation.answer === 'B';

        const toolUsageEvaluation = await llmAsJudgeForTools({
            prompt: promptQueryText,
            toolCalls,
            expectedOutcome:
                'It should have used the findExplores, findFields tool and then the table tool summarize the data to get the total revenue',
            model,
            callOptions,
        });

        // ================================
        // Report creation
        // ================================
        setTaskMeta(task.meta, 'llmJudgeResults', [
            { ...factualityMeta, passed: isFactualityPassing },
        ]);
        setTaskMeta(
            task.meta,
            'toolCalls',
            toolCalls.map((tc) => tc.tool_name),
        );
        setTaskMeta(task.meta, 'prompts', [promptQueryText]);
        setTaskMeta(task.meta, 'responses', [response]);
        setTaskMeta(task.meta, 'llmToolJudgeResults', [toolUsageEvaluation]);

        // ================================
        // Assertions
        // ================================
        expect(isFactualityPassing).toBe(true);
        expect(toolUsageEvaluation.passed).toBe(true);
    });

    it('should generate a time-series chart', async ({ task }) => {
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

        const { result: factualityEvaluation, meta: factualityMeta } =
            await llmAsAJudge({
                query: promptQueryText,
                response,
                expectedAnswer:
                    "I've generated a chart of revenue over time (monthly) using 'Total revenue' metric from the Payments explore. The x-axis represents month and the y-axis represents revenue of that month.",
                scorerType: 'factuality',
                model,
                callOptions,
            });

        if (!factualityEvaluation) {
            throw new Error('Factuality evaluation not found');
        }

        const isFactualityPassing =
            factualityEvaluation.answer === 'A' ||
            factualityEvaluation.answer === 'B';

        const toolUsageEvaluation = await llmAsJudgeForTools({
            prompt: promptQueryText,
            toolCalls,
            expectedOutcome:
                'It should have used the appropriated tools to find information about revenue over time. It must have used the time series tool to generate the chart',
            expectedArgsValidation: [
                {
                    toolName: 'generateTimeSeriesVizConfig',
                    expectedArgs: {
                        vizConfig: {
                            limit: 1000,
                            sorts: [
                                {
                                    fieldId: 'orders_order_date_month',
                                    descending: false,
                                },
                            ],
                            lineType: 'line',
                            yMetrics: ['payments_total_revenue'],
                            xAxisLabel: 'Order date month',
                            xDimension: 'orders_order_date_month',
                            yAxisLabel: 'Total revenue',
                            exploreName: 'payments',
                            breakdownByDimension: null,
                        },
                    },
                },
            ],
            model,
            callOptions,
        });

        // ================================
        // Report creation
        // ================================
        setTaskMeta(task.meta, 'llmJudgeResults', [
            { ...factualityMeta, passed: isFactualityPassing },
        ]);
        setTaskMeta(
            task.meta,
            'toolCalls',
            toolCalls.map((tc) => tc.tool_name),
        );
        setTaskMeta(task.meta, 'prompts', [promptQueryText]);
        setTaskMeta(task.meta, 'responses', [response]);
        setTaskMeta(task.meta, 'llmToolJudgeResults', [toolUsageEvaluation]);

        // ================================
        // Assertions
        // ================================
        expect(isFactualityPassing).toBe(true);
        expect(toolUsageEvaluation.passed).toBe(true);
    });

    it(
        'should retrieve relevant context for a time-based query',
        async ({ task }) => {
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

            const {
                result: contextRelevancyEvaluation,
                meta: contextRelevancyMeta,
            } = await llmAsAJudge({
                query: promptQueryText,
                response,
                context: contextForEval,
                model,
                callOptions,
                scorerType: 'contextRelevancy',
            });

            // The retrieved fields should be highly relevant to the query
            const isContextRelevancyPassing =
                contextRelevancyEvaluation.score >= 0.7;

            // ================================
            // Report creation
            // ================================
            setTaskMeta(task.meta, 'llmJudgeResults', [
                { ...contextRelevancyMeta, passed: isContextRelevancyPassing },
            ]);

            setTaskMeta(
                task.meta,
                'toolCalls',
                toolCalls.map((tc) => tc.tool_name),
            );
            setTaskMeta(task.meta, 'prompts', [promptQueryText]);
            setTaskMeta(task.meta, 'responses', [response]);

            // ================================
            // Assertions
            // ================================
            expect(isContextRelevancyPassing).toBe(true);
        },
        TIMEOUT,
    );

    it(
        'should answer "How many orders were there in 2024?" and generate a one line result',
        async ({ task }) => {
            if (!createdAgent) {
                throw new Error('Agent not created');
            }

            const promptQueryText = 'How many orders were there in 2024?';

            const { response, prompt } = await promptAgent(promptQueryText);

            const toolCalls = await context
                .db<DbAiAgentToolCall>('ai_agent_tool_call')
                .where('ai_prompt_uuid', prompt!.promptUuid)
                .select('*');

            const { result: factualityEvaluation, meta: factualityMeta } =
                await llmAsAJudge({
                    query: promptQueryText,
                    response,
                    expectedAnswer: 'There were 53 orders in 2024',
                    scorerType: 'factuality',
                    model,
                    callOptions,
                });

            if (!factualityEvaluation) {
                throw new Error('Factuality evaluation not found');
            }

            const isFactualityPassing =
                factualityEvaluation.answer === 'A' ||
                factualityEvaluation.answer === 'B';

            // ================================
            // Report creation
            // ================================

            setTaskMeta(task.meta, 'llmJudgeResults', [
                { ...factualityMeta, passed: isFactualityPassing },
            ]);
            setTaskMeta(
                task.meta,
                'toolCalls',
                toolCalls.map((tc) => tc.tool_name),
            );
            setTaskMeta(task.meta, 'prompts', [promptQueryText]);
            setTaskMeta(task.meta, 'responses', [response]);

            // ================================
            // Assertions
            // ================================
            expect(isFactualityPassing).toBe(true);
        },
        TIMEOUT,
    );

    it('gives an intro explanation of what the agent can do', async ({
        task,
    }) => {
        if (!createdAgent) {
            throw new Error('Agent not created');
        }

        const promptQueryText = 'What can you do?';

        const { response, prompt } = await promptAgent(promptQueryText);

        // Fetch tool calls for this test
        const toolCalls = await context
            .db<DbAiAgentToolCall>('ai_agent_tool_call')
            .where('ai_prompt_uuid', prompt!.promptUuid)
            .select('*');

        const availableExplores = await getServices(
            context.app,
        ).catalogService.searchExplores({
            user: context.testUser,
            projectUuid: createdAgent.projectUuid!,
            exploreName: null,
            yamlTags: context.testAgent.tags,
            searchQuery: null,
            paginateArgs: {
                page: 1,
                pageSize: 100,
            },
        });

        const availableExploresText = availableExplores.data
            .map((explore) => explore.name)
            .join(', ');

        const { result: factualityEvaluation, meta: factualityMeta } =
            await llmAsAJudge({
                query: promptQueryText,
                response,
                expectedAnswer: `I can help you analyze your data with the following explores: ${availableExploresText}
                I can give you a summary of the data in each explore, breakdown by categories, show trends over time, and generate charts and tables.
                Chart types available are bar charts, time series charts, and tables.
                `,
                scorerType: 'factuality',
                model,
                callOptions,
            });

        if (!factualityEvaluation) {
            throw new Error('Factuality evaluation not found');
        }

        const isFactualityPassing =
            factualityEvaluation.answer === 'A' ||
            factualityEvaluation.answer === 'B';

        // ================================
        // Report creation
        // ================================
        setTaskMeta(
            task.meta,
            'toolCalls',
            toolCalls.map((tc) => tc.tool_name),
        );
        setTaskMeta(task.meta, 'llmJudgeResults', [
            { ...factualityMeta, passed: isFactualityPassing },
        ]);
        setTaskMeta(
            task.meta,
            'toolCalls',
            toolCalls.map((tc) => tc.tool_name),
        );
        setTaskMeta(task.meta, 'prompts', [promptQueryText]);
        setTaskMeta(task.meta, 'responses', [response]);

        // ================================
        // Assertions
        // ================================
        expect(isFactualityPassing).toBe(true);
    });

    it.sequential(
        'should handle multiple consecutive prompts in the same thread maintaining context',
        async ({ task }) => {
            if (!createdAgent) {
                throw new Error('Agent not created');
            }

            // Should know on prompt 3 to use the same metric as prompt 2
            const prompt1 = 'What data models are available to analyze?';
            const prompt2 = 'Does payments have a metric for total revenue?';
            const prompt3 =
                'Then show me a breakdown of that metric by payment method';

            const { threadUuid, response: response1 } = await promptAgent(
                prompt1,
            );
            const { response: response2 } = await promptAgent(
                prompt2,
                threadUuid,
            );

            const { response: response3, prompt: webPrompt3 } =
                await promptAgent(prompt3, threadUuid);

            const toolCallsForPrompt3 = await context
                .db<DbAiAgentToolCall>('ai_agent_tool_call')
                .where('ai_prompt_uuid', webPrompt3!.promptUuid)
                .select('*');

            // ================================
            // Report creation
            // ================================
            setTaskMeta(
                task.meta,
                'toolCalls',
                toolCallsForPrompt3.map((tc) => tc.tool_name),
            );
            setTaskMeta(task.meta, 'prompts', [prompt1, prompt2, prompt3]);
            setTaskMeta(task.meta, 'responses', [
                response1,
                response2,
                response3,
            ]);
        },
        TIMEOUT * 2, // Double timeout for multiple prompts
    );

    [
        {
            question:
                'What are the order amounts for this year, broken down by order status month over month?',
            expectedExplore: 'orders',
            expectedFields: {
                dimensions: ['Order date month'],
                metrics: ['Total order amount'],
                breakdownByDimension: 'Order status',
                filters: [`Order year ${new Date().getFullYear()}`],
            },
            expectedVisualization: 'time_series_chart',
            maxToolCalls: 3,
        },
        {
            question:
                'Revenue from the last 3 months for the "credit_card" and "coupon" payment method, displayed as a bar chart.',
            expectedExplore: 'payments',
            expectedFields: {
                dimensions: [],
                metrics: ['Total revenue'],
                breakdownByDimension: 'Payment method',
                filters: [
                    `Order date from ${moment()
                        .subtract(3, 'months')
                        .format('YYYY-MM-DD')} to ${moment()
                        .subtract(1, 'months')
                        .format('YYYY-MM-DD')}`,
                    'Payment method (credit_card, coupon)',
                ],
            },
            expectedVisualization: 'vertical_bar_chart',
            maxToolCalls: 3,
        },
    ].forEach((testCase) => {
        describe.concurrent(
            `Evaluating answer for question: ${testCase.question}`,
            () => {
                let toolCalls: DbAiAgentToolCall[] = [];
                let response: string = '';
                let prompt: AiWebAppPrompt | undefined;

                beforeAll(async () => {
                    const agentResponse = await promptAgent(testCase.question);

                    response = agentResponse.response;
                    prompt = agentResponse.prompt;

                    toolCalls = await context
                        .db<DbAiAgentToolCall>('ai_agent_tool_call')
                        .leftJoin(
                            'ai_agent_tool_result',
                            'ai_agent_tool_call.tool_call_id',
                            'ai_agent_tool_result.tool_call_id',
                        )
                        .where(
                            'ai_agent_tool_call.ai_prompt_uuid',
                            prompt!.promptUuid,
                        )
                        .select('*');
                });

                it('should use appropriate tools and not exceed max tool calls', async ({
                    task,
                }) => {
                    const toolsEvaluation = await llmAsJudgeForTools({
                        prompt: testCase.question,
                        toolCalls,
                        expectedOutcome: `Should use appropriate tools to answer "${testCase.question}". Expected to use findExplores to find the ${testCase.expectedExplore} explore, findFields to get relevant fields, and it MUST use the ${testCase.expectedVisualization} tool for visualization. Should not use more than ${testCase.maxToolCalls} tool calls total.`,
                        model,
                        callOptions,
                    });

                    // ================================
                    // Report creation
                    // ================================
                    setTaskMeta(task.meta, 'llmToolJudgeResults', [
                        toolsEvaluation,
                    ]);
                    setTaskMeta(
                        task.meta,
                        'toolCalls',
                        toolCalls.map((tc) => tc.tool_name),
                    );
                    setTaskMeta(task.meta, 'prompts', [testCase.question]);
                    setTaskMeta(task.meta, 'responses', [response]);

                    // ================================
                    // Assertions
                    // ================================
                    expect(toolsEvaluation.passed).toBe(true);
                });

                it(
                    `should get relevant information to answer the question: ${testCase.question}`,
                    async ({ task }) => {
                        if (!createdAgent) throw new Error('Agent not created');

                        const relevancyEvaluation = await llmAsAJudge({
                            query: `Does the tool call results give enough information about the explore and fields to answer the query: '${testCase.question}'?`,
                            response: JSON.stringify(toolCalls),
                            model,
                            callOptions,
                            scorerType: 'contextRelevancy',
                            context: [
                                JSON.stringify(
                                    await getServices(
                                        context.app,
                                    ).projectService.getExplore(
                                        context.testUserSessionAccount,
                                        createdAgent.projectUuid!,
                                        testCase.expectedExplore,
                                    ),
                                ),
                            ],
                        });
                        const isRelevancyPassing =
                            relevancyEvaluation.result.score === 1;

                        // ================================
                        // Report creation
                        // ================================
                        setTaskMeta(task.meta, 'llmJudgeResults', [
                            {
                                ...relevancyEvaluation.meta,
                                passed: isRelevancyPassing,
                            },
                        ]);
                        setTaskMeta(
                            task.meta,
                            'toolCalls',
                            toolCalls.map((tc) => tc.tool_name),
                        );
                        setTaskMeta(task.meta, 'prompts', [testCase.question]);
                        setTaskMeta(task.meta, 'responses', [response]);

                        // ================================
                        // Assertions
                        // ================================
                        expect(isRelevancyPassing).toBe(true);
                    },
                    TIMEOUT,
                );

                it('should answer the question with correct factual information', async ({
                    task,
                }) => {
                    const factualEvaluation = await llmAsAJudge({
                        query: testCase.question,
                        response,
                        expectedAnswer: [
                            `The explore is ${testCase.expectedExplore}.`,
                            `The dimensions are ${testCase.expectedFields.dimensions.join()}.`,
                            `The metrics are ${testCase.expectedFields.metrics.join()}.`,
                            `The breakdown by dimension is ${testCase.expectedFields.breakdownByDimension}.`,
                            `The filters are ${testCase.expectedFields.filters.join()}.`,
                            `The visualization is a ${testCase.expectedVisualization}.`,
                        ].join('\n'),
                        scorerType: 'factuality',
                        model,
                        callOptions,
                    });

                    const isFactualityPassing =
                        factualEvaluation.result.answer === 'A' ||
                        factualEvaluation.result.answer === 'B';

                    // ================================
                    // Report creation
                    // ================================

                    setTaskMeta(task.meta, 'llmJudgeResults', [
                        {
                            ...factualEvaluation.meta,
                            passed: isFactualityPassing,
                        },
                    ]);
                    setTaskMeta(
                        task.meta,
                        'toolCalls',
                        toolCalls.map((tc) => tc.tool_name),
                    );
                    setTaskMeta(task.meta, 'prompts', [testCase.question]);
                    setTaskMeta(task.meta, 'responses', [response]);

                    // ================================
                    // Assertions
                    // ================================
                    expect(isFactualityPassing).toBe(true);
                });
            },
        );
    });

    describe('Limitation response quality', () => {
        const limitationTestCases = [
            {
                name: 'forecasting request',
                prompt: 'Can you forecast the revenue for next quarter?',
                expectedResponse:
                    'I cannot perform statistical forecasting or predictive modeling. I can only work with historical data visualization and aggregation using the explores available this project',
            },
            {
                name: 'unsupported calculated metric request',
                prompt: 'Create a table showing each customer, their total spending on orders, total shipping fees paid, total taxes paid, and the sum of all these costs combined.',
                expectedResponse:
                    'I cannot perform this request exactly as stated because I am unable to create new calculated columns or metrics that combine multiple fields directly in the table output. I can only display existing fields and metrics defined in your data model.',
            },
            {
                name: 'unsupported calculated field request',
                prompt: 'Create a table showing each customer, their customer id, and their full name (first name + last name).',
                expectedResponse:
                    'I cannot perform this request exactly as stated because I am unable to create new calculated columns or fields. I can only display existing fields and metrics defined in your data model.',
            },
            {
                name: 'unsupported custom sql request',
                prompt: 'Write a custom SQL query to join customers and orders and calculate lifetime value (sum of all purchases for each customer over time).',
                expectedResponse:
                    'I cannot perform this request because I am unable to create or execute custom SQL queries directly. I can only use the existing explores, fields, and metrics defined in your data model.',
            },
            {
                name: 'unsupported visualization request',
                prompt: 'Create a scatter chart of total order amount versus region',
                expectedResponse: `I can only create ${AVAILABLE_VISUALIZATION_TYPES.join(
                    ', ',
                )}. I cannot create scatter plots or other advanced visualization types`,
            },
            {
                name: 'conversation history request',
                prompt: 'What did we talk about yesterday?',
                expectedResponse:
                    'I do not have access to previous conversations or memory of past interactions. Each session is stateless, so I can only reference messages from our current conversation.',
            },
        ];

        limitationTestCases.forEach((testCase) => {
            it.concurrent(
                `should provide specific limitations for ${testCase.name}`,
                async ({ task }) => {
                    if (!createdAgent) {
                        throw new Error('Agent not created');
                    }

                    const { response } = await promptAgent(testCase.prompt);

                    const { result: limitationQualityEvaluation, meta } =
                        await llmAsAJudge({
                            query: testCase.prompt,
                            response,
                            expectedAnswer: testCase.expectedResponse,
                            scorerType: 'factuality',
                            model,
                            callOptions,
                        });

                    if (!limitationQualityEvaluation) {
                        throw new Error(
                            'Limitation quality evaluation not found',
                        );
                    }

                    const isLimitationQualityPassing =
                        limitationQualityEvaluation.answer === 'A' ||
                        limitationQualityEvaluation.answer === 'B';

                    // ==========
                    // Report generation
                    // ==========
                    setTaskMeta(task.meta, 'llmJudgeResults', [
                        { ...meta, passed: isLimitationQualityPassing },
                    ]);
                    setTaskMeta(task.meta, 'prompts', [testCase.prompt]);
                    setTaskMeta(task.meta, 'responses', [response]);

                    // ==========
                    // Assertions
                    // ==========
                    expect(isLimitationQualityPassing).toBe(true);
                },
                TIMEOUT,
            );
        });
    });
});
