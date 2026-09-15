import {
    assertRegisteredAccount,
    FeatureFlags,
    ForbiddenError,
    getItemLabelWithoutTableName,
    isDimension,
    isJwtUser,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    type Account,
    type DataAppAnalysis,
    type DataAppAnalysisSource,
    type DataAppDetectRequest,
    type ItemsMap,
    type SessionUser,
} from '@lightdash/common';
import { toSessionUser } from '../../../auth/account';
import { type AppModel } from '../../../models/AppModel';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { type AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../services/BaseService';
import { CsvService } from '../../../services/CsvService/CsvService';
import type { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import { type DataAppAnalysisModel } from '../../models/DataAppAnalysisModel';
import { type ExternalConnectionModel } from '../../models/ExternalConnectionModel';
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

type Dependencies = {
    dataAppAnalysisModel: DataAppAnalysisModel;
    appModel: AppModel;
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
            | 'unsupported_context',
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
     * data-apps flag. Each has its own code so the host can explain which.
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
}
