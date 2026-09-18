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
import {
    recordAutopilotContextStep,
    type AutopilotContextStep,
} from './contextEval';
import { createAutopilotContextFixture } from './contextEval.fixtures';

const provider = process.env.AUTOPILOT_EVAL_PROVIDER;
const contextBenchmark = process.env.AUTOPILOT_EVAL_SCENARIO === 'context';
const paginationBenchmark =
    process.env.AUTOPILOT_EVAL_SCENARIO === 'pagination';
const supportedProvider =
    provider === 'anthropic' ||
    provider === 'openai' ||
    provider === 'bedrock' ||
    provider === 'azure'
        ? provider
        : null;

// Schema/loop smoke test against a real provider; no application data or writes.
describe.skipIf(!provider || contextBenchmark || paginationBenchmark)(
    'Autopilot provider contract smoke',
    () => {
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
    },
);

// Real model calls over synthetic service-shaped responses; no application writes.
describe.skipIf(!provider || !contextBenchmark)(
    'Autopilot context benchmark',
    () => {
        it.each(['shared-model', 'many-models'] as const)(
            '%s retains capped detail and complete group responses',
            async (scenario) => {
                if (!supportedProvider)
                    throw new Error('Unsupported AUTOPILOT_EVAL_PROVIDER');
                const fixture = createAutopilotContextFixture(scenario);
                const config = parseConfig().ai.copilot;
                const { model, callOptions, providerOptions, keyManagement } =
                    getModel(config, {
                        provider: supportedProvider,
                        modelName: process.env.AUTOPILOT_EVAL_MODEL,
                        enableReasoning: true,
                    });
                const agent = renderAutopilotAgent({
                    policy: {
                        ...DEFAULT_MANAGED_AGENT_POLICY,
                        aggression: 'observe',
                    },
                });
                const calls: string[] = [];
                const steps: AutopilotContextStep[] = [];
                const started = Date.now();
                const result = await runAutopilotAgent({
                    model,
                    callOptions: { ...callOptions, maxRetries: 0 },
                    providerOptions,
                    agent: {
                        ...agent,
                        system: `${agent.system}
For this synthetic context benchmark only, replace the maintenance checklist with this exact intake sequence, calling each once:
1. get_broken_content without a table_name.
2. get_broken_content with table_name "${fixture.detailTable}" and limit 100.
3. get_stale_dashboards.
4. write_slack_summary: state the total broken charts, whether the detail was truncated, and the stale dashboard count. Then finish.
Do not repair, create, flag, delete, or inspect other content. This benchmarks intake context, not maintenance quality.`,
                    },
                    dataTools: {},
                    availableExplores: [],
                    projectName: 'Synthetic large context fixture',
                    maxSteps: 12,
                    timeoutMs: 90_000,
                    telemetry: getAiCallTelemetry({
                        functionId: 'autopilotContextBenchmark',
                        feature: 'managed-agent',
                        keyManagement,
                        ...getLanguageModelAttribution(model),
                    }),
                    executeTool: async (name, input) => {
                        calls.push(name);
                        if (name === 'get_broken_content')
                            return typeof input.table_name === 'string' &&
                                input.table_name.length > 0
                                ? fixture.detail(
                                      input.table_name,
                                      typeof input.cursor === 'string' &&
                                          input.cursor.length > 0
                                          ? input.cursor
                                          : null,
                                  )
                                : fixture.broken;
                        if (name === 'get_stale_dashboards')
                            return fixture.staleDashboards;
                        throw new Error(
                            `Tool ${name} is outside the context benchmark`,
                        );
                    },
                    onStepFinish: (step) =>
                        recordAutopilotContextStep(steps, step),
                });
                const observedInputTokens = steps.flatMap((step) =>
                    step.inputTokens === null ? [] : [step.inputTokens],
                );
                const report = {
                    kind: 'synthetic-context-intake',
                    scenario,
                    provider: supportedProvider,
                    model: model.modelId,
                    fixture: {
                        charts: 350,
                        errorsPerChart: scenario === 'shared-model' ? 12 : 1,
                        staleDashboards: 12,
                    },
                    elapsedMs: Date.now() - started,
                    peakInputTokens: observedInputTokens.length
                        ? Math.max(...observedInputTokens)
                        : null,
                    inputUsageComplete:
                        steps.length > 0 &&
                        steps.every((step) => step.inputTokens !== null),
                    largestToolResultBytes: Math.max(
                        0,
                        ...steps.map((step) => step.largestToolResultBytes),
                    ),
                    result,
                    steps,
                    calls,
                };
                const directory = process.env.AUTOPILOT_EVAL_OUTPUT_DIR;
                if (directory) {
                    await mkdir(directory, { recursive: true });
                    await writeFile(
                        path.join(
                            directory,
                            `${supportedProvider}-context-${scenario}.json`,
                        ),
                        JSON.stringify(report, null, 2),
                    );
                }
                expect(result.stopReason).toBe('end_turn');
                expect(result.slackSummary).toContain('350');
                expect(result.slackSummary).toContain('12');
                expect(calls).toEqual([
                    'get_broken_content',
                    'get_broken_content',
                    'get_stale_dashboards',
                ]);
                expect(report.largestToolResultBytes).toBeGreaterThan(10_000);
            },
            100_000,
        );
    },
);

describe.skipIf(!provider || !paginationBenchmark)(
    'Autopilot detail pagination',
    () => {
        it('follows cursors to read all 350 broken charts exactly once', async () => {
            if (!supportedProvider)
                throw new Error('Unsupported AUTOPILOT_EVAL_PROVIDER');
            const fixture = createAutopilotContextFixture('pagination');
            const { model, callOptions, providerOptions, keyManagement } =
                getModel(parseConfig().ai.copilot, {
                    provider: supportedProvider,
                    modelName: process.env.AUTOPILOT_EVAL_MODEL,
                    enableReasoning: true,
                });
            const agent = renderAutopilotAgent({
                policy: {
                    ...DEFAULT_MANAGED_AGENT_POLICY,
                    aggression: 'observe',
                },
            });
            const visited: string[] = [];
            const steps: AutopilotContextStep[] = [];
            let reachedEnd = false;
            const result = await runAutopilotAgent({
                model,
                callOptions: { ...callOptions, maxRetries: 0 },
                providerOptions,
                agent: {
                    ...agent,
                    system: `${agent.system}
For this synthetic pagination benchmark only, replace the maintenance checklist with reading every broken chart on table_name "orders". Request detail pages with limit 100. Follow next_cursor using cursor and the same table_name until next_cursor is null. Do not repeat pages. Then write_slack_summary with the total chart count and finish. Do not call other tools or modify content.`,
                },
                dataTools: {},
                availableExplores: [],
                projectName: 'Synthetic pagination fixture',
                maxSteps: 12,
                timeoutMs: 90_000,
                telemetry: getAiCallTelemetry({
                    functionId: 'autopilotPaginationBenchmark',
                    feature: 'managed-agent',
                    keyManagement,
                    ...getLanguageModelAttribution(model),
                }),
                executeTool: async (name, input) => {
                    if (
                        name !== 'get_broken_content' ||
                        input.table_name !== 'orders'
                    )
                        throw new Error('Only orders detail is available');
                    const response = fixture.detail(
                        'orders',
                        typeof input.cursor === 'string' &&
                            input.cursor.length > 0
                            ? input.cursor
                            : null,
                    );
                    try {
                        const page: {
                            items: { uuid: string }[];
                            next_cursor: string | null;
                        } = JSON.parse(response);
                        visited.push(...page.items.map(({ uuid }) => uuid));
                        reachedEnd = page.next_cursor === null;
                    } catch {
                        throw new Error('Invalid fixture JSON');
                    }
                    return response;
                },
                onStepFinish: (step) => recordAutopilotContextStep(steps, step),
            });
            const report = {
                kind: 'synthetic-detail-pagination',
                provider: supportedProvider,
                model: model.modelId,
                visitedCount: visited.length,
                uniqueCount: new Set(visited).size,
                reachedEnd,
                result,
                steps,
            };
            const directory = process.env.AUTOPILOT_EVAL_OUTPUT_DIR;
            if (directory) {
                await mkdir(directory, { recursive: true });
                await writeFile(
                    path.join(
                        directory,
                        `${supportedProvider}-pagination.json`,
                    ),
                    JSON.stringify(report, null, 2),
                );
            }
            expect(result.stopReason).toBe('end_turn');
            expect(result.slackSummary).toContain('350');
            expect(report).toMatchObject({
                visitedCount: 350,
                uniqueCount: 350,
                reachedEnd: true,
            });
        }, 100_000);
    },
);
