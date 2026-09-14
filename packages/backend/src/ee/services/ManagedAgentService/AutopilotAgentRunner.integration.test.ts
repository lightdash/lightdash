import { DEFAULT_MANAGED_AGENT_POLICY } from '@lightdash/common';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parseConfig } from '../../../config/parseConfig';
import { getModel } from '../ai/models';
import {
    getAiCallTelemetry,
    getLanguageModelAttribution,
} from '../ai/utils/aiCallTelemetry';
import { runAutopilotAgent } from './AutopilotAgentRunner';
import { renderAutopilotAgent } from './config/agent';

const provider = process.env.AUTOPILOT_EVAL_PROVIDER;
const supportedProvider =
    provider === 'anthropic' ||
    provider === 'openai' ||
    provider === 'bedrock' ||
    provider === 'azure'
        ? provider
        : null;

// Schema/loop smoke test against a real provider; no application data or writes.
describe.skipIf(!provider)('Autopilot provider contract smoke', () => {
    it.each(['observe', 'flag', 'cleanup'] as const)(
        '%s accepts the action schemas and finishes an empty-project checklist',
        async (aggression) => {
            if (!supportedProvider)
                throw new Error(
                    'AUTOPILOT_EVAL_PROVIDER must be anthropic, openai, bedrock, or azure',
                );
            const config = parseConfig().ai.copilot;
            const { model, callOptions, providerOptions, keyManagement } =
                getModel(config, {
                    provider: supportedProvider,
                    modelName: process.env.AUTOPILOT_EVAL_MODEL,
                    enableReasoning: true,
                });
            const steps: Array<{
                inputTokens: number;
                outputTokens: number;
                tools: string[];
            }> = [];
            const calls: string[] = [];
            const started = Date.now();
            const result = await runAutopilotAgent({
                model,
                callOptions: { ...callOptions, maxRetries: 0 },
                providerOptions,
                agent: renderAutopilotAgent({
                    runtime: 'ai-sdk',
                    policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression },
                }),
                dataTools: {},
                availableExplores: [],
                projectName: 'Empty provider smoke fixture',
                maxSteps: 16,
                timeoutMs: 90_000,
                telemetry: getAiCallTelemetry({
                    functionId: 'autopilotProviderSmoke',
                    feature: 'managed-agent',
                    keyManagement,
                    ...getLanguageModelAttribution(model),
                }),
                executeTool: async (name) => {
                    calls.push(name);
                    return JSON.stringify({
                        items: [],
                        actions: [],
                        charts: [],
                        dashboards: [],
                        totalCount: 0,
                        truncated: false,
                        note: 'This fixture has no content, users, queries, or findings.',
                    });
                },
                onStepFinish: (step) => {
                    steps.push({
                        inputTokens: step.usage.inputTokens ?? 0,
                        outputTokens: step.usage.outputTokens ?? 0,
                        tools: step.toolCalls.map((call) => call.toolName),
                    });
                },
            });
            const directory = process.env.AUTOPILOT_EVAL_OUTPUT_DIR;
            if (directory) {
                await mkdir(directory, { recursive: true });
                await writeFile(
                    path.join(
                        directory,
                        `${supportedProvider}-${aggression}.json`,
                    ),
                    JSON.stringify(
                        {
                            kind: 'provider-contract-smoke',
                            provider: supportedProvider,
                            model: model.modelId,
                            aggression,
                            elapsedMs: Date.now() - started,
                            result,
                            steps,
                            calls,
                        },
                        null,
                        2,
                    ),
                );
            }
            expect(result.error).toBeNull();
            expect(result.slackSummary).toBeTruthy();
            expect(
                calls.filter((name) =>
                    [
                        'flag_content',
                        'soft_delete_content',
                        'bulk_delete_broken_content',
                        'fix_broken_chart',
                        'create_content_from_code',
                    ].includes(name),
                ),
            ).toEqual([]);
        },
        100_000,
    );
});
