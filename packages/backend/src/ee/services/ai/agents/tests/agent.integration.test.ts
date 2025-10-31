import { AiAgent, SEED_PROJECT } from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { aiCopilotConfigSchema } from '../../../../../config/aiConfigSchema';
import { getAiConfig } from '../../../../../config/parseConfig';
import {
    getServices,
    getTestContext,
    IntegrationTestContext,
} from '../../../../../vitest.setup.integration';
import { getModel } from '../../models';
import { getOpenaiGptmodel } from '../../models/openai-gpt';
import { llmAsAJudge } from '../../utils/llmAsAJudge';
import { llmAsJudgeForTools } from '../../utils/llmAsJudgeForTools';
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
        modelName: 'gpt-4.1-2025-04-14',
        temperature: 0.2,
        responsesApi: true,
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
            testCase.name ?? testCase.prompt,
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
});
