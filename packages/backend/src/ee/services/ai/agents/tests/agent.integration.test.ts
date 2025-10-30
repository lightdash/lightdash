import {
    AiAgent,
    AVAILABLE_VISUALIZATION_TYPES,
    CatalogType,
    isDateItem,
} from '@lightdash/common';
import moment from 'moment';
import { beforeAll, describe, expect, it } from 'vitest';
import { aiCopilotConfigSchema } from '../../../../../config/aiConfigSchema';
import { getAiConfig } from '../../../../../config/parseConfig';
import { CatalogSearchContext } from '../../../../../models/CatalogModel/CatalogModel';
import {
    getServices,
    getTestContext,
    IntegrationTestContext,
} from '../../../../../vitest.setup.integration';
import { DbAiAgentToolCall } from '../../../../database/entities/ai';
import { getModel } from '../../models';
import { getOpenaiGptmodel } from '../../models/openai-gpt';
import { llmAsAJudge } from './utils/llmAsAJudge';
import { llmAsJudgeForTools } from './utils/llmAsJudgeForTools';
import { promptAndGetToolCalls } from './utils/testHelpers';
import { createTestReport } from './utils/testReportWrapper';

// Skip if no OpenAI API key
const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeOrSkip = hasApiKey ? describe : describe.skip;
const aiCopilotConfig = aiCopilotConfigSchema.parse(getAiConfig());

describeOrSkip.concurrent('agent integration tests', () => {
    let context: IntegrationTestContext;
    const TIMEOUT = 60_000;
    let createdAgent: AiAgent | null = null;

    const agentModel = getModel(aiCopilotConfig);

    const agentInfo = {
        provider: agentModel.providerOptions
            ? Object.keys(agentModel.providerOptions)[0]
            : 'not found',
        model: agentModel.model.modelId,
    };

    // Creating model to be used as judge
    const { model: judge, callOptions } = getOpenaiGptmodel({
        apiKey: process.env.OPENAI_API_KEY!,
        modelName: 'gpt-5-nano-2025-08-07',
        temperature: 0.2,
        responsesApi: false,
        reasoning: {
            enabled: false,
            reasoningEffort: 'medium',
            reasoningSummary: 'auto',
        },
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

    it(
        'should be able to tell the user what data models are available to explore with their agent',
        async (test) => {
            const services = getServices(context.app);
            if (!createdAgent) {
                throw new Error('Agent not created');
            }

            const promptQueryText = 'What data models are available?';

            const { response, toolCalls } = await promptAndGetToolCalls(
                context,
                createdAgent,
                promptQueryText,
            );

            const { data: tables } =
                await services.catalogService.searchCatalog({
                    projectUuid: createdAgent.projectUuid!,
                    catalogSearch: {
                        type: CatalogType.Table,
                    },
                    userAttributes: {},
                    context: CatalogSearchContext.AI_AGENT,
                    paginateArgs: {
                        page: 1,
                        pageSize: 100,
                    },
                });

            const tablesText = tables.map((table) => table.name).join(', ');
            const expectedAnswer = `You can explore data models such as ${tablesText}`;
            const { meta: factualityMeta } = await llmAsAJudge({
                query: promptQueryText,
                response,
                expectedAnswer,
                judge,
                callOptions,
                scorerType: 'factuality',
            });

            const toolsEvaluation = await llmAsJudgeForTools({
                prompt: promptQueryText,
                toolCalls,
                expectedOutcome:
                    'It should have skipped the tool calls because the agent has access to the data models already',
                judge,
                callOptions,
            });

            const report = createTestReport({
                agentInfo,
                prompt: promptQueryText,
                response,
                toolCalls,
            })
                .addLlmJudgeResult(factualityMeta)
                .addLlmToolJudgeResult(toolsEvaluation);

            await report.finalize(test, () => {
                expect(factualityMeta.passed).toBe(true);
                expect(toolsEvaluation.passed).toBe(true);
            });
        },
        TIMEOUT,
    );

    it('should be able to get total revenue', async (test) => {
        if (!createdAgent) {
            throw new Error('Agent not created');
        }

        const promptQueryText = 'What is the total revenue?';

        const { response, toolCalls } = await promptAndGetToolCalls(
            context,
            createdAgent,
            promptQueryText,
        );

        const { meta: factualityMeta } = await llmAsAJudge({
            query: promptQueryText,
            response,
            expectedAnswer: '3,053.87',
            scorerType: 'factuality',
            judge,
            callOptions,
        });

        const toolUsageEvaluation = await llmAsJudgeForTools({
            prompt: promptQueryText,
            toolCalls,
            expectedOutcome:
                'It should have used the findExplores, findFields tool and then the table tool summarize the data to get the total revenue',
            judge,
            callOptions,
        });

        const report = createTestReport({
            agentInfo,
            prompt: promptQueryText,
            response,
            toolCalls,
        })
            .addLlmJudgeResult(factualityMeta)
            .addLlmToolJudgeResult(toolUsageEvaluation);

        await report.finalize(test, () => {
            expect(factualityMeta.passed).toBe(true);
            expect(toolUsageEvaluation.passed).toBe(true);
        });
    });

    it('should generate a time-series chart', async (test) => {
        if (!createdAgent) {
            throw new Error('Agent not created');
        }

        const promptQueryText =
            'Generate a time-series chart of revenue over time monthly';

        const { response, toolCalls } = await promptAndGetToolCalls(
            context,
            createdAgent,
            promptQueryText,
        );

        const { meta: factualityMeta } = await llmAsAJudge({
            query: promptQueryText,
            response,
            expectedAnswer:
                "I've generated a chart of revenue over time (monthly) using 'Total revenue' metric from the Payments explore. The x-axis represents month and the y-axis represents revenue of that month.",
            scorerType: 'factuality',
            judge,
            callOptions,
        });

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
            judge,
            callOptions,
        });

        const report = createTestReport({
            agentInfo,
            prompt: promptQueryText,
            response,
            toolCalls,
        })
            .addLlmJudgeResult(factualityMeta)
            .addLlmToolJudgeResult(toolUsageEvaluation);

        await report.finalize(test, () => {
            expect(factualityMeta.passed).toBe(true);
            expect(toolUsageEvaluation.passed).toBe(true);
        });
    });

    it(
        'should retrieve relevant context for a time-based query',
        async (test) => {
            if (!createdAgent) {
                throw new Error('Agent not created');
            }

            const promptQueryText =
                'Show me revenue by month from the orders data';

            const { response, toolCalls } = await promptAndGetToolCalls(
                context,
                createdAgent,
                promptQueryText,
            );

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

            const { meta: contextRelevancyMeta } = await llmAsAJudge({
                query: promptQueryText,
                response,
                context: contextForEval,
                judge,
                callOptions,
                scorerType: 'contextRelevancy',
            });

            const report = createTestReport({
                agentInfo,
                prompt: promptQueryText,
                response,
                toolCalls,
            }).addLlmJudgeResult(contextRelevancyMeta);

            await report.finalize(test, () => {
                expect(contextRelevancyMeta.passed).toBe(true);
            });
        },
        TIMEOUT,
    );

    it(
        'should answer "How many orders were there in 2024?" and generate a one line result',
        async (test) => {
            if (!createdAgent) {
                throw new Error('Agent not created');
            }

            const promptQueryText = 'How many orders were there in 2024?';

            const { response, toolCalls } = await promptAndGetToolCalls(
                context,
                createdAgent,
                promptQueryText,
            );

            const { meta: factualityMeta } = await llmAsAJudge({
                query: promptQueryText,
                response,
                expectedAnswer: 'There were 53 orders in 2024',
                scorerType: 'factuality',
                judge,
                callOptions,
            });

            const report = createTestReport({
                agentInfo,
                prompt: promptQueryText,
                response,
                toolCalls,
            }).addLlmJudgeResult(factualityMeta);

            await report.finalize(test, () => {
                expect(factualityMeta.passed).toBe(true);
            });
        },
        TIMEOUT,
    );

    it('gives an intro explanation of what the agent can do', async (test) => {
        if (!createdAgent) {
            throw new Error('Agent not created');
        }

        const promptQueryText = 'What can you do?';

        const { response, toolCalls } = await promptAndGetToolCalls(
            context,
            createdAgent,
            promptQueryText,
        );

        const availableExplores = await getServices(
            context.app,
        ).catalogService.searchCatalog({
            projectUuid: createdAgent.projectUuid!,
            catalogSearch: {
                type: CatalogType.Table,
            },
            userAttributes: {},
            context: CatalogSearchContext.AI_AGENT,
        });

        const availableExploresText = availableExplores.data
            .map((explore) => explore.name)
            .join(', ');

        const { meta: factualityMeta } = await llmAsAJudge({
            query: promptQueryText,
            response,
            expectedAnswer: `I can help you analyze your data with the following explores: ${availableExploresText}
                I can give you a summary of the data in each explore, breakdown by categories, show trends over time, and generate charts and tables.
                Chart types available are bar charts, time series charts, and tables.
                `,
            scorerType: 'factuality',
            judge,
            callOptions,
        });

        const report = createTestReport({
            agentInfo,
            prompt: promptQueryText,
            response,
            toolCalls,
        }).addLlmJudgeResult(factualityMeta);

        await report.finalize(test, () => {
            expect(factualityMeta.passed).toBe(true);
        });
    });

    it.sequential(
        'should handle multiple consecutive prompts in the same thread maintaining context',
        async (test) => {
            if (!createdAgent) {
                throw new Error('Agent not created');
            }

            // Should know on prompt 3 to use the same metric as prompt 2
            const prompt1 = 'What data models are available to analyze?';
            const prompt2 = 'Does payments have a metric for total revenue?';
            const prompt3 =
                'Then show me a breakdown of that metric by payment method';

            const { threadUuid, response: response1 } =
                await promptAndGetToolCalls(context, createdAgent, prompt1);
            const { response: response2 } = await promptAndGetToolCalls(
                context,
                createdAgent,
                prompt2,
                threadUuid,
            );

            const { response: response3, toolCalls: toolCallsForPrompt3 } =
                await promptAndGetToolCalls(
                    context,
                    createdAgent,
                    prompt3,
                    threadUuid,
                );

            const report = createTestReport({
                agentInfo,
                prompts: [prompt1, prompt2, prompt3],
                responses: [response1, response2, response3],
                toolCalls: toolCallsForPrompt3,
            });

            await report.finalize(test, () => {
                // Test passes if all prompts complete without error
            });
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

                beforeAll(async () => {
                    if (!createdAgent) {
                        throw new Error('Agent not created');
                    }

                    const agentResponse = await promptAndGetToolCalls(
                        context,
                        createdAgent,
                        testCase.question,
                    );

                    response = agentResponse.response;
                    toolCalls = agentResponse.toolCalls;
                });

                it('should use appropriate tools and not exceed max tool calls', async (test) => {
                    const toolsEvaluation = await llmAsJudgeForTools({
                        prompt: testCase.question,
                        toolCalls,
                        expectedOutcome: `Should use appropriate tools to answer "${testCase.question}". Expected to use findExplores to find the ${testCase.expectedExplore} explore, findFields to get relevant fields, and it MUST use the ${testCase.expectedVisualization} tool for visualization. Should not use more than ${testCase.maxToolCalls} tool calls total.`,
                        judge,
                        callOptions,
                    });

                    const report = createTestReport({
                        agentInfo,
                        prompt: testCase.question,
                        response,
                        toolCalls,
                    }).addLlmToolJudgeResult(toolsEvaluation);

                    await report.finalize(test, () => {
                        expect(toolsEvaluation.passed).toBe(true);
                    });
                });

                it(
                    `should get relevant information to answer the question: ${testCase.question}`,
                    async (test) => {
                        if (!createdAgent) throw new Error('Agent not created');

                        const { meta: relevancyMeta } = await llmAsAJudge({
                            query: `Does the tool call results give enough information about the explore and fields to answer the query: '${testCase.question}'?`,
                            response: JSON.stringify(toolCalls),
                            judge,
                            callOptions,
                            scorerType: 'contextRelevancy',
                            contextRelevancyThreshold: 1.0, // Stricter threshold for this test
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

                        const report = createTestReport({
                            agentInfo,
                            prompt: testCase.question,
                            response,
                            toolCalls,
                        }).addLlmJudgeResult(relevancyMeta);

                        await report.finalize(test, () => {
                            expect(relevancyMeta.passed).toBe(true);
                        });
                    },
                    TIMEOUT,
                );

                it('should answer the question with correct factual information', async (test) => {
                    const { meta: factualityMeta } = await llmAsAJudge({
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
                        judge,
                        callOptions,
                    });

                    const report = createTestReport({
                        agentInfo,
                        prompt: testCase.question,
                        response,
                        toolCalls,
                    }).addLlmJudgeResult(factualityMeta);

                    await report.finalize(test, () => {
                        expect(factualityMeta.passed).toBe(true);
                    });
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
                async (test) => {
                    if (!createdAgent) {
                        throw new Error('Agent not created');
                    }

                    const { response, toolCalls } = await promptAndGetToolCalls(
                        context,
                        createdAgent,
                        testCase.prompt,
                    );

                    const { meta } = await llmAsAJudge({
                        query: testCase.prompt,
                        response,
                        expectedAnswer: testCase.expectedResponse,
                        scorerType: 'factuality',
                        judge,
                        callOptions,
                    });

                    const report = createTestReport({
                        agentInfo,
                        prompt: testCase.prompt,
                        response,
                        toolCalls,
                    }).addLlmJudgeResult(meta);

                    await report.finalize(test, () => {
                        expect(meta.passed).toBe(true);
                    });
                },
                TIMEOUT,
            );
        });
    });
});
