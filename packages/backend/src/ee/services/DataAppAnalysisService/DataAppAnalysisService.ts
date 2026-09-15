import {
    assertRegisteredAccount,
    EE_SCHEDULER_TASKS,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    getItemLabelWithoutTableName,
    isDimension,
    isJwtUser,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    SchedulerJobStatus,
    type Account,
    type DataAppAnalysis,
    type DataAppAnalysisRecord,
    type DataAppAnalysisSource,
    type DataAppAnomaly,
    type DataAppDetectRequest,
    type DataAppInvestigateJobPayload,
    type DataAppInvestigateRequest,
    type DataAppInvestigation,
    type ItemsMap,
    type SessionUser,
} from '@lightdash/common';
import { fromSession, toSessionUser } from '../../../auth/account';
import { type AppModel } from '../../../models/AppModel';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { type UserModel } from '../../../models/UserModel';
import { type AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../services/BaseService';
import { CsvService } from '../../../services/CsvService/CsvService';
import { type SchedulerService } from '../../../services/SchedulerService/SchedulerService';
import type { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import { type DbDataAppAnalysis } from '../../database/entities/dataAppAnalyses';
import { type DataAppAnalysisModel } from '../../models/DataAppAnalysisModel';
import { type ExternalConnectionModel } from '../../models/ExternalConnectionModel';
import { type CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { DATA_APP_INVESTIGATE_TOOL_NAMES } from '../ai/agents/agentV2';
import { convertQueryResultsToCsv } from '../ai/utils/convertQueryResultsToCsv';
import {
    appendCsvSection,
    emptySectionAccumulator,
    MAX_ROWS_PER_CHART,
    omitSection,
    serializeSections,
    type SectionAccumulator,
} from '../ai/utils/csvSections';
import type { AiAgentService } from '../AiAgentService/AiAgentService';
import type { AiOrganizationSettingsService } from '../AiOrganizationSettingsService';
import type { AiService } from '../AiService/AiService';
import {
    assertCanViewApp,
    type DataAppProjectContext,
} from '../AppGenerateService/appAuthz';
import { groundAnomalies, type GroundingSource } from './grounding';

const MAX_SOURCES = 40;
// Hard budgets for one investigation; exhaustion yields a partial answer.
const INVESTIGATE_MAX_STEPS = 12;
const INVESTIGATE_MAX_WAREHOUSE_QUERIES = 15;

class InvestigationQueryBudgetError extends Error {
    constructor() {
        super(
            `Query budget reached (${INVESTIGATE_MAX_WAREHOUSE_QUERIES}). Explain what you found so far.`,
        );
        this.name = 'InvestigationQueryBudgetError';
    }
}

type Dependencies = {
    dataAppAnalysisModel: DataAppAnalysisModel;
    appModel: AppModel;
    userModel: UserModel;
    schedulerService: SchedulerService;
    schedulerClient: CommercialSchedulerClient;
    externalConnectionModel: ExternalConnectionModel;
    featureFlagModel: FeatureFlagModel;
    spacePermissionService: SpacePermissionService;
    asyncQueryService: AsyncQueryService;
    aiService: AiService;
    aiAgentService: AiAgentService;
    aiOrganizationSettingsService: AiOrganizationSettingsService;
};

/** Stable error code the host and SDK key their "unavailable" states on. */
export class DataAppAnalysisUnavailableError extends ForbiddenError {
    constructor(
        message: string,
        code:
            | 'org_setting_disabled'
            | 'copilot_disabled'
            | 'data_apps_disabled'
            | 'analysis_disabled'
            | 'unsupported_context'
            | 'agent_unavailable',
    ) {
        super(message, { code });
        this.name = 'DataAppAnalysisUnavailableError';
    }
}

const fieldLegend = (fields: ItemsMap, fieldIds: string[]): string =>
    fieldIds
        .map((fieldId) => {
            const item = fields[fieldId];
            if (!item) return `${fieldId}`;
            const kind = isDimension(item) ? 'dimension' : 'metric';
            return `${fieldId} = "${getItemLabelWithoutTableName(
                item,
            )}" (${kind})`;
        })
        .join('; ');

/**
 * Every string a row shows for each field, so grounding accepts whichever
 * rendering the model copied: raw, spreadsheet-temporal, or formatted.
 */
const rowValueSets = (
    row: Record<string, unknown>,
    fields: ItemsMap,
    fieldIds: string[],
    timezone: string | null,
): Record<string, Set<string>> => {
    const raw = CsvService.convertRowToCsv(
        row,
        fields,
        true,
        fieldIds,
        timezone ?? undefined,
    );
    const formatted = CsvService.convertRowToCsv(
        row,
        fields,
        false,
        fieldIds,
        timezone ?? undefined,
    );
    return Object.fromEntries(
        fieldIds.map((fieldId, index) => [
            fieldId,
            new Set(
                [row[fieldId], raw[index], formatted[index]]
                    .filter((value) => value !== null && value !== undefined)
                    .map((value) => String(value)),
            ),
        ]),
    );
};

export class DataAppAnalysisService extends BaseService {
    private readonly dataAppAnalysisModel: DataAppAnalysisModel;

    private readonly appModel: AppModel;

    private readonly userModel: UserModel;

    private readonly schedulerService: SchedulerService;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly externalConnectionModel: ExternalConnectionModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly aiService: AiService;

    private readonly aiAgentService: AiAgentService;

    private readonly aiOrganizationSettingsService: AiOrganizationSettingsService;

    constructor(deps: Dependencies) {
        super({ serviceName: 'DataAppAnalysisService' });
        this.dataAppAnalysisModel = deps.dataAppAnalysisModel;
        this.appModel = deps.appModel;
        this.userModel = deps.userModel;
        this.schedulerService = deps.schedulerService;
        this.schedulerClient = deps.schedulerClient;
        this.externalConnectionModel = deps.externalConnectionModel;
        this.featureFlagModel = deps.featureFlagModel;
        this.spacePermissionService = deps.spacePermissionService;
        this.asyncQueryService = deps.asyncQueryService;
        this.aiService = deps.aiService;
        this.aiAgentService = deps.aiAgentService;
        this.aiOrganizationSettingsService = deps.aiOrganizationSettingsService;
    }

    private async getProjectContext(
        projectUuid: string,
    ): Promise<DataAppProjectContext> {
        const context =
            await this.externalConnectionModel.findProjectAbilityContext(
                projectUuid,
            );
        if (!context) {
            throw new NotFoundError('Project not found');
        }
        return { ...context, projectUuid };
    }

    /**
     * Fails closed in order: customer consent (org setting), AI entitlement,
     * data-apps flag, analysis rollout flag. Each has its own code so the
     * host can explain which.
     */
    private async assertRuntimeAiAllowed(user: SessionUser): Promise<void> {
        if (!user.organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }
        if (
            !(await this.aiOrganizationSettingsService.isDataAppRuntimeAiEnabled(
                user.organizationUuid,
            ))
        ) {
            throw new DataAppAnalysisUnavailableError(
                'AI analysis in data apps is turned off for this organization',
                'org_setting_disabled',
            );
        }
        if (!(await this.aiAgentService.getIsCopilotEnabled(user))) {
            throw new DataAppAnalysisUnavailableError(
                'AI is not enabled for this organization',
                'copilot_disabled',
            );
        }
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.EnableDataApps,
        });
        if (!enabled) {
            throw new DataAppAnalysisUnavailableError(
                'Data apps are not enabled',
                'data_apps_disabled',
            );
        }
        const analysisFlag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.EnableDataAppAnalysis,
        });
        if (!analysisFlag.enabled) {
            throw new DataAppAnalysisUnavailableError(
                'AI analysis in data apps is not enabled for this organization',
                'analysis_disabled',
            );
        }
    }

    private async assertViewer(
        account: Account,
        projectUuid: string,
        appUuid: string,
    ): Promise<{ user: SessionUser; appVersion: number }> {
        if (isJwtUser(account)) {
            throw new DataAppAnalysisUnavailableError(
                'AI analysis is not available in embedded data apps',
                'unsupported_context',
            );
        }
        assertRegisteredAccount(account);
        const user = toSessionUser(account);
        await this.assertRuntimeAiAllowed(user);

        const app = await this.appModel.getApp(appUuid, projectUuid);
        await assertCanViewApp(
            {
                auditedAbility: this.createAuditedAbility(user),
                resolveAccess: (userUuid, targetApp) =>
                    this.spacePermissionService.resolveAccess(userUuid, {
                        type: 'app',
                        appUuid: targetApp.app_id,
                        organizationUuid: targetApp.organization_uuid,
                        projectUuid: targetApp.project_uuid,
                        spaceUuid: targetApp.space_uuid,
                    }),
                getProjectContext: (appProjectUuid) =>
                    this.getProjectContext(appProjectUuid),
            },
            user,
            app,
        );
        const latestReady = await this.appModel.getLatestReadyVersion(appUuid);
        if (!latestReady) {
            throw new NotFoundError('Data app has no ready version');
        }
        return { user, appVersion: latestReady.version };
    }

    /**
     * Reads every source under the viewer's own account (ownership and
     * project/explore access are enforced by the query history read) and
     * serialises them for the model under the shared char budget.
     */
    private async buildContent(
        account: Account,
        projectUuid: string,
        sources: DataAppAnalysisSource[],
    ): Promise<{ content: string; grounding: GroundingSource[] }> {
        const grounding: GroundingSource[] = [];
        const sections = await sources.reduce<Promise<SectionAccumulator>>(
            async (accPromise, source, index) => {
                const acc = await accPromise;
                const title = source.label ?? `Query ${index + 1}`;
                if (acc.remainingChars <= 0) return omitSection(acc, title);

                const history =
                    await this.asyncQueryService.getAsyncQueryHistory({
                        account,
                        projectUuid,
                        queryUuid: source.queryUuid,
                    });
                if (
                    history.context === QueryExecutionContext.SCHEDULED_DELIVERY
                ) {
                    throw new DataAppAnalysisUnavailableError(
                        'AI analysis is not available in scheduled deliveries',
                        'unsupported_context',
                    );
                }
                const { rows, fields, truncated, displayTimezone } =
                    await this.asyncQueryService.getRawAsyncQueryResults({
                        account,
                        projectUuid,
                        queryUuid: source.queryUuid,
                        maxRows: MAX_ROWS_PER_CHART,
                    });
                const fieldIds = rows[0] ? Object.keys(rows[0]) : [];
                grounding.push({
                    queryUuid: source.queryUuid,
                    fieldIds: new Set(fieldIds),
                    rows: rows.map((row) =>
                        rowValueSets(row, fields, fieldIds, displayTimezone),
                    ),
                });
                return appendCsvSection(
                    acc,
                    title,
                    convertQueryResultsToCsv({ rows, fields }),
                    truncated,
                    `Query: ${source.queryUuid}\nFields: ${fieldLegend(
                        fields,
                        fieldIds,
                    )}\n`,
                );
            },
            Promise.resolve(emptySectionAccumulator()),
        );
        return { content: serializeSections(sections), grounding };
    }

    async detect(
        account: Account,
        projectUuid: string,
        appUuid: string,
        body: DataAppDetectRequest,
    ): Promise<DataAppAnalysis> {
        if (body.sources.length === 0) {
            throw new ParameterError('At least one source query is required');
        }
        if (body.sources.length > MAX_SOURCES) {
            throw new ParameterError(
                `At most ${MAX_SOURCES} source queries can be analysed at once`,
            );
        }
        const instructions = body.instructions?.trim() || null;
        const { user, appVersion } = await this.assertViewer(
            account,
            projectUuid,
            appUuid,
        );
        const { content, grounding } = await this.buildContent(
            account,
            projectUuid,
            body.sources,
        );

        const { detection, modelId } =
            await this.aiService.detectDataAppAnomalies(user, {
                content,
                instructions,
                projectUuid,
            });
        const { anomalies, droppedCount } = groundAnomalies(
            detection.anomalies,
            grounding,
        );
        const limitations =
            droppedCount > 0
                ? [
                      ...detection.limitations,
                      `${droppedCount} finding${
                          droppedCount === 1 ? '' : 's'
                      } could not be matched to the data and were left out`,
                  ]
                : detection.limitations;
        const result = {
            headline: detection.headline,
            summary: detection.summary,
            anomalies,
            limitations,
            dataAsOf: detection.dataAsOf,
        };

        const row = await this.dataAppAnalysisModel.create({
            organizationUuid: user.organizationUuid!,
            projectUuid,
            appUuid,
            appVersion,
            createdByUserUuid: user.userUuid,
            operation: 'detect',
            sources: body.sources,
            instructions,
            result,
            modelId,
        });

        return {
            ...result,
            analysisId: row.data_app_analysis_uuid,
            appUuid,
            appVersion,
            sources: body.sources,
            generatedAt: row.created_at,
        };
    }

    private static toRecord(row: DbDataAppAnalysis): DataAppAnalysisRecord {
        const base = {
            appUuid: row.app_id,
            appVersion: row.app_version,
            generatedAt: row.created_at,
        };
        if (row.operation === 'detect') {
            return {
                operation: 'detect',
                ...row.result,
                ...base,
                analysisId: row.data_app_analysis_uuid,
                sources: row.sources,
            };
        }
        return {
            operation: 'investigate',
            ...row.result,
            ...base,
            investigationId: row.data_app_analysis_uuid,
            analysisId: row.parent_analysis_uuid,
        };
    }

    private async getDetectionForViewer(
        user: SessionUser,
        appUuid: string,
        analysisId: string,
    ): Promise<DbDataAppAnalysis & { operation: 'detect' }> {
        const row = await this.dataAppAnalysisModel.find(
            analysisId,
            appUuid,
            user.userUuid,
        );
        if (!row || row.operation !== 'detect') {
            throw new NotFoundError('Analysis not found');
        }
        return row;
    }

    private async assertAgentUsable(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
    ): Promise<void> {
        try {
            await this.aiAgentService.getAgent(user, agentUuid, projectUuid);
        } catch (e) {
            // Never fall back to another agent: the viewer picked this one.
            throw new DataAppAnalysisUnavailableError(
                `The selected agent is not available: ${getErrorMessage(e)}`,
                'agent_unavailable',
            );
        }
    }

    async getAnalysis(
        account: Account,
        projectUuid: string,
        appUuid: string,
        analysisId: string,
    ): Promise<DataAppAnalysisRecord> {
        const { user } = await this.assertViewer(account, projectUuid, appUuid);
        const row = await this.dataAppAnalysisModel.find(
            analysisId,
            appUuid,
            user.userUuid,
        );
        if (!row) {
            throw new NotFoundError('Analysis not found');
        }
        return DataAppAnalysisService.toRecord(row);
    }

    /**
     * Queues an investigation of one anomaly from a persisted detection.
     * Nothing about the anomaly is trusted from the request: it is resolved
     * from the stored detection under the same viewer.
     */
    async investigate(
        account: Account,
        projectUuid: string,
        appUuid: string,
        analysisId: string,
        body: DataAppInvestigateRequest,
    ): Promise<{ jobId: string }> {
        const { user } = await this.assertViewer(account, projectUuid, appUuid);
        const detection = await this.getDetectionForViewer(
            user,
            appUuid,
            analysisId,
        );
        if (!detection.result.anomalies.some((a) => a.id === body.anomalyId)) {
            throw new NotFoundError('Anomaly not found in this analysis');
        }
        await this.assertAgentUsable(user, projectUuid, body.agentUuid);

        return this.schedulerClient.dataAppInvestigate({
            organizationUuid: user.organizationUuid!,
            projectUuid,
            userUuid: user.userUuid,
            appUuid,
            analysisId,
            anomalyId: body.anomalyId,
            agentUuid: body.agentUuid,
        });
    }

    private static buildInvestigationPrompt(
        anomaly: DataAppAnomaly,
        sourceLabel: string | null,
        pageContent: string,
    ): string {
        const dims = Object.entries(anomaly.dimensionValues)
            .map(([fieldId, value]) => `${fieldId} = ${value}`)
            .join(', ');
        return [
            'A viewer of a data app asked why one data point on the page is notable. Investigate the possible drivers and explain the supporting evidence.',
            '',
            `Finding: ${anomaly.text}`,
            `Source query: ${sourceLabel ?? anomaly.queryUuid}`,
            `Metric: ${anomaly.fieldId}${dims ? ` where ${dims}` : ''}`,
            anomaly.actual ? `Observed: ${anomaly.actual}` : null,
            anomaly.expected ? `Compared against: ${anomaly.expected}` : null,
            '',
            'Rules:',
            '- Start from the data on the page below. Run additional queries only when they can test a driver: break the metric down by another dimension, compare the prior period, or check a related metric. Do not query for its own sake.',
            '- Every figure you state must come from the page data or a query you ran, and must say which.',
            '- Describe possible drivers and associations. Never claim a cause is proven.',
            '- If nothing in the available data explains the finding, say so plainly.',
            '- Answer in Markdown under 250 words: a two-sentence summary, a "Possible drivers" list with the evidence for each, an "Evidence" list naming the queries used, and a final line "Confidence: low|medium|high".',
            '- Reply with the answer only. Do not narrate your process or announce that you are ready to answer.',
            '',
            'Data on the page:',
            pageContent,
        ]
            .filter((line): line is string => line !== null)
            .join('\n');
    }

    /** Worker entrypoint: runs the agent and persists the result under the viewer. */
    async runInvestigation(
        payload: DataAppInvestigateJobPayload,
        jobId: string,
        scheduledTime: Date,
    ): Promise<void> {
        const baseLog = {
            task: EE_SCHEDULER_TASKS.DATA_APP_INVESTIGATE,
            jobId,
            scheduledTime,
            details: {
                projectUuid: payload.projectUuid,
                organizationUuid: payload.organizationUuid,
                createdByUserUuid: payload.userUuid,
                analysisId: payload.analysisId,
                anomalyId: payload.anomalyId,
            },
        };
        await this.schedulerService.logSchedulerJob({
            ...baseLog,
            status: SchedulerJobStatus.STARTED,
        });
        try {
            const sessionUser =
                await this.userModel.findSessionUserAndOrgByUuid(
                    payload.userUuid,
                    payload.organizationUuid,
                );
            const account = fromSession(sessionUser);
            // Re-run every gate: consent or access may have changed since queueing.
            const { user, appVersion } = await this.assertViewer(
                account,
                payload.projectUuid,
                payload.appUuid,
            );
            const detection = await this.getDetectionForViewer(
                user,
                payload.appUuid,
                payload.analysisId,
            );
            const anomaly = detection.result.anomalies.find(
                (a) => a.id === payload.anomalyId,
            );
            if (!anomaly) {
                throw new NotFoundError('Anomaly not found in this analysis');
            }
            await this.assertAgentUsable(
                user,
                payload.projectUuid,
                payload.agentUuid,
            );
            const source = detection.sources.find(
                (s) => s.queryUuid === anomaly.queryUuid,
            );
            const { content } = await this.buildContent(
                account,
                payload.projectUuid,
                source ? [source] : [],
            );

            const thread = await this.aiAgentService.createAgentThread(
                user,
                payload.agentUuid,
                {
                    prompt: DataAppAnalysisService.buildInvestigationPrompt(
                        anomaly,
                        source?.label ?? null,
                        content,
                    ),
                    context: [{ type: 'data_app', appUuid: payload.appUuid }],
                },
                'data_app',
            );
            if (!thread) {
                throw new NotFoundError(
                    'Failed to create investigation thread',
                );
            }

            let queriesRun = 0;
            let partial = false;
            const explanation =
                await this.aiAgentService.generateAgentThreadResponse(user, {
                    agentUuid: payload.agentUuid,
                    threadUuid: thread.uuid,
                    execution: {
                        mode: 'standard',
                        maxSteps: INVESTIGATE_MAX_STEPS,
                        toolAllowlist: DATA_APP_INVESTIGATE_TOOL_NAMES,
                        onWarehouseQuery: () => {
                            queriesRun += 1;
                            if (
                                queriesRun > INVESTIGATE_MAX_WAREHOUSE_QUERIES
                            ) {
                                partial = true;
                                throw new InvestigationQueryBudgetError();
                            }
                        },
                    },
                });

            const row = await this.dataAppAnalysisModel.create({
                organizationUuid: payload.organizationUuid,
                projectUuid: payload.projectUuid,
                appUuid: payload.appUuid,
                appVersion,
                createdByUserUuid: user.userUuid,
                operation: 'investigate',
                sources: source ? [source] : [],
                instructions: null,
                modelId: null,
                result: {
                    explanation,
                    anomaly,
                    agentUuid: payload.agentUuid,
                    threadUuid: thread.uuid,
                    queriesRun: Math.min(
                        queriesRun,
                        INVESTIGATE_MAX_WAREHOUSE_QUERIES,
                    ),
                    partial,
                },
                parentAnalysisUuid: payload.analysisId,
                anomalyId: payload.anomalyId,
                agentUuid: payload.agentUuid,
                threadUuid: thread.uuid,
            });

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    ...baseLog.details,
                    investigationId: row.data_app_analysis_uuid,
                    threadUuid: thread.uuid,
                    partial,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: { ...baseLog.details, error: getErrorMessage(e) },
            });
            throw e;
        }
    }
}
