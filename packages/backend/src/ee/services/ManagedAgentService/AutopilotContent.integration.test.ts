import {
    ChartType,
    DEFAULT_MANAGED_AGENT_POLICY,
    ManagedAgentActionType,
    ManagedAgentProtectedEntityType,
    ManagedAgentRunStatus,
    QueryExecutionContext,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type MetricQuery,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import App from '../../../App';
import { fromSession } from '../../../auth/account';
import { parseConfig } from '../../../config/parseConfig';
import { seed } from '../../../database/seeds/development/01_initial_user';
import knexConfig from '../../../knexfile';
import { getEnterpriseAppArguments } from '../../index';
import { ManagedAgentModel } from '../../models/ManagedAgentModel';
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
import { ManagedAgentService } from './ManagedAgentService';

describe.skipIf(process.env.AUTOPILOT_CONTENT_EVAL !== 'true')(
    'Autopilot real content',
    () => {
        let app: App;
        beforeAll(async () => {
            const uri = new URL(process.env.PGCONNECTIONURI ?? '');
            if (
                !['127.0.0.1', 'localhost'].includes(uri.hostname) ||
                !/^\/autopilot_eval_[a-z0-9_]+$/.test(uri.pathname)
            ) {
                throw new Error(
                    'Real content eval requires a dedicated local autopilot_eval_* database',
                );
            }
            expect(process.env.PGDATABASE).toBe(uri.pathname.slice(1));
            expect(process.env.PGHOST).toBe(uri.hostname);
            expect(process.env.NATS_ENABLED).toBe('false');
            expect(process.env.SCHEDULER_ENABLED).toBe('false');
            expect(process.env.RUDDERSTACK_ANALYTICS_DISABLED).toBe('true');
            expect(process.env.USAGE_EVENTS_ENABLED).toBe('false');
            app = new App({
                lightdashConfig: parseConfig(),
                port: 0,
                environment: 'development',
                knexConfig,
                ...(await getEnterpriseAppArguments()),
            });
            const db = app.getDatabase();
            const result = await db.raw('select current_database() as name');
            expect(result.rows[0].name).toBe(uri.pathname.slice(1));
            if (process.env.AUTOPILOT_CONTENT_SEED === 'true') {
                const organizations = await db('organizations').first();
                if (organizations)
                    throw new Error('Seed only an empty evaluation database');
                await seed(db);
            }
        });
        afterAll(async () => {
            if (app) {
                await app.stop();
                await app.getDatabase().destroy();
            }
        });
        it('executes the actual metric query against the fixture warehouse', async () => {
            const actor = await app
                .getModels()
                .getUserModel()
                .findSessionUserAndOrgByUuid(
                    SEED_ORG_1_ADMIN.user_uuid,
                    SEED_ORG_1.organization_uuid,
                );
            const result = await app
                .getServiceRepository()
                .getAsyncQueryService()
                .executeMetricQueryAndGetResults({
                    account: fromSession(actor),
                    projectUuid: SEED_PROJECT.project_uuid,
                    context: QueryExecutionContext.AI,
                    metricQuery: {
                        exploreName: 'orders',
                        dimensions: [],
                        metrics: ['orders_total_revenue'],
                        filters: {},
                        sorts: [],
                        limit: 10,
                        tableCalculations: [],
                    },
                });
            expect(Number(result.rows[0].orders_total_revenue)).toBe(150);
        });
        it.skipIf(!process.env.AUTOPILOT_EVAL_PROVIDER)(
            'creates and repairs persisted charts with real tools',
            async () => {
                const provider = process.env.AUTOPILOT_EVAL_PROVIDER;
                if (provider !== 'openai' && provider !== 'anthropic')
                    throw new Error(
                        'This fixture qualifies OpenAI or Anthropic only',
                    );
                const projectUuid = SEED_PROJECT.project_uuid;
                const models = app.getModels();
                const services = app.getServiceRepository();
                const actor = await models
                    .getUserModel()
                    .findSessionUserAndOrgByUuid(
                        SEED_ORG_1_ADMIN.user_uuid,
                        SEED_ORG_1.organization_uuid,
                    );
                const agentModel =
                    models.getManagedAgentModel<ManagedAgentModel>();
                const service =
                    services.getManagedAgentService<ManagedAgentService>();
                const chartModel = models.getSavedChartModel();
                const validation = services.getValidationService();
                const suffix = `${provider}-${randomUUID().slice(0, 8)}`;
                const space = await models.getSpaceModel().createSpace(
                    {
                        name: `Eval ${suffix}`,
                        inheritParentPermissions: true,
                        parentSpaceUuid: null,
                    },
                    { projectUuid, userId: actor.userId },
                );
                const excludedSpace = await models.getSpaceModel().createSpace(
                    {
                        name: `Excluded ${suffix}`,
                        inheritParentPermissions: true,
                        parentSpaceUuid: null,
                    },
                    { projectUuid, userId: actor.userId },
                );
                await agentModel.upsertSettings(projectUuid, actor.userUuid, {
                    enabled: true,
                    slackChannelId: null,
                    policy: {
                        ...DEFAULT_MANAGED_AGENT_POLICY,
                        aggression: 'observe',
                        audience: 'admins',
                        spaceScopeMode: 'only',
                    },
                });
                await agentModel.replaceSpaceScope(
                    projectUuid,
                    'only',
                    [space.uuid],
                    actor.userUuid,
                );
                const brokenQuery: MetricQuery = {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_total_amount'],
                    filters: {},
                    sorts: [],
                    limit: 10,
                    tableCalculations: [],
                };
                const correctedQuery: MetricQuery = {
                    ...brokenQuery,
                    metrics: ['orders_total_revenue'],
                };
                const makeChart = (name: string, spaceUuid: string) =>
                    chartModel.create(projectUuid, actor.userUuid, {
                        name,
                        slug: name.toLowerCase().replaceAll(' ', '-'),
                        description:
                            'Total revenue. Preserve this description and number label.',
                        spaceUuid,
                        tableName: 'orders',
                        metricQuery: brokenQuery,
                        chartConfig: {
                            type: ChartType.BIG_NUMBER,
                            config: {
                                selectedField: 'orders_total_amount',
                                label: 'Revenue to date',
                                showBigNumberLabel: true,
                            },
                        },
                        tableConfig: { columnOrder: ['orders_total_amount'] },
                        updatedByUser: actor,
                    });
                const broken = await makeChart(`Repair ${suffix}`, space.uuid);
                const protectedChart = await makeChart(
                    `Protected ${suffix}`,
                    space.uuid,
                );
                const excluded = await makeChart(
                    `Excluded ${suffix}`,
                    excludedSpace.uuid,
                );
                await agentModel.upsertProtection({
                    projectUuid,
                    entityType: ManagedAgentProtectedEntityType.CHART,
                    entityUuid: protectedChart.uuid,
                    level: 'protected',
                    createdByUserUuid: actor.userUuid,
                });
                await Promise.all(
                    [broken, protectedChart, excluded].map(async (chart) => {
                        expect(
                            (
                                await validation.validateAndUpdateChart(
                                    actor,
                                    projectUuid,
                                    chart.uuid,
                                )
                            ).length,
                        ).toBeGreaterThan(0);
                    }),
                );
                const previousVersion =
                    await chartModel.getLatestVersionSummary(broken.uuid);
                const guardVersions = await Promise.all(
                    [protectedChart, excluded].map((chart) =>
                        chartModel.getLatestVersionSummary(chart.uuid),
                    ),
                );
                const run = await service.startRun(projectUuid, 'manual');
                const { model, callOptions, providerOptions, keyManagement } =
                    getModel(parseConfig().ai.copilot, {
                        provider,
                        modelName: process.env.AUTOPILOT_EVAL_MODEL,
                        enableReasoning: true,
                    });
                await agentModel.setRunSessionId(run.runUuid, run.runUuid);
                await agentModel.setRunModel(run.runUuid, {
                    provider,
                    name: model.modelId,
                });
                const executeTool = (
                    name: string,
                    input: Record<string, unknown>,
                    signal?: AbortSignal,
                ) =>
                    service['handleToolCall'](
                        projectUuid,
                        run.runUuid,
                        run.runUuid,
                        name,
                        input,
                        signal,
                        false,
                    );
                const invalidQuery = { ...correctedQuery, filters: undefined };
                await expect(
                    executeTool('create_content_from_code', {
                        description: 'Invalid payload probe',
                        chart_as_code: {
                            tableName: 'orders',
                            metricQuery: invalidQuery,
                            chartConfig: { type: ChartType.BIG_NUMBER },
                        },
                    }),
                ).rejects.toThrow('metric_query.filters must be an object');
                await expect(
                    executeTool('fix_broken_chart', {
                        chart_uuid: broken.uuid,
                        chart_name: broken.name,
                        description: 'Invalid payload probe',
                        metric_query: invalidQuery,
                        chart_config: { type: ChartType.BIG_NUMBER },
                    }),
                ).rejects.toThrow('metric_query.filters must be an object');
                expect(
                    await chartModel.getLatestVersionSummary(broken.uuid),
                ).toEqual(previousVersion);
                expect(
                    await agentModel.getActions(projectUuid, {
                        sessionId: run.runUuid,
                    }),
                ).toEqual([]);
                const intake = await executeTool('get_broken_content', {});
                expect(intake).toContain(broken.uuid);
                expect(intake).not.toContain(excluded.uuid);
                const guards = await Promise.all(
                    [protectedChart, excluded].map(async (chart) => {
                        const response = await executeTool('fix_broken_chart', {
                            chart_uuid: chart.uuid,
                            chart_name: chart.name,
                            description: 'Eval guard probe',
                            metric_query: correctedQuery,
                            chart_config: {
                                type: ChartType.BIG_NUMBER,
                                config: {
                                    selectedField: 'orders_total_revenue',
                                },
                            },
                        });
                        expect(response).not.toContain('"fixed":true');
                        return response;
                    }),
                );
                const { tools: dataTools, availableExplores } = await service[
                    'buildAutopilotDataTools'
                ](actor, projectUuid, SEED_ORG_1.organization_uuid);
                const agent = renderAutopilotAgent({
                    policy: {
                        ...DEFAULT_MANAGED_AGENT_POLICY,
                        aggression: 'observe',
                        audience: 'admins',
                    },
                });
                const steps: AutopilotContextStep[] = [];
                const loadedSkills: unknown[] = [];
                const queryOutcomes: Array<{ step: number; status: unknown }> =
                    [];
                const toolErrors: Array<{ name: string; error: unknown }> = [];
                const started = Date.now();
                const result = await runAutopilotAgent({
                    model,
                    callOptions: { ...callOptions, maxRetries: 0 },
                    providerOptions,
                    agent: {
                        ...agent,
                        system: `${agent.system}
For this focused chart-workflow evaluation, replace the general maintenance checklist with these tasks: repair the broken chart named "${broken.name}" (UUID ${broken.uuid}), preserving its label, description and unrelated configuration. Discover the replacement for its retired amount metric from the semantic model. Then create one TABLE chart named "Revenue by status ${suffix}" showing total revenue grouped by order status, sorted by status ascending. These are two distinct requested outputs. Load the chart skill and relevant resources, and execute each proposed query before saving. Respect all protections and scope restrictions. Finish with write_slack_summary, after loading the Slack skill. Do not flag or delete content. Do not perform other maintenance tasks.`,
                    },
                    dataTools,
                    availableExplores,
                    executeTool,
                    projectName: 'Isolated real chart evaluation',
                    maxSteps: 32,
                    timeoutMs: 210_000,
                    telemetry: getAiCallTelemetry({
                        functionId: 'autopilotRealContentEval',
                        feature: 'managed-agent',
                        keyManagement,
                        ...getLanguageModelAttribution(model),
                    }),
                    onStepFinish: (step) => {
                        recordAutopilotContextStep(steps, step);
                        loadedSkills.push(
                            ...step.toolCalls
                                .filter((call) => call.toolName === 'loadSkill')
                                .map((call) => call.input),
                        );
                        for (const output of step.toolResults) {
                            let value: unknown = output.output;
                            if (typeof value === 'string') {
                                try {
                                    value = JSON.parse(value);
                                } catch {
                                    value = null;
                                }
                            }
                            if (
                                value &&
                                typeof value === 'object' &&
                                'metadata' in value &&
                                value.metadata &&
                                typeof value.metadata === 'object' &&
                                'status' in value.metadata
                            ) {
                                if (output.toolName === 'runMetricQuery')
                                    queryOutcomes.push({
                                        step: steps.length,
                                        status: value.metadata.status,
                                    });
                                if (value.metadata.status === 'error')
                                    toolErrors.push({
                                        name: output.toolName,
                                        error:
                                            'result' in value
                                                ? value.result
                                                : value,
                                    });
                            }
                            if (
                                value &&
                                typeof value === 'object' &&
                                'error' in value
                            )
                                toolErrors.push({
                                    name: output.toolName,
                                    error: value.error,
                                });
                        }
                    },
                });
                const actions = await agentModel.getActions(projectUuid, {
                    sessionId: run.runUuid,
                });
                await agentModel.finishRun(run.runUuid, {
                    status: result.error
                        ? ManagedAgentRunStatus.ERROR
                        : ManagedAgentRunStatus.COMPLETED,
                    actionCount: actions.length,
                    summary: result.slackSummary,
                    error: result.error,
                });
                const directory = process.env.AUTOPILOT_EVAL_OUTPUT_DIR;
                if (directory) {
                    await mkdir(directory, { recursive: true });
                    await writeFile(
                        path.join(directory, `${provider}-real-content.json`),
                        JSON.stringify(
                            {
                                kind: 'real-chart-workflow',
                                provider,
                                model: model.modelId,
                                elapsedMs: Date.now() - started,
                                runUuid: run.runUuid,
                                result,
                                steps,
                                loadedSkills,
                                toolErrors,
                                queryOutcomes,
                                guards,
                                actions,
                            },
                            null,
                            2,
                        ),
                    );
                }
                const toolSequence = steps.flatMap((step) => step.tools);
                expect(toolSequence.indexOf('loadSkill')).toBeLessThan(
                    toolSequence.indexOf('fix_broken_chart'),
                );
                expect(
                    toolSequence.filter((name) => name === 'runMetricQuery')
                        .length,
                ).toBeGreaterThanOrEqual(2);
                expect(
                    queryOutcomes.filter(
                        (outcome) => outcome.status === 'success',
                    ).length,
                ).toBeGreaterThanOrEqual(2);
                expect(result.error).toBeNull();
                expect(result.stopReason).toBe('end_turn');
                expect(result.slackSummary).toBeTruthy();
                expect(JSON.stringify(loadedSkills)).toContain(
                    'developing-in-lightdash',
                );
                expect(
                    actions.filter(
                        (action) =>
                            action.actionType ===
                            ManagedAgentActionType.BLOCKED,
                    ),
                ).toHaveLength(2);
                const repairs = actions.filter(
                    (action) =>
                        action.actionType ===
                        ManagedAgentActionType.FIXED_BROKEN,
                );
                expect(repairs).toHaveLength(1);
                expect(repairs[0].targetUuid).toBe(broken.uuid);
                expect(repairs[0].metadata).toMatchObject({
                    previousVersionUuid: previousVersion!.versionUuid,
                });
                const creations = actions.filter(
                    (action) =>
                        action.actionType ===
                        ManagedAgentActionType.CREATED_CONTENT,
                );
                expect(creations).toHaveLength(1);
                await Promise.all(
                    [broken.uuid, creations[0].targetUuid!].map(
                        async (chartUuid) => {
                            expect(
                                await validation.validateAndUpdateChart(
                                    actor,
                                    projectUuid,
                                    chartUuid,
                                ),
                            ).toEqual([]);
                            const chart = await chartModel.get(chartUuid);
                            const query = await services
                                .getAsyncQueryService()
                                .executeMetricQueryAndGetResults({
                                    account: fromSession(actor),
                                    projectUuid,
                                    context: QueryExecutionContext.AI,
                                    metricQuery: chart.metricQuery,
                                });
                            if (chartUuid === broken.uuid) {
                                expect(
                                    Number(query.rows[0].orders_total_revenue),
                                ).toBe(150);
                                expect(chart.description).toBe(
                                    broken.description,
                                );
                                expect(chart.chartConfig).toMatchObject({
                                    type: ChartType.BIG_NUMBER,
                                    config: {
                                        label: 'Revenue to date',
                                        selectedField: 'orders_total_revenue',
                                        showBigNumberLabel: true,
                                    },
                                });
                                expect(chart.metricQuery).toEqual({
                                    ...broken.metricQuery,
                                    metrics: correctedQuery.metrics,
                                });
                            } else {
                                expect(chart.chartConfig.type).toBe(
                                    ChartType.TABLE,
                                );
                                expect(chart.slug).toMatch(/^agent-/);
                                expect(
                                    query.rows.map((row) => [
                                        row.orders_status,
                                        Number(row.orders_total_revenue),
                                    ]),
                                ).toEqual([
                                    ['new', 25],
                                    ['paid', 125],
                                ]);
                                const suggestions = await models
                                    .getSpaceModel()
                                    .find({
                                        projectUuid,
                                        slug: 'agent-suggestions',
                                    });
                                expect(chart.spaceUuid).toBe(
                                    suggestions[0].uuid,
                                );
                                expect(
                                    suggestions[0].inheritParentPermissions,
                                ).toBe(false);
                            }
                        },
                    ),
                );
                expect(
                    await Promise.all(
                        [protectedChart, excluded].map((chart) =>
                            chartModel.getLatestVersionSummary(chart.uuid),
                        ),
                    ),
                ).toEqual(guardVersions);
                if (directory) {
                    await writeFile(
                        path.join(directory, `${provider}-verification.json`),
                        JSON.stringify(
                            {
                                runUuid: run.runUuid,
                                persistedContentPassed: true,
                                repairedRevenue: 150,
                                createdRevenueByStatus: { new: 25, paid: 125 },
                                protectedAndExcludedVersionsUnchanged: true,
                                skillsLoadedBeforeMutation: true,
                                actionHistoryPassed: true,
                                suggestionsAudience: 'admins',
                            },
                            null,
                            2,
                        ),
                    );
                }
            },
        );
    },
);
