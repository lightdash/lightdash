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
    TooManyRequestsError,
    type Account,
    type DataAppAnalysis,
    type DataAppAnalysisLookup,
    type DataAppAnalysisRecord,
    type DataAppAnalysisSource,
    type DataAppAnomaly,
    type DataAppDetectRequest,
    type DataAppDetectResult,
    type DataAppInvestigateJobPayload,
    type DataAppInvestigateRequest,
    type DataAppInvestigation,
    type DataAppLookupRequest,
    type DataAppPromptAnswer,
    type DataAppPromptRequest,
    type ItemsMap,
    type SessionUser,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { fromSession, toSessionUser } from '../../../auth/account';
import { type AppModel } from '../../../models/AppModel';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { type UserModel } from '../../../models/UserModel';
import { type AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../services/BaseService';
import { CsvService } from '../../../services/CsvService/CsvService';
import { type SchedulerService } from '../../../services/SchedulerService/SchedulerService';
import type { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import {
    type DataAppAnalysisOperation,
    type DataAppSourceHash,
    type DbDataAppAnalysis,
} from '../../database/entities/dataAppAnalyses';
import { type AiAgentModel } from '../../models/AiAgentModel';
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

const MAX_SOURCES = 50;

const sha256 = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

/** Order- and label-independent identity of what the model read. */
const contentHashOf = (
    sectionHashes: DataAppSourceHash[],
    instructions: string | null,
): string =>
    sha256(
        [...sectionHashes.map((h) => h.hash).sort(), instructions ?? ''].join(
            '|',
        ),
    );

const remapQueryUuids = (
    result: DataAppDetectResult,
    mapping: Map<string, string>,
): DataAppDetectResult => ({
    ...result,
    anomalies: result.anomalies.map((anomaly) => ({
        ...anomaly,
        queryUuid: mapping.get(anomaly.queryUuid) ?? anomaly.queryUuid,
    })),
});

const sameQueryUuids = (
    a: DataAppAnalysisSource[],
    b: DataAppAnalysisSource[],
): boolean =>
    a.length === b.length &&
    a.every((source) =>
        b.some((other) => other.queryUuid === source.queryUuid),
    );

/**
 * Pairs each stored source with one of the viewer's sources that read the
 * same rows. Null when any stored source has no counterpart.
 */
const mapStoredQueryUuids = (
    stored: DataAppSourceHash[],
    current: DataAppSourceHash[],
): Map<string, string> | null => {
    const unused = [...current];
    const mapping = new Map<string, string>();
    for (const source of stored) {
        const index = unused.findIndex((c) => c.hash === source.hash);
        if (index === -1) return null;
        mapping.set(source.queryUuid, unused[index].queryUuid);
        unused.splice(index, 1);
    }
    return mapping;
};
const MAX_PROMPT_CHARS = 2000;
const MAX_FOCUS_ENTRIES = 30;
const MAX_FOCUS_VALUE_CHARS = 200;
// Model runs per viewer and app per minute, counted in the database so
// every pod shares one bucket. Cache hits and lookups are free.
const RATE_LIMITS_PER_MINUTE: Record<DataAppAnalysisOperation, number> = {
    detect: 6,
    prompt: 20,
    investigate: 3,
};
const RATE_WINDOW_MS = 60_000;
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
    aiAgentModel: AiAgentModel;
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

    private readonly aiAgentModel: AiAgentModel;

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
        this.aiAgentModel = deps.aiAgentModel;
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

    // The org setting can flip while the model runs: never store or serve
    // a result produced after consent was withdrawn.
    private async assertStillEnabled(organizationUuid: string): Promise<void> {
        if (
            !(await this.aiOrganizationSettingsService.isDataAppRuntimeAiEnabled(
                organizationUuid,
            ))
        ) {
            throw new DataAppAnalysisUnavailableError(
                'AI analysis in data apps was turned off for this organization',
                'org_setting_disabled',
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
    ): Promise<{
        content: string;
        grounding: GroundingSource[];
        sectionHashes: DataAppSourceHash[];
    }> {
        const grounding: GroundingSource[] = [];
        const sectionHashes: DataAppSourceHash[] = [];
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
                const csv = convertQueryResultsToCsv({ rows, fields });
                const legend = fieldLegend(fields, fieldIds);
                // Label and query uuid excluded: identity is the rows read.
                sectionHashes.push({
                    queryUuid: source.queryUuid,
                    hash: sha256(
                        `${legend}\n${csv}${truncated ? '\n[truncated]' : ''}`,
                    ),
                });
                return appendCsvSection(
                    acc,
                    title,
                    csv,
                    truncated,
                    `Query: ${source.queryUuid}\nFields: ${legend}\n`,
                );
            },
            Promise.resolve(emptySectionAccumulator()),
        );
        return {
            content: serializeSections(sections),
            grounding,
            sectionHashes,
        };
    }

    private static validateSources(sources: DataAppAnalysisSource[]): void {
        if (sources.length === 0) {
            throw new ParameterError('At least one source query is required');
        }
        if (sources.length > MAX_SOURCES) {
            throw new ParameterError(
                `At most ${MAX_SOURCES} source queries can be analysed at once`,
            );
        }
    }

    private static toDetection(
        row: DbDataAppAnalysis & { operation: 'detect' },
    ): DataAppAnalysis {
        return {
            ...row.result,
            analysisId: row.data_app_analysis_uuid,
            appUuid: row.app_id,
            appVersion: row.app_version,
            sources: row.sources,
            generatedAt: row.created_at,
        };
    }

    private static toInvestigation(
        row: DbDataAppAnalysis & { operation: 'investigate' },
    ): DataAppInvestigation {
        return {
            ...row.result,
            investigationId: row.data_app_analysis_uuid,
            analysisId: row.parent_analysis_uuid,
            appUuid: row.app_id,
            appVersion: row.app_version,
            generatedAt: row.created_at,
        };
    }

    /**
     * The viewer's own detection of exactly these rows, or a copy of another
     * viewer's. Identical content hash means identical rows, so the findings
     * transfer; investigations do not, since they ran further queries under
     * the other viewer's access.
     */
    private async findReusable(args: {
        user: SessionUser;
        projectUuid: string;
        appUuid: string;
        appVersion: number;
        sources: DataAppAnalysisSource[];
        instructions: string | null;
        sectionHashes: DataAppSourceHash[];
        contentHash: string;
    }): Promise<DataAppAnalysisLookup | null> {
        const own = await this.dataAppAnalysisModel.findLatestDetectByHash({
            appUuid: args.appUuid,
            appVersion: args.appVersion,
            contentHash: args.contentHash,
            userUuid: args.user.userUuid,
        });
        if (own) {
            // The app re-runs its queries on every open, so the stored row
            // usually names query uuids that no longer exist. Rebind it to
            // the current ones so markers match and Investigate reads live
            // results; ids and investigations stay put.
            let current = own;
            if (!sameQueryUuids(own.sources, args.sources)) {
                const mapping = mapStoredQueryUuids(
                    own.source_hashes ?? [],
                    args.sectionHashes,
                );
                if (mapping) {
                    const result = remapQueryUuids(own.result, mapping);
                    await this.dataAppAnalysisModel.rebindSources(
                        own.data_app_analysis_uuid,
                        {
                            sources: args.sources,
                            sourceHashes: args.sectionHashes,
                            result,
                        },
                    );
                    current = {
                        ...own,
                        sources: args.sources,
                        source_hashes: args.sectionHashes,
                        result,
                    };
                }
            }
            const investigations =
                await this.dataAppAnalysisModel.findInvestigations(
                    current.data_app_analysis_uuid,
                );
            return {
                analysis: DataAppAnalysisService.toDetection(current),
                investigations: investigations.map(
                    DataAppAnalysisService.toInvestigation,
                ),
            };
        }
        const shared = await this.dataAppAnalysisModel.findLatestDetectByHash({
            appUuid: args.appUuid,
            appVersion: args.appVersion,
            contentHash: args.contentHash,
            userUuid: null,
        });
        if (!shared) return null;
        const mapping = mapStoredQueryUuids(
            shared.source_hashes ?? [],
            args.sectionHashes,
        );
        if (!mapping) return null;
        const copy = await this.dataAppAnalysisModel.create({
            organizationUuid: args.user.organizationUuid!,
            projectUuid: args.projectUuid,
            appUuid: args.appUuid,
            appVersion: args.appVersion,
            createdByUserUuid: args.user.userUuid,
            operation: 'detect',
            sources: args.sources,
            instructions: args.instructions,
            result: remapQueryUuids(shared.result, mapping),
            modelId: shared.model_id,
            contentHash: args.contentHash,
            sourceHashes: args.sectionHashes,
            reusedFromAnalysisUuid:
                shared.reused_from_analysis_uuid ??
                shared.data_app_analysis_uuid,
        });
        return {
            analysis: DataAppAnalysisService.toDetection(
                copy as DbDataAppAnalysis & { operation: 'detect' },
            ),
            investigations: [],
        };
    }

    /** A stored analysis of exactly the rows the viewer sees now; never runs the model. */
    async lookup(
        account: Account,
        projectUuid: string,
        appUuid: string,
        body: DataAppLookupRequest,
    ): Promise<DataAppAnalysisLookup | null> {
        DataAppAnalysisService.validateSources(body.sources);
        const instructions = body.instructions?.trim() || null;
        const { user, appVersion } = await this.assertViewer(
            account,
            projectUuid,
            appUuid,
        );
        const { sectionHashes } = await this.buildContent(
            account,
            projectUuid,
            body.sources,
        );
        return this.findReusable({
            user,
            projectUuid,
            appUuid,
            appVersion,
            sources: body.sources,
            instructions,
            sectionHashes,
            contentHash: contentHashOf(sectionHashes, instructions),
        });
    }

    // Concurrent detects of the same rows by the same viewer share one run.
    private readonly inFlightDetects = new Map<
        string,
        Promise<{
            analysis: DataAppAnalysis;
            sectionHashes: DataAppSourceHash[];
        }>
    >();

    async detect(
        account: Account,
        projectUuid: string,
        appUuid: string,
        body: DataAppDetectRequest,
    ): Promise<DataAppAnalysis> {
        DataAppAnalysisService.validateSources(body.sources);
        const instructions = body.instructions?.trim() || null;
        const { user, appVersion } = await this.assertViewer(
            account,
            projectUuid,
            appUuid,
        );
        const { content, grounding, sectionHashes } = await this.buildContent(
            account,
            projectUuid,
            body.sources,
        );
        const contentHash = contentHashOf(sectionHashes, instructions);
        if (!body.force) {
            const reusable = await this.findReusable({
                user,
                projectUuid,
                appUuid,
                appVersion,
                sources: body.sources,
                instructions,
                sectionHashes,
                contentHash,
            });
            if (reusable) return reusable.analysis;
        }
        const inFlightKey = `${user.userUuid}:${appUuid}:${appVersion}:${contentHash}`;
        const inFlight = this.inFlightDetects.get(inFlightKey);
        if (inFlight) {
            // Same rows, but a second tab has its own query uuids: hand back
            // the shared findings keyed to this caller's queries.
            const shared = await inFlight;
            const mapping = mapStoredQueryUuids(
                shared.sectionHashes,
                sectionHashes,
            );
            return {
                ...shared.analysis,
                ...(mapping ? remapQueryUuids(shared.analysis, mapping) : {}),
                sources: body.sources,
            };
        }
        // Registered before any await so a concurrent caller joins this run
        // instead of starting (and being counted for) its own.
        const run = this.assertRate(user.userUuid, appUuid, 'detect')
            .then(() =>
                this.runDetect({
                    user,
                    projectUuid,
                    appUuid,
                    appVersion,
                    sources: body.sources,
                    instructions,
                    content,
                    grounding,
                    sectionHashes,
                    contentHash,
                }),
            )
            .finally(() => this.inFlightDetects.delete(inFlightKey));
        this.inFlightDetects.set(inFlightKey, run);
        return (await run).analysis;
    }

    private async runDetect(args: {
        user: SessionUser;
        projectUuid: string;
        appUuid: string;
        appVersion: number;
        sources: DataAppAnalysisSource[];
        instructions: string | null;
        content: string;
        grounding: GroundingSource[];
        sectionHashes: DataAppSourceHash[];
        contentHash: string;
    }): Promise<{
        analysis: DataAppAnalysis;
        sectionHashes: DataAppSourceHash[];
    }> {
        const {
            user,
            projectUuid,
            appUuid,
            appVersion,
            sources,
            instructions,
            content,
            grounding,
        } = args;
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
        await this.assertStillEnabled(user.organizationUuid!);

        const row = await this.dataAppAnalysisModel.create({
            organizationUuid: user.organizationUuid!,
            projectUuid,
            appUuid,
            appVersion,
            createdByUserUuid: user.userUuid,
            operation: 'detect',
            sources,
            instructions,
            result,
            modelId,
            contentHash: args.contentHash,
            sourceHashes: args.sectionHashes,
            reusedFromAnalysisUuid: null,
        });

        return {
            analysis: {
                ...result,
                analysisId: row.data_app_analysis_uuid,
                appUuid,
                appVersion,
                sources,
                generatedAt: row.created_at,
            },
            sectionHashes: args.sectionHashes,
        };
    }

    private async assertRate(
        userUuid: string,
        appUuid: string,
        operation: DataAppAnalysisOperation,
    ): Promise<void> {
        const now = Date.now();
        const windowStartedAt = new Date(
            Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS,
        );
        const count = await this.dataAppAnalysisModel.incrementRateCounter({
            appUuid,
            userUuid,
            operation,
            windowStartedAt,
        });
        const limit = RATE_LIMITS_PER_MINUTE[operation];
        if (count > limit) {
            const retryAfterSeconds = Math.max(
                1,
                Math.ceil(
                    (windowStartedAt.getTime() + RATE_WINDOW_MS - now) / 1000,
                ),
            );
            throw new TooManyRequestsError(
                `Too many AI ${operation} requests for this app. Try again in ${retryAfterSeconds}s.`,
                { code: 'rate_limited', operation, retryAfterSeconds },
            );
        }
    }

    private static validatePrompt(body: DataAppPromptRequest): {
        prompt: string;
        focus: Record<string, string> | null;
    } {
        const prompt = body.prompt?.trim() ?? '';
        if (prompt.length === 0) {
            throw new ParameterError('A prompt is required');
        }
        if (prompt.length > MAX_PROMPT_CHARS) {
            throw new ParameterError(
                `Prompts are limited to ${MAX_PROMPT_CHARS} characters`,
            );
        }
        if (body.sources.length === 0) {
            throw new ParameterError('At least one source query is required');
        }
        if (body.sources.length > MAX_SOURCES) {
            throw new ParameterError(
                `At most ${MAX_SOURCES} source queries can be analysed at once`,
            );
        }
        const focusEntries = Object.entries(body.focus ?? {});
        if (focusEntries.length > MAX_FOCUS_ENTRIES) {
            throw new ParameterError(
                `Focus rows are limited to ${MAX_FOCUS_ENTRIES} fields`,
            );
        }
        const focus =
            focusEntries.length === 0
                ? null
                : Object.fromEntries(
                      focusEntries.map(([fieldId, value]) => [
                          fieldId,
                          String(value).slice(0, MAX_FOCUS_VALUE_CHARS),
                      ]),
                  );
        return { prompt, focus };
    }

    /**
     * Answer an app-authored question over the viewer's own results with the
     * ambient fast model. Same gates as detect; the answer is plain text and
     * is persisted like any other analysis.
     */
    async prompt(
        account: Account,
        projectUuid: string,
        appUuid: string,
        body: DataAppPromptRequest,
    ): Promise<DataAppPromptAnswer> {
        const { prompt, focus } = DataAppAnalysisService.validatePrompt(body);
        const { user, appVersion } = await this.assertViewer(
            account,
            projectUuid,
            appUuid,
        );
        await this.assertRate(user.userUuid, appUuid, 'prompt');
        const { content, grounding } = await this.buildContent(
            account,
            projectUuid,
            body.sources,
        );
        // Only field ids the sources actually carry reach the model.
        const knownFieldIds = new Set(
            grounding.flatMap((source) => [...source.fieldIds]),
        );
        const groundedFocus = Object.fromEntries(
            Object.entries(focus ?? {}).filter(([fieldId]) =>
                knownFieldIds.has(fieldId),
            ),
        );
        const focusForModel =
            Object.keys(groundedFocus).length > 0 ? groundedFocus : null;
        const { text, modelId } = await this.aiService.answerDataAppPrompt(
            user,
            { content, prompt, focus: focusForModel, projectUuid },
        );
        const result = { prompt, focus: focusForModel, text };
        await this.assertStillEnabled(user.organizationUuid!);
        const row = await this.dataAppAnalysisModel.create({
            organizationUuid: user.organizationUuid!,
            projectUuid,
            appUuid,
            appVersion,
            createdByUserUuid: user.userUuid,
            operation: 'prompt',
            sources: body.sources,
            instructions: null,
            result,
            modelId,
        });
        return {
            ...result,
            promptId: row.data_app_analysis_uuid,
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
        if (row.operation === 'prompt') {
            return {
                operation: 'prompt',
                ...row.result,
                ...base,
                promptId: row.data_app_analysis_uuid,
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
        await this.assertRate(user.userUuid, appUuid, 'investigate');

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

    /**
     * Worker entrypoint: runs the agent and persists the result under the
     * viewer. Once `abortSignal` fires nothing is persisted or logged; the
     * worker's timeout handler owns that job's final status.
     */
    /** Drops minute buckets older than a day; called by the daily sweep. */
    async cleanRateCounters(now: Date = new Date()): Promise<number> {
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return this.dataAppAnalysisModel.deleteRateCountersBefore(cutoff);
    }

    async runInvestigation(
        payload: DataAppInvestigateJobPayload,
        jobId: string,
        scheduledTime: Date,
        abortSignal?: AbortSignal,
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
                        abortSignal,
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
            if (abortSignal?.aborted) return;
            try {
                await this.assertStillEnabled(payload.organizationUuid);
            } catch (e) {
                // The agent run already persisted the prompt and answer in
                // the thread; the thread is ours, so withdraw it too.
                await this.aiAgentModel.deleteThread({
                    organizationUuid: payload.organizationUuid,
                    threadUuid: thread.uuid,
                });
                throw e;
            }

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
            if (abortSignal?.aborted) return;
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: { ...baseLog.details, error: getErrorMessage(e) },
            });
            throw e;
        }
    }
}
