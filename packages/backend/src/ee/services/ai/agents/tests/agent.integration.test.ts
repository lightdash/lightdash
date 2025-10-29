import {
    AiAgent,
    AVAILABLE_VISUALIZATION_TYPES,
    CatalogType,
    isDateItem,
    SEED_PROJECT,
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
import { testCases } from './testCases';
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
            {
                name: 'Integration Test Agent',
                projectUuid: SEED_PROJECT.project_uuid,
                tags: ['ai'],
                integrations: [],
                instruction: '',
                groupAccess: [],
                userAccess: [],
                imageUrl: null,
                enableDataAccess: false,
                enableSelfImprovement: false,
                enableReasoning: false,
                version: 2,
            },
        );
        createdAgent = agent;
    }, TIMEOUT);

    testCases.forEach((testCase) => {
        it.concurrent(
            testCase.name,
            async (test) => {
                const services = getServices(context.app);
                if (!createdAgent) {
                    throw new Error('Agent not created');
                }

                const { response, toolCalls } = await promptAndGetToolCalls(
                    context,
                    createdAgent,
                    testCase.prompt,
                );

                const report = createTestReport({
                    agentInfo,
                    prompt: testCase.prompt,
                    response,
                    toolCalls,
                });

                // Factuality evaluation
                if (testCase.expectedAnswer) {
                    const expectedAnswer =
                        typeof testCase.expectedAnswer === 'function'
                            ? await testCase.expectedAnswer({
                                  services,
                                  agent: createdAgent,
                                  testContext: context,
                              })
                            : testCase.expectedAnswer;

                    const { meta: factualityMeta } = await llmAsAJudge({
                        query: testCase.prompt,
                        response,
                        expectedAnswer,
                        judge,
                        callOptions,
                        scorerType: 'factuality',
                    });

                    report.addLlmJudgeResult(factualityMeta);
                }

                // Tool usage evaluation
                if (testCase.expectedToolOutcome) {
                    const toolsEvaluation = await llmAsJudgeForTools({
                        prompt: testCase.prompt,
                        toolCalls,
                        expectedOutcome: testCase.expectedToolOutcome,
                        expectedArgsValidation: testCase.expectedArgsValidation,
                        judge,
                        callOptions,
                    });

                    report.addLlmToolJudgeResult(toolsEvaluation);
                }

                // Context relevancy evaluation
                if (testCase.contextRelevancy) {
                    const contextForEval =
                        typeof testCase.contextRelevancy.context === 'function'
                            ? await testCase.contextRelevancy.context({
                                  services,
                                  agent: createdAgent,
                                  testContext: context,
                              })
                            : testCase.contextRelevancy.context;

                    const { meta: contextRelevancyMeta } = await llmAsAJudge({
                        query: testCase.prompt,
                        response,
                        context: contextForEval,
                        judge,
                        callOptions,
                        scorerType: 'contextRelevancy',
                        contextRelevancyThreshold:
                            testCase.contextRelevancy.threshold,
                    });

                    report.addLlmJudgeResult(contextRelevancyMeta);
                }

                await report.finalize(test, () => {
                    const reportData = report.getData();

                    // Check all LLM judge results
                    reportData.llmJudgeResults?.forEach((result) => {
                        expect(result.passed).toBe(true);
                    });

                    // Check all tool judge results
                    reportData.llmToolJudgeResults?.forEach((result) => {
                        expect(result.passed).toBe(true);
                    });
                });
            },
            TIMEOUT * testCases.length,
        );
    });

    it.sequential.skip(
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
        describe.concurrent.skip(
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
});
