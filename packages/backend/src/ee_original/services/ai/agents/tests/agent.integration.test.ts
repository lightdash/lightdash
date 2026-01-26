import { AiAgent, SEED_PROJECT } from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { aiCopilotConfigSchema } from '../../../../../config/aiConfigSchema';
import { getAiConfig } from '../../../../../config/parseConfig';
import {
    getServices,
    getTestContext,
    IntegrationTestContext,
} from '../../../../../vitest.setup.integration';
import { getModel, MODEL_PRESETS } from '../../models';
import { getOpenaiGptmodel } from '../../models/openai-gpt';
import { getModelPreset } from '../../models/presets';
import {
    calculateRunQueryEfficiencyScore,
    llmAsAJudge,
} from '../../utils/llmAsAJudge';
import { llmAsJudgeForTools } from '../../utils/llmAsJudgeForTools';
import { genericTestCases } from './genericTestCases';
import { testCases } from './testCases';
import { promptAndGetToolCalls } from './utils/testHelpers';
import { createTestReport } from './utils/testReportWrapper';

// Skip if no OpenAI API key
const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeOrSkip = hasApiKey ? describe : describe.skip;
const aiCopilotConfig = aiCopilotConfigSchema.parse(getAiConfig());

describeOrSkip.concurrent('agent integration tests', () => {
    let context: IntegrationTestContext;
    const TIMEOUT = 60_000;
    let specializedAgent: AiAgent | null = null;
    let genericAgent: AiAgent | null = null;

    const agentModel = getModel(aiCopilotConfig);

    const agentInfo = {
        provider: agentModel.providerOptions
            ? Object.keys(agentModel.providerOptions)[0]
            : 'not found',
        model: agentModel.model.modelId,
    };

    // Creating model to be used as judge
    const { model: judge, callOptions } = getOpenaiGptmodel(
        {
            apiKey: process.env.OPENAI_API_KEY!,
            modelName: 'gpt-4.1',
            embeddingModelName: 'text-embedding-3-small',
        },
        getModelPreset('openai', 'gpt-4.1')!,
    );

    beforeAll(async () => {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is required for integration tests');
        }

        context = getTestContext();
        const services = getServices(context.app);

        const enableReasoning = process.env.OPENAI_REASONING_ENABLED === 'true';

        // Create specialized agent with tags
        const specialized = await services.aiAgentService.createAgent(
            context.testUser,
            {
                name: 'Specialized Integration Test Agent',
                description: null,
                projectUuid: SEED_PROJECT.project_uuid,
                tags: ['ai'],
                integrations: [],
                instruction: '',
                groupAccess: [],
                userAccess: [],
                spaceAccess: [],
                imageUrl: null,
                enableDataAccess: true,
                enableSelfImprovement: false,
                enableReasoning,
                version: 2,
            },
        );
        specializedAgent = specialized;

        // Create generic agent with tag "core" (filters out staging models)
        const generic = await services.aiAgentService.createAgent(
            context.testUser,
            {
                name: 'Generic Integration Test Agent',
                projectUuid: SEED_PROJECT.project_uuid,
                tags: ['core'],
                integrations: [],
                instruction: '',
                groupAccess: [],
                userAccess: [],
                spaceAccess: [],
                imageUrl: null,
                enableDataAccess: true,
                enableSelfImprovement: false,
                enableReasoning,
                version: 2,
                description: null,
            },
        );
        genericAgent = generic;
    }, TIMEOUT);

    describe('specialized agent tests', () => {
        testCases.forEach((testCase) => {
            it.concurrent(
                testCase.name ?? testCase.prompt,
                async (test) => {
                    const services = getServices(context.app);
                    if (!specializedAgent) {
                        throw new Error('Specialized agent not created');
                    }

                    const { response, toolCalls } = await promptAndGetToolCalls(
                        context,
                        specializedAgent,
                        testCase.prompt,
                    );

                    const report = createTestReport({
                        agentInfo,
                        prompt: testCase.prompt,
                        response,
                        toolCalls,
                        agentType: 'specialized',
                        agentTags: specializedAgent.tags || [],
                    });

                    // Factuality evaluation
                    if (testCase.expectedAnswer) {
                        const expectedAnswer =
                            typeof testCase.expectedAnswer === 'function'
                                ? await testCase.expectedAnswer({
                                      services,
                                      agent: specializedAgent,
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
                            expectedArgsValidation:
                                testCase.expectedArgsValidation,
                            judge,
                            callOptions,
                        });

                        report.addLlmToolJudgeResult(toolsEvaluation);

                        // RunQuery efficiency evaluation
                        const runQueryCount = toolCalls.filter(
                            (tc) => tc.tool_name === 'runQuery',
                        ).length;
                        const runQueryEfficiencyScore =
                            calculateRunQueryEfficiencyScore(runQueryCount);

                        const runQueryEfficiencyResult = {
                            scorerType: 'runQueryEfficiency' as const,
                            query: testCase.prompt,
                            response,
                            timestamp: new Date().toISOString(),
                            passed: runQueryEfficiencyScore > 0.49,
                            result: {
                                score: runQueryEfficiencyScore,
                                runQueryCount,
                            },
                        };

                        report.addLlmJudgeResult(runQueryEfficiencyResult);
                    }

                    // Context relevancy evaluation
                    if (testCase.contextRelevancy) {
                        const contextForEval =
                            typeof testCase.contextRelevancy.context ===
                            'function'
                                ? await testCase.contextRelevancy.context({
                                      services,
                                      agent: specializedAgent,
                                      testContext: context,
                                  })
                                : testCase.contextRelevancy.context;

                        const { meta: contextRelevancyMeta } =
                            await llmAsAJudge({
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

        it.sequential(
            'should handle multiple consecutive prompts in the same thread maintaining context',
            async (test) => {
                if (!specializedAgent) {
                    throw new Error('Specialized agent not created');
                }

                // Should know on prompt 3 to use the same metric as prompt 2
                const prompt1 = 'What data models are available to analyze?';
                const prompt2 =
                    'Does payments have a metric for total revenue?';
                const prompt3 =
                    'Then show me a breakdown of that metric by payment method';

                const { threadUuid, response: response1 } =
                    await promptAndGetToolCalls(
                        context,
                        specializedAgent,
                        prompt1,
                    );
                const { response: response2 } = await promptAndGetToolCalls(
                    context,
                    specializedAgent,
                    prompt2,
                    threadUuid,
                );

                const { response: response3, toolCalls: toolCallsForPrompt3 } =
                    await promptAndGetToolCalls(
                        context,
                        specializedAgent,
                        prompt3,
                        threadUuid,
                    );

                const report = createTestReport({
                    agentInfo,
                    prompts: [prompt1, prompt2, prompt3],
                    responses: [response1, response2, response3],
                    toolCalls: toolCallsForPrompt3,
                    agentType: 'specialized',
                    agentTags: specializedAgent.tags || [],
                });

                await report.finalize(test, () => {
                    // Test passes if all prompts complete without error
                });
            },
            TIMEOUT * 2, // Double timeout for multiple prompts
        );
    });

    describe('generic agent tests', () => {
        genericTestCases.forEach((testCase) => {
            it.concurrent(
                testCase.name ?? testCase.prompt,
                async (test) => {
                    const services = getServices(context.app);
                    if (!genericAgent) {
                        throw new Error('Generic agent not created');
                    }

                    const { response, toolCalls } = await promptAndGetToolCalls(
                        context,
                        genericAgent,
                        testCase.prompt,
                    );

                    const report = createTestReport({
                        agentInfo,
                        prompt: testCase.prompt,
                        response,
                        toolCalls,
                        agentType: 'generic',
                        agentTags: genericAgent.tags || [],
                    });

                    // Factuality evaluation
                    if (testCase.expectedAnswer) {
                        const expectedAnswer =
                            typeof testCase.expectedAnswer === 'function'
                                ? await testCase.expectedAnswer({
                                      services,
                                      agent: genericAgent,
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
                            expectedArgsValidation:
                                testCase.expectedArgsValidation,
                            judge,
                            callOptions,
                        });

                        report.addLlmToolJudgeResult(toolsEvaluation);

                        // RunQuery efficiency evaluation
                        const runQueryCount = toolCalls.filter(
                            (tc) => tc.tool_name === 'runQuery',
                        ).length;
                        const runQueryEfficiencyScore =
                            calculateRunQueryEfficiencyScore(runQueryCount);

                        const runQueryEfficiencyResult = {
                            scorerType: 'runQueryEfficiency' as const,
                            query: testCase.prompt,
                            response,
                            timestamp: new Date().toISOString(),
                            passed: runQueryEfficiencyScore > 0.49,
                            result: {
                                score: runQueryEfficiencyScore,
                                runQueryCount,
                            },
                        };

                        report.addLlmJudgeResult(runQueryEfficiencyResult);
                    }

                    // Context relevancy evaluation
                    if (testCase.contextRelevancy) {
                        const contextForEval =
                            typeof testCase.contextRelevancy.context ===
                            'function'
                                ? await testCase.contextRelevancy.context({
                                      services,
                                      agent: genericAgent,
                                      testContext: context,
                                  })
                                : testCase.contextRelevancy.context;

                        const { meta: contextRelevancyMeta } =
                            await llmAsAJudge({
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
                TIMEOUT * genericTestCases.length,
            );
        });
    });
});
