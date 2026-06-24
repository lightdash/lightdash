import {
    AnyType,
    applyDimensionOverrides,
    assertUnreachable,
    CompileProjectPayload,
    convertReplaceableFieldMatchMapToReplaceCustomFields,
    CreateProject,
    CreateSchedulerAndTargets,
    CreateSchedulerLog,
    CreateSchedulerTarget,
    DashboardFilterRule,
    DashboardFilters,
    DateZoom,
    derivePivotConfigurationFromPivotConfig,
    DimensionType,
    DownloadFileType,
    EmailNotificationPayload,
    ExportContentPayload,
    ExportCsvDashboardPayload,
    FeatureFlags,
    FieldReferenceError,
    FieldType,
    ForbiddenError,
    formatRows,
    friendlyName,
    getColumnOrderFromVizTableConfig,
    getConditionalFormattingsFromChartConfig,
    getCustomLabelsFromTableConfig,
    getCustomLabelsFromVizTableConfig,
    getDownloadPivotConfig,
    getDownloadPivotOptions,
    getErrorMessage,
    getHiddenFieldsFromVizTableConfig,
    getHiddenTableFields,
    getHumanReadableCronExpression,
    getItemMap,
    getPivotConfig,
    getRequestMethod,
    getSchedulerResourceTypeAndId,
    getSchedulerUuid,
    GoogleSheetsQuotaError,
    GoogleSheetsTransientError,
    GsheetsNotificationPayload,
    isAugmentedScheduler,
    isChartScheduler,
    isChartValidationError,
    isCreateScheduler,
    isCreateSchedulerGoogleChatTarget,
    isCreateSchedulerMsTeamsTarget,
    isCreateSchedulerSlackTarget,
    isDashboardChartTileType,
    isDashboardScheduler,
    isDashboardSqlChartTile,
    isDashboardValidationError,
    isSchedulerCsvOptions,
    isSchedulerGsheetsOptions,
    isSchedulerImageOptions,
    isTableChartConfig,
    isTileInSelectedTabs,
    isVizTableConfig,
    LightdashPage,
    MAX_SAFE_INTEGER,
    MetricType,
    MissingConfigError,
    NotEnoughResults,
    NotFoundError,
    NotificationFrequency,
    NotificationPayloadBase,
    operatorActionValue,
    ParameterError,
    ParametersValuesMap,
    PartialFailureType,
    pivotResultsAsCsv,
    QueryExecutionContext,
    ReadFileError,
    RenameResourcesPayload,
    ReplaceableCustomFields,
    ReplaceCustomFields,
    ReplaceCustomFieldsPayload,
    SavedChartDAO,
    ScheduledDeliveryPayload,
    SCHEDULER_TASKS,
    SchedulerAndTargets,
    SchedulerCreateProjectWithCompilePayload,
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerLog,
    SchedulerResourceType,
    SessionUser,
    setUuidParam,
    SlackInstallationNotFoundError,
    SlackNotificationPayload,
    sleep,
    SqlRunnerPayload,
    SqlRunnerPivotQueryPayload,
    SyncSlackChannelsPayload,
    ThresholdOperator,
    ThresholdOptions,
    ThresholdStatus,
    TimeZone,
    translateSlackError,
    UnexpectedGoogleSheetsError,
    UnexpectedServerError,
    UploadGsheetFromRowsPayload,
    UploadGsheetPayload,
    UploadMetricGsheetPayload,
    ValidateProjectPayload,
    VizColumn,
    WarehouseConnectionError,
    type Account as AccountType,
    type BatchDeliveryResult,
    type DeliveryResult,
    type DownloadAsyncQueryResultsPayload,
    type EmailBatchNotificationPayload,
    type GoogleChatBatchNotificationPayload,
    type GoogleChatNotificationPayload,
    type GsheetColumn,
    type ItemsMap,
    type MaterializePreAggregatePayload,
    type MetricQuery,
    type MsTeamsBatchNotificationPayload,
    type MsTeamsNotificationPayload,
    type PartialFailure,
    type PivotConfiguration,
    type ReadyQueryResultsPage,
    type SchedulerIndexCatalogJobPayload,
    type SlackBatchNotificationPayload,
} from '@lightdash/common';
import archiver from 'archiver';
import fsSync from 'fs';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import ExecutionContext from 'node-execution-context';
import pLimit from 'p-limit';
import slackifyMarkdown from 'slackify-markdown';
import { Readable } from 'stream';
import {
    DownloadCsv,
    LightdashAnalytics,
    parseAnalyticsLimit,
} from '../analytics/LightdashAnalytics';
import EmailClient from '../clients/EmailClient/EmailClient';
import { type FileStorageClient } from '../clients/FileStorage/FileStorageClient';
import { GoogleDriveClient } from '../clients/Google/GoogleDriveClient';
import { GoogleChatClient } from '../clients/GoogleChat/GoogleChatClient';
import { MicrosoftTeamsClient } from '../clients/MicrosoftTeams/MicrosoftTeamsClient';
import { SlackClient } from '../clients/Slack/SlackClient';
import {
    getChartAndDashboardBlocks,
    getChartCsvResultsBlocks,
    getChartThresholdAlertBlocks,
    getDashboardCsvResultsBlocks,
    getDeliveryFailureRecipientBlocks,
    getNotificationChannelErrorBlocks,
} from '../clients/Slack/SlackMessageBlocks';
import { LightdashConfig } from '../config/parseConfig';
import type { PreAggregateModel } from '../ee/models/PreAggregateModel';
import type { PreAggregateMaterializationService } from '../ee/services/PreAggregateMaterializationService/PreAggregateMaterializationService';
import Logger from '../logging/logger';
import type { ExecutionContextInfo } from '../logging/winston';
import { OrganizationSettingsModel } from '../models/OrganizationSettingsModel';
import { AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import { SCHEDULER_POLLING_OPTIONS } from '../services/AsyncQueryService/types';
import type { CatalogService } from '../services/CatalogService/CatalogService';
import {
    CsvService,
    getSchedulerCsvLimit,
} from '../services/CsvService/CsvService';
import { DashboardService } from '../services/DashboardService/DashboardService';
import { DeployService } from '../services/DeployService';
import { ExcelService } from '../services/ExcelService/ExcelService';
import { WorkbookExportHelper } from '../services/ExcelService/WorkbookExportHelper';
import type { FeatureFlagService } from '../services/FeatureFlag/FeatureFlagService';
import { resolveOrganizationExportLimits } from '../services/OrganizationSettingsService/resolveExportLimits';
import { PersistentDownloadFileService } from '../services/PersistentDownloadFileService/PersistentDownloadFileService';
import { getDashboardParametersValuesMap } from '../services/ProjectService/parameters';
import { ProjectService } from '../services/ProjectService/ProjectService';
import { RenameService } from '../services/RenameService/RenameService';
import { SchedulerService } from '../services/SchedulerService/SchedulerService';
import {
    ScreenshotContext,
    UnfurlService,
} from '../services/UnfurlService/UnfurlService';
import { UserService } from '../services/UserService';
import { ValidationService } from '../services/ValidationService/ValidationService';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { sanitizeGenericFileName } from '../utils/FileDownloadUtils/FileDownloadUtils';
import { SchedulerClient } from './SchedulerClient';
import { SchedulerDeliveryError } from './SchedulerDeliveryError';

export interface SchedulerAiAugmentation {
    generateScheduledReport(
        scheduler: SchedulerAndTargets | CreateSchedulerAndTargets,
        organizationUuid: string,
    ): Promise<string>;
}

export type SchedulerTaskArguments = {
    schedulerAiAugmentation?: SchedulerAiAugmentation;
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    csvService: CsvService;
    dashboardService: DashboardService;
    deployService: DeployService;
    projectService: ProjectService;
    schedulerService: SchedulerService;
    unfurlService: UnfurlService;
    userService: UserService;
    validationService: ValidationService;
    emailClient: EmailClient;
    googleDriveClient: GoogleDriveClient;
    fileStorageClient: FileStorageClient;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
    catalogService: CatalogService;
    encryptionUtil: EncryptionUtil;
    msTeamsClient: MicrosoftTeamsClient;
    googleChatClient: GoogleChatClient;
    renameService: RenameService;
    asyncQueryService: AsyncQueryService;
    featureFlagService: FeatureFlagService;
    persistentDownloadFileService: PersistentDownloadFileService;
    preAggregateModel: PreAggregateModel;
    preAggregateMaterializationService: PreAggregateMaterializationService;
    organizationSettingsModel: OrganizationSettingsModel;
};

/**
 * Builds the scheduler sub-context from a partial set of attribution fields.
 * Pure function — used directly in tests; the default updater calls it.
 *
 * Returns `null` when no fields are populated so callers can short-circuit
 * the ExecutionContext write.
 */
export function buildSchedulerLogContext(args: {
    jobId?: string;
    schedulerUuid?: string;
    schedulerName?: string;
    savedSqlUuid?: string | null;
}): NonNullable<ExecutionContextInfo['scheduler']> | null {
    const schedulerCtx: NonNullable<ExecutionContextInfo['scheduler']> = {};
    if (args.schedulerUuid) schedulerCtx.scheduler_uuid = args.schedulerUuid;
    if (args.schedulerName) schedulerCtx.scheduler_name = args.schedulerName;
    if (args.savedSqlUuid) schedulerCtx.saved_sql_uuid = args.savedSqlUuid;
    if (args.jobId) schedulerCtx.job_id = args.jobId;
    return Object.keys(schedulerCtx).length === 0 ? null : schedulerCtx;
}

/**
 * Strategy used to write scheduler attribution into the surrounding log
 * context. Injected so tests can supply a spy; the default writes through
 * the AsyncLocalStorage-backed `ExecutionContext`.
 */
export type SchedulerLogContextUpdater = (
    update: Pick<ExecutionContextInfo, 'scheduler'>,
) => void;

const defaultSchedulerLogContextUpdater: SchedulerLogContextUpdater = (
    update,
) => {
    if (!ExecutionContext.exists()) return;
    ExecutionContext.update(update as unknown as Record<string, unknown>);
};

/**
 * Stamps the current job's log context with scheduler/sync attribution so
 * every downstream log line and warehouse `queryTags` row carries the
 * originating scheduler_uuid, scheduler_name, saved_sql_uuid, and job_id.
 *
 * Called once per scheduler task entry point. Replaces any prior scheduler
 * sub-context. Organization context (organization_uuid, organization_name)
 * is set centrally by SchedulerTaskTracer before the task runs.
 *
 * The context updater is injected (default: writes through ExecutionContext)
 * so unit tests can verify the built sub-context without setting up
 * AsyncLocalStorage.
 */
export function setSchedulerJobLogContext(
    args: {
        jobId?: string;
        schedulerUuid?: string;
        schedulerName?: string;
        savedSqlUuid?: string | null;
    },
    update: SchedulerLogContextUpdater = defaultSchedulerLogContextUpdater,
) {
    const scheduler = buildSchedulerLogContext(args);
    if (!scheduler) return;
    update({ scheduler });
}

export const GSHEET_UPLOAD_MAX_ATTEMPTS = 3;
const GSHEET_UPLOAD_RETRY_BASE_MS = 2000;

export async function retryTransientGoogleSheetsWrite(
    write: () => Promise<void>,
    onRetry: (attempt: number) => Promise<void> = async () => {},
    attempt = 1,
): Promise<void> {
    try {
        await write();
    } catch (e) {
        const isTransient =
            e instanceof GoogleSheetsTransientError ||
            e instanceof GoogleSheetsQuotaError;
        if (!isTransient || attempt >= GSHEET_UPLOAD_MAX_ATTEMPTS) {
            throw e;
        }
        await sleep(GSHEET_UPLOAD_RETRY_BASE_MS * attempt);
        await onRetry(attempt + 1);
        await retryTransientGoogleSheetsWrite(write, onRetry, attempt + 1);
    }
}

function gsheetColumnTypeToFieldType(
    columnType: GsheetColumn['type'],
): MetricType | DimensionType {
    switch (columnType) {
        case 'number':
            return MetricType.NUMBER;
        case 'date':
            return DimensionType.DATE;
        case 'timestamp':
            return DimensionType.TIMESTAMP;
        case 'boolean':
            return DimensionType.BOOLEAN;
        default:
            return DimensionType.STRING;
    }
}

export function buildItemMapFromColumns(columns: GsheetColumn[]): ItemsMap {
    // appendToSheet's formatter reads `type` (for date/timestamp parsing) and
    // ignores most other Item fields, so a minimal synthetic shape is enough.
    // Cast via unknown — the real Item union has many required fields, but
    // appendToSheet's formatter only reads `type` and `fieldType`.
    const map: ItemsMap = {};
    for (const col of columns) {
        map[col.key] = {
            name: col.key,
            label: col.label ?? col.key,
            fieldType:
                col.type === 'number' ? FieldType.METRIC : FieldType.DIMENSION,
            type: gsheetColumnTypeToFieldType(col.type),
            table: '',
            tableLabel: '',
            sql: '',
            hidden: false,
        } as unknown as ItemsMap[string];
    }
    return map;
}

export default class SchedulerTask {
    protected readonly lightdashConfig: LightdashConfig;

    protected readonly analytics: LightdashAnalytics;

    protected readonly csvService: CsvService;

    protected readonly dashboardService: DashboardService;

    protected readonly deployService: DeployService;

    protected readonly projectService: ProjectService;

    protected readonly schedulerService: SchedulerService;

    protected readonly unfurlService: UnfurlService;

    protected readonly userService: UserService;

    protected readonly validationService: ValidationService;

    protected readonly emailClient: EmailClient;

    protected readonly googleDriveClient: GoogleDriveClient;

    protected readonly fileStorageClient: FileStorageClient;

    protected readonly schedulerClient: SchedulerClient;

    protected readonly schedulerAiAugmentation?: SchedulerAiAugmentation;

    protected readonly slackClient: SlackClient;

    private readonly catalogService: CatalogService;

    private readonly encryptionUtil: EncryptionUtil;

    protected readonly msTeamsClient: MicrosoftTeamsClient;

    protected readonly googleChatClient: GoogleChatClient;

    private readonly renameService: RenameService;

    protected readonly asyncQueryService: AsyncQueryService;

    private readonly featureFlagService: FeatureFlagService;

    protected readonly persistentDownloadFileService: PersistentDownloadFileService;

    protected readonly preAggregateMaterializationService: PreAggregateMaterializationService;

    protected readonly preAggregateModel: PreAggregateModel;

    protected readonly organizationSettingsModel: OrganizationSettingsModel;

    constructor(args: SchedulerTaskArguments) {
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.csvService = args.csvService;
        this.dashboardService = args.dashboardService;
        this.deployService = args.deployService;
        this.projectService = args.projectService;
        this.schedulerService = args.schedulerService;
        this.unfurlService = args.unfurlService;
        this.userService = args.userService;
        this.validationService = args.validationService;
        this.emailClient = args.emailClient;
        this.googleDriveClient = args.googleDriveClient;
        this.fileStorageClient = args.fileStorageClient;
        this.schedulerClient = args.schedulerClient;
        this.schedulerAiAugmentation = args.schedulerAiAugmentation;
        this.slackClient = args.slackClient;
        this.catalogService = args.catalogService;
        this.encryptionUtil = args.encryptionUtil;
        this.msTeamsClient = args.msTeamsClient;
        this.googleChatClient = args.googleChatClient;
        this.renameService = args.renameService;
        this.asyncQueryService = args.asyncQueryService;
        this.featureFlagService = args.featureFlagService;
        this.persistentDownloadFileService = args.persistentDownloadFileService;
        this.preAggregateModel = args.preAggregateModel;
        this.preAggregateMaterializationService =
            args.preAggregateMaterializationService;
        this.organizationSettingsModel = args.organizationSettingsModel;
    }

    /**
     * Effective scheduled-delivery link expiry (seconds) for an org and a
     * delivery channel. Org overrides win over instance env, and a channel
     * override wins over the base, so precedence is:
     *   org channel → org base → env channel → env base.
     * The resulting value flows to `createPersistentUrl`, which transparently
     * switches to persistent download URLs when it exceeds the S3 7-day limit.
     */
    protected async getDeliveryExpirationSeconds(
        organizationUuid: string,
        channel: 'email' | 'slack' | 'msteams' | 'googlechat',
    ): Promise<number> {
        const settings =
            await this.organizationSettingsModel.get(organizationUuid);
        const pdu = this.lightdashConfig.persistentDownloadUrls;
        const orgChannel: number | null = {
            email: settings.scheduledDeliveryExpirationSecondsEmail,
            slack: settings.scheduledDeliveryExpirationSecondsSlack,
            msteams: settings.scheduledDeliveryExpirationSecondsMsTeams,
            googlechat: settings.scheduledDeliveryExpirationSecondsGoogleChat,
        }[channel];
        const envChannel: number | undefined = {
            email: pdu.expirationSecondsEmail,
            slack: pdu.expirationSecondsSlack,
            msteams: pdu.expirationSecondsMsTeams,
            googlechat: undefined,
        }[channel];
        return (
            orgChannel ??
            settings.scheduledDeliveryExpirationSeconds ??
            envChannel ??
            pdu.expirationSeconds
        );
    }

    private static getCsvOptions(
        scheduler: SchedulerAndTargets | CreateSchedulerAndTargets,
    ) {
        return isSchedulerCsvOptions(scheduler.options)
            ? scheduler.options
            : undefined;
    }

    protected async getChartOrDashboard(
        chartUuid: string | null,
        dashboardUuid: string | null,
        schedulerUuid: string | undefined,
        context: DownloadCsv['properties']['context'],
        selectedTabs: string[] | null,
        appUuid: string | null = null,
    ) {
        if (appUuid) {
            const app =
                await this.schedulerService.appModel.findAppByUuid(appUuid);
            if (!app) {
                throw new Error(`App not found: ${appUuid}`);
            }
            return {
                url: `${this.lightdashConfig.siteUrl}/projects/${app.project_uuid}/apps/${appUuid}/preview`,
                minimalUrl: `${this.lightdashConfig.headlessBrowser.internalLightdashHost}/minimal/projects/${app.project_uuid}/apps/${appUuid}`,
                details: {
                    name: app.name,
                    description: app.description,
                },
                pageType: LightdashPage.APP,
                organizationUuid: app.organization_uuid,
                projectUuid: app.project_uuid,
            };
        }
        if (chartUuid) {
            const chart =
                await this.schedulerService.savedChartModel.getSummary(
                    chartUuid,
                );
            return {
                url: `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chartUuid}`,
                minimalUrl: `${this.lightdashConfig.headlessBrowser.internalLightdashHost}/minimal/projects/${chart.projectUuid}/saved/${chartUuid}?context=${context}`,
                details: {
                    name: chart.name,
                    description: chart.description,
                },
                pageType: LightdashPage.CHART,
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
            };
        }

        if (dashboardUuid) {
            const dashboard =
                await this.schedulerService.dashboardModel.getByIdOrSlug(
                    dashboardUuid,
                );

            const queryParams = new URLSearchParams();
            if (schedulerUuid) queryParams.set('schedulerUuid', schedulerUuid);
            if (selectedTabs)
                queryParams.set('selectedTabs', JSON.stringify(selectedTabs));
            if (context) queryParams.set('context', context);

            return {
                url: `${this.lightdashConfig.siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}/view`,
                minimalUrl: `${
                    this.lightdashConfig.headlessBrowser.internalLightdashHost
                }/minimal/projects/${
                    dashboard.projectUuid
                }/dashboards/${dashboardUuid}${
                    queryParams.toString() ? `?${queryParams.toString()}` : ''
                }`,
                details: {
                    name: dashboard.name,
                    description: dashboard.description,
                },
                pageType: LightdashPage.DASHBOARD,
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            };
        }

        throw new Error("Chart or dashboard can't be both undefined");
    }

    protected async getNotificationPageData(
        scheduler: CreateSchedulerAndTargets,
        jobId: string,
        isFinalAttempt: boolean,
        expirationSecondsOverride?: number,
        exportOptions?: {
            dashboardFilters?: ExportContentPayload['dashboardFilters'];
            dateZoomGranularity?: ExportContentPayload['dateZoomGranularity'];
        },
    ): Promise<NotificationPayloadBase['page']> {
        const {
            createdBy: userUuid,
            savedChartUuid,
            dashboardUuid,
            appUuid,
            format,
            options,
        } = scheduler;

        let imageUrl;
        let imageS3Key;
        let csvUrl;
        let csvUrls;
        let pdfFile;
        let failures: PartialFailure[] | undefined;

        const schedulerUuid =
            'schedulerUuid' in scheduler &&
            typeof scheduler.schedulerUuid === 'string'
                ? scheduler.schedulerUuid
                : undefined;

        const sendNowSchedulerFilters =
            !schedulerUuid && isDashboardScheduler(scheduler)
                ? scheduler.filters
                : undefined;

        const sendNowSchedulerParameters =
            !schedulerUuid && isDashboardScheduler(scheduler)
                ? scheduler.parameters
                : undefined;

        const selectedTabs = isDashboardScheduler(scheduler)
            ? scheduler.selectedTabs
            : null;

        const context =
            scheduler.thresholds === undefined ||
            scheduler.thresholds.length === 0
                ? QueryExecutionContext.SCHEDULED_DELIVERY
                : QueryExecutionContext.ALERT;

        const {
            url,
            minimalUrl,
            pageType,
            details,
            organizationUuid,
            projectUuid,
        } = await this.getChartOrDashboard(
            savedChartUuid,
            dashboardUuid,
            schedulerUuid,
            context,
            selectedTabs,
            appUuid,
        );

        const schedulerUuidParam = setUuidParam(
            'scheduler_uuid',
            schedulerUuid,
        );
        let deliveryUrl: string;
        if (appUuid) {
            deliveryUrl = `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/apps/${appUuid}/preview?${schedulerUuidParam}`;
        } else if (savedChartUuid) {
            deliveryUrl = `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/saved/${savedChartUuid}/view?${schedulerUuidParam}`;
        } else {
            deliveryUrl = `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/dashboards/${dashboardUuid}/view?${schedulerUuidParam}`;
        }
        const minimalRenderUrl = new URL(minimalUrl);
        if (exportOptions?.dateZoomGranularity) {
            minimalRenderUrl.searchParams.set(
                'dateZoom',
                exportOptions.dateZoomGranularity.toLowerCase(),
            );
        }

        switch (format) {
            case SchedulerFormat.IMAGE:
                try {
                    const imageId = `slack-image-notification-${nanoid()}`;
                    const imageOptions = isSchedulerImageOptions(
                        scheduler.options,
                    )
                        ? scheduler.options
                        : undefined;
                    const unfurlImage = await this.unfurlService.unfurlImage({
                        url: minimalRenderUrl.href,
                        lightdashPage: pageType,
                        imageId,
                        authUserUuid: userUuid,
                        withPdf: imageOptions?.withPdf,
                        gridWidth:
                            isDashboardScheduler(scheduler) &&
                            scheduler.customViewportWidth
                                ? scheduler.customViewportWidth
                                : undefined,
                        context: ScreenshotContext.SCHEDULED_DELIVERY,
                        contextId: jobId,
                        selectedTabs,
                        sendNowSchedulerDashboardFilters:
                            exportOptions?.dashboardFilters,
                        sendNowSchedulerFilters,
                        sendNowSchedulerParameters,
                    });
                    if (unfurlImage.imageUrl === undefined) {
                        throw new Error('Unable to unfurl image');
                    }
                    pdfFile = unfurlImage.pdfFile;
                    imageUrl = unfurlImage.imageUrl;
                    imageS3Key = `${imageId}.png`;

                    if (this.fileStorageClient.isEnabled() && imageUrl) {
                        imageUrl =
                            await this.persistentDownloadFileService.createPersistentUrl(
                                {
                                    s3Key: `${imageId}.png`,
                                    fileType: DownloadFileType.IMAGE,
                                    organizationUuid,
                                    projectUuid,
                                    createdByUserUuid: userUuid,
                                    expirationSeconds:
                                        expirationSecondsOverride,
                                },
                            );
                    }
                } catch (error) {
                    if (this.slackClient.isEnabled && isFinalAttempt) {
                        await this.slackClient.postMessageToNotificationChannel(
                            {
                                organizationUuid,
                                text: `Error sending Scheduled Delivery: ${scheduler.name}`,
                                blocks: getNotificationChannelErrorBlocks(
                                    scheduler.name,
                                    error,
                                    deliveryUrl,
                                ),
                            },
                        );
                    }

                    throw error;
                }
                break;
            case SchedulerFormat.PDF:
                try {
                    const pdfId = `pdf-notification-${nanoid()}`;
                    const unfurlPdf = await this.unfurlService.unfurlImage({
                        url: minimalRenderUrl.href,
                        lightdashPage: pageType,
                        imageId: pdfId,
                        authUserUuid: userUuid,
                        outputFormat: 'pdf',
                        gridWidth:
                            isDashboardScheduler(scheduler) &&
                            scheduler.customViewportWidth
                                ? scheduler.customViewportWidth
                                : undefined,
                        context: ScreenshotContext.SCHEDULED_DELIVERY,
                        contextId: jobId,
                        selectedTabs,
                        sendNowSchedulerDashboardFilters:
                            exportOptions?.dashboardFilters,
                        sendNowSchedulerFilters,
                        sendNowSchedulerParameters,
                    });
                    if (!unfurlPdf.pdfFile) {
                        throw new Error('Unable to generate PDF');
                    }
                    pdfFile = unfurlPdf.pdfFile;
                } catch (error) {
                    if (this.slackClient.isEnabled && isFinalAttempt) {
                        await this.slackClient.postMessageToNotificationChannel(
                            {
                                organizationUuid,
                                text: `Error sending Scheduled Delivery: ${scheduler.name}`,
                                blocks: getNotificationChannelErrorBlocks(
                                    scheduler.name,
                                    error,
                                    deliveryUrl,
                                ),
                            },
                        );
                    }

                    throw error;
                }
                break;
            case SchedulerFormat.GSHEETS:
                // We don't generate CSV files for Google sheets on handleNotification task,
                // instead we directly upload the data from the row results in the uploadGsheets task
                throw new Error("Don't fetch csv for gsheets");
            case SchedulerFormat.CSV:
            case SchedulerFormat.XLSX:
                const account =
                    await this.userService.getAccountByUserUuid(userUuid);
                const csvOptions = isSchedulerCsvOptions(options)
                    ? options
                    : undefined;

                const downloadFileType: DownloadFileType =
                    format === SchedulerFormat.XLSX
                        ? DownloadFileType.XLSX
                        : DownloadFileType.CSV;
                const exportPivotedData =
                    csvOptions?.exportPivotedData !== false;

                const baseAnalyticsProperties: DownloadCsv['properties'] = {
                    jobId,
                    userId: userUuid,
                    organizationId: account.organization.organizationUuid,
                    projectId: projectUuid,
                    fileType: format,
                    values: csvOptions?.formatted ? 'formatted' : 'raw',
                    limit: parseAnalyticsLimit(csvOptions?.limit),
                    storage: this.fileStorageClient.isEnabled()
                        ? 's3'
                        : 'local',
                    context,
                };

                try {
                    if (savedChartUuid) {
                        this.analytics.trackAccount(account, {
                            event: 'download_results.started',
                            userId: account.user.id,
                            properties: baseAnalyticsProperties,
                        });
                        const chart =
                            await this.schedulerService.savedChartModel.get(
                                savedChartUuid,
                            );
                        const {
                            pivotConfig: downloadPivotConfig,
                            exportPivotedData: effectiveExportPivotedData,
                        } = getDownloadPivotOptions(chart, exportPivotedData);
                        const shouldPivotResults = !!downloadPivotConfig;
                        const query =
                            await this.asyncQueryService.executeAsyncSavedChartQuery(
                                {
                                    account,
                                    projectUuid,
                                    chartUuid: savedChartUuid,
                                    invalidateCache: true,
                                    context:
                                        QueryExecutionContext.SCHEDULED_DELIVERY,
                                    limit: getSchedulerCsvLimit(csvOptions),
                                    pivotResults: shouldPivotResults,
                                },
                            );
                        const downloadResult =
                            await this.asyncQueryService.downloadSyncQueryResults(
                                {
                                    account,
                                    projectUuid,
                                    queryUuid: query.queryUuid,
                                    type: downloadFileType,
                                    onlyRaw: csvOptions?.formatted === false,
                                    customLabels:
                                        getCustomLabelsFromTableConfig(
                                            chart.chartConfig.config,
                                        ),
                                    hiddenFields: getHiddenTableFields(
                                        chart.chartConfig,
                                    ),
                                    pivotConfig: downloadPivotConfig,
                                    exportPivotedData:
                                        effectiveExportPivotedData,
                                    columnOrder: chart.tableConfig.columnOrder,
                                    conditionalFormattings:
                                        getConditionalFormattingsFromChartConfig(
                                            chart.chartConfig.config,
                                        ),
                                    expirationSecondsOverride,
                                },
                                SCHEDULER_POLLING_OPTIONS,
                            );
                        csvUrl = {
                            filename:
                                downloadFileType === DownloadFileType.XLSX
                                    ? ExcelService.generateFileId(chart.name)
                                    : CsvService.generateFileId(chart.name),
                            path: downloadResult.fileUrl,
                            localPath:
                                downloadResult.s3FileUrl ??
                                downloadResult.fileUrl,
                            truncated: false,
                        };
                        this.analytics.trackAccount(account, {
                            event: 'download_results.completed',
                            userId: account.user.id,
                            properties: baseAnalyticsProperties,
                        });
                    } else if (dashboardUuid) {
                        this.analytics.trackAccount(account, {
                            event: 'download_results.started',
                            userId: account.user.id,
                            properties: baseAnalyticsProperties,
                        });
                        const dashboard =
                            await this.schedulerService.dashboardModel.getByIdOrSlug(
                                dashboardUuid,
                            );

                        const dashboardFilters =
                            exportOptions?.dashboardFilters ??
                            dashboard.filters;
                        const schedulerFilters = isDashboardScheduler(scheduler)
                            ? scheduler.filters
                            : undefined;
                        const dateZoom = exportOptions?.dateZoomGranularity
                            ? { granularity: exportOptions.dateZoomGranularity }
                            : undefined;

                        if (
                            !exportOptions?.dashboardFilters &&
                            schedulerFilters
                        ) {
                            dashboardFilters.dimensions =
                                applyDimensionOverrides(
                                    dashboard.filters,
                                    schedulerFilters,
                                );
                        }

                        const dashboardParameters = dashboard.parameters || {};
                        const schedulerParameters = isDashboardScheduler(
                            scheduler,
                        )
                            ? scheduler.parameters
                            : undefined;

                        // Convert dashboard parameters to ParametersValuesMap format
                        const convertedDashboardParameters: ParametersValuesMap =
                            Object.fromEntries(
                                Object.entries(dashboardParameters).map(
                                    ([key, param]) => [key, param.value],
                                ),
                            );

                        // Merge scheduler parameters with dashboard parameters (scheduler parameters override)
                        const finalParameters: ParametersValuesMap = {
                            ...convertedDashboardParameters,
                            ...schedulerParameters,
                        };

                        const chartTiles = dashboard.tiles
                            .filter(isDashboardChartTileType)
                            .filter((tile) => tile.properties.savedChartUuid)
                            .filter((tile) =>
                                isTileInSelectedTabs(tile, selectedTabs),
                            )
                            .map((tile) => ({
                                tileUuid: tile.uuid,
                                chartUuid: tile.properties.savedChartUuid!,
                                // Use tile name as initial chart name, will be updated with actual chart name on success
                                chartName:
                                    tile.properties.title ||
                                    tile.properties.chartName ||
                                    'Unknown Chart',
                                type: 'chart' as const,
                            }));
                        const sqlChartTiles = dashboard.tiles
                            .filter(isDashboardSqlChartTile)
                            .filter((tile) => !!tile.properties.savedSqlUuid)
                            .filter((tile) =>
                                isTileInSelectedTabs(tile, selectedTabs),
                            )
                            .map((tile) => ({
                                tileUuid: tile.uuid,
                                chartUuid: tile.properties.savedSqlUuid!,
                                chartName:
                                    tile.properties.title ||
                                    tile.properties.chartName ||
                                    'Unknown SQL Chart',
                                type: 'sql_chart' as const,
                            }));

                        // Metadata for tracking failures - order matches the promises
                        const chartMetadata = [...chartTiles, ...sqlChartTiles];

                        const csvForChartPromises = chartTiles.map(
                            async ({ chartUuid, tileUuid }) => {
                                const chartLimit =
                                    getSchedulerCsvLimit(csvOptions);
                                const chart =
                                    await this.schedulerService.savedChartModel.get(
                                        chartUuid,
                                    );
                                const {
                                    pivotConfig: downloadPivotConfig,
                                    exportPivotedData:
                                        effectiveExportPivotedData,
                                } = getDownloadPivotOptions(
                                    chart,
                                    exportPivotedData,
                                );
                                const shouldPivotResults =
                                    !!downloadPivotConfig;
                                const query =
                                    await this.asyncQueryService.executeAsyncDashboardChartQuery(
                                        {
                                            account,
                                            projectUuid,
                                            tileUuid,
                                            chartUuid,
                                            invalidateCache: true,
                                            context:
                                                QueryExecutionContext.SCHEDULED_DELIVERY,
                                            dashboardUuid,
                                            dashboardFilters,
                                            dashboardSorts: [],
                                            dateZoom,
                                            parameters: finalParameters,
                                            limit: chartLimit,
                                            pivotResults: shouldPivotResults,
                                        },
                                    );
                                const downloadResult =
                                    await this.asyncQueryService.downloadSyncQueryResults(
                                        {
                                            account,
                                            projectUuid,
                                            queryUuid: query.queryUuid,
                                            type: downloadFileType,
                                            onlyRaw:
                                                csvOptions?.formatted === false,
                                            customLabels:
                                                getCustomLabelsFromTableConfig(
                                                    chart.chartConfig.config,
                                                ),
                                            hiddenFields: getHiddenTableFields(
                                                chart.chartConfig,
                                            ),
                                            pivotConfig: downloadPivotConfig,
                                            exportPivotedData:
                                                effectiveExportPivotedData,
                                            columnOrder:
                                                chart.tableConfig.columnOrder,
                                            conditionalFormattings:
                                                getConditionalFormattingsFromChartConfig(
                                                    chart.chartConfig.config,
                                                ),
                                            expirationSecondsOverride,
                                        },
                                        SCHEDULER_POLLING_OPTIONS,
                                    );
                                return {
                                    chartName: chart.name,
                                    filename: chart.name,
                                    path: downloadResult.fileUrl,
                                    localPath:
                                        downloadResult.s3FileUrl ??
                                        downloadResult.fileUrl,
                                    truncated: false,
                                };
                            },
                        );
                        const csvForSqlChartPromises = sqlChartTiles.map(
                            async ({ chartUuid, tileUuid }) => {
                                const sqlLimit =
                                    getSchedulerCsvLimit(csvOptions);
                                const query =
                                    await this.asyncQueryService.executeAsyncDashboardSqlChartQuery(
                                        {
                                            account,
                                            projectUuid,
                                            savedSqlUuid: chartUuid,
                                            invalidateCache: true,
                                            context:
                                                QueryExecutionContext.SCHEDULED_DELIVERY,
                                            dashboardUuid,
                                            tileUuid,
                                            dashboardFilters,
                                            dashboardSorts: [],
                                            parameters: finalParameters,
                                            limit:
                                                sqlLimit === null
                                                    ? MAX_SAFE_INTEGER
                                                    : sqlLimit,
                                        },
                                    );
                                const chart =
                                    await this.asyncQueryService.savedSqlModel.getByUuid(
                                        chartUuid,
                                        {
                                            projectUuid,
                                        },
                                    );
                                const downloadResult =
                                    await this.asyncQueryService.downloadSyncQueryResults(
                                        {
                                            account,
                                            projectUuid,
                                            queryUuid: query.queryUuid,
                                            type: downloadFileType,
                                            onlyRaw:
                                                csvOptions?.formatted === false,
                                            customLabels:
                                                getCustomLabelsFromVizTableConfig(
                                                    isVizTableConfig(
                                                        chart.config,
                                                    )
                                                        ? chart.config
                                                        : undefined,
                                                ),
                                            hiddenFields:
                                                getHiddenFieldsFromVizTableConfig(
                                                    isVizTableConfig(
                                                        chart.config,
                                                    )
                                                        ? chart.config
                                                        : undefined,
                                                ),
                                            columnOrder:
                                                getColumnOrderFromVizTableConfig(
                                                    isVizTableConfig(
                                                        chart.config,
                                                    )
                                                        ? chart.config
                                                        : undefined,
                                                ),
                                            expirationSecondsOverride,
                                        },
                                        SCHEDULER_POLLING_OPTIONS,
                                    );
                                return {
                                    chartName: chart.name,
                                    filename: chart.name,
                                    path: downloadResult.fileUrl,
                                    localPath:
                                        downloadResult.s3FileUrl ??
                                        downloadResult.fileUrl,
                                    truncated: false,
                                };
                            },
                        );

                        const results = await Promise.allSettled([
                            ...csvForChartPromises,
                            ...csvForSqlChartPromises,
                        ]);

                        // Separate successes and failures
                        const successfulResults = results.filter(
                            (
                                result,
                            ): result is PromiseFulfilledResult<{
                                chartName: string;
                                filename: string;
                                path: string;
                                localPath: string;
                                truncated: boolean;
                            }> => result.status === 'fulfilled',
                        );
                        csvUrls = successfulResults.map((r) => r.value);

                        const csvFailures = results
                            .map((result, index) => ({ result, index }))
                            .filter(
                                (
                                    item,
                                ): item is {
                                    result: PromiseRejectedResult;
                                    index: number;
                                } => item.result.status === 'rejected',
                            )
                            .map(({ result, index }) => {
                                // Look up chart metadata using the index
                                const metadata = chartMetadata[index];
                                Logger.warn(
                                    `Failed to generate CSV for ${metadata.chartName} (${metadata.chartUuid}) in scheduled delivery: ${result.reason}`,
                                );

                                if (metadata.type === 'chart') {
                                    return {
                                        type: PartialFailureType.DASHBOARD_CHART,
                                        chartUuid: metadata.chartUuid,
                                        chartName: metadata.chartName,
                                        tileUuid: metadata.tileUuid,
                                        error: getErrorMessage(result.reason),
                                    } satisfies PartialFailure;
                                }

                                return {
                                    type: PartialFailureType.DASHBOARD_SQL_CHART,
                                    savedSqlUuid: metadata.chartUuid,
                                    chartName: metadata.chartName,
                                    tileUuid: metadata.tileUuid,
                                    error: getErrorMessage(result.reason),
                                } satisfies PartialFailure;
                            });

                        // Log partial failures if any
                        if (csvFailures.length > 0) {
                            Logger.warn(
                                `Scheduled delivery completed with ${csvFailures.length} failed chart(s) out of ${results.length} total`,
                            );
                            failures = csvFailures;
                        }

                        if (
                            format === SchedulerFormat.XLSX &&
                            csvUrls.length > 0 &&
                            csvOptions?.xlsxFileLayout === 'workbook'
                        ) {
                            const workbookResult =
                                await this.createWorkbookDownloadUrl({
                                    files: csvUrls,
                                    workbookNameBase: details.name,
                                    organizationUuid,
                                    projectUuid,
                                    createdByUserUuid: userUuid,
                                    expirationSecondsOverride,
                                });

                            csvUrls = [
                                {
                                    filename: details.name,
                                    path: workbookResult.url,
                                    localPath: workbookResult.url,
                                    truncated: false,
                                },
                            ];
                        }

                        this.analytics.trackAccount(account, {
                            event: 'download_results.completed',
                            userId: account.user.id,
                            properties: {
                                ...baseAnalyticsProperties,
                                numCharts: csvUrls.length,
                                numFailures: csvFailures.length,
                            },
                        });
                    } else {
                        throw new Error('Not implemented');
                    }
                } catch (e) {
                    Logger.error(
                        `Unable to download XLSX on scheduled task: ${e}`,
                    );

                    if (this.slackClient.isEnabled && isFinalAttempt) {
                        await this.slackClient.postMessageToNotificationChannel(
                            {
                                organizationUuid,
                                text: `Error sending Scheduled Delivery: ${scheduler.name}`,
                                blocks: getNotificationChannelErrorBlocks(
                                    scheduler.name,
                                    e,
                                    deliveryUrl,
                                ),
                            },
                        );
                    }

                    this.analytics.trackAccount(account, {
                        event: 'download_results.error',
                        userId: account.user.id,
                        properties: {
                            ...baseAnalyticsProperties,
                            error: `${e}`,
                        },
                    });
                    throw e; // cascade error
                }
                break;
            default:
                return assertUnreachable(
                    format,
                    `Format ${format} is not supported for scheduled delivery`,
                );
        }

        return {
            url,
            pageType,
            details,
            organizationUuid,
            imageUrl,
            imageS3Key,
            csvUrl,
            csvUrls,
            pdfFile,
            failures,
        };
    }

    protected async sendSlackNotification(
        jobId: string,
        notification: SlackNotificationPayload,
    ) {
        const {
            schedulerUuid,
            schedulerSlackTargetUuid,
            channel,
            scheduledTime,
            scheduler,
        } = notification;
        setSchedulerJobLogContext({
            jobId,
            schedulerUuid,
            schedulerName: scheduler.name,
            savedSqlUuid: scheduler.savedSqlUuid,
        });
        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            userId: notification.userUuid,
            properties: {
                jobId,
                organizationId: notification.organizationUuid,
                projectId: notification.projectUuid,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerSlackTargetUuid,
                groupId: notification.jobGroup,
                type: 'slack',
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        try {
            if (!this.slackClient.isEnabled) {
                throw new Error('Slack app is not configured');
            }

            const {
                format,
                savedChartUuid,
                dashboardUuid,
                name,
                cron,
                timezone,
                thresholds,
                includeLinks,
            } = scheduler;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: channel,
                targetType: 'slack',
                status: SchedulerJobStatus.STARTED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            // Backwards compatibility for old scheduled deliveries
            const slackExpiration = await this.getDeliveryExpirationSeconds(
                notification.organizationUuid,
                'slack',
            );
            const notificationPageData =
                notification.page ??
                (await this.getNotificationPageData(
                    scheduler,
                    jobId,
                    true, // maxAttempts 1 — always the final attempt
                    slackExpiration,
                ));

            const {
                url,
                details,
                pageType,
                organizationUuid,
                imageUrl,
                csvUrl,
                csvUrls,
                pdfFile,
                failures,
            } = notificationPageData;

            const defaultSchedulerTimezone =
                await this.schedulerService.getSchedulerDefaultTimezone(
                    schedulerUuid,
                );

            const showExpirationWarning = format !== SchedulerFormat.IMAGE;
            const slackExpirationDays = Math.ceil(slackExpiration / 86400);
            const schedulerFooter = includeLinks
                ? `<${url}?${setUuidParam(
                      'scheduler_uuid',
                      schedulerUuid,
                  )}|scheduled delivery>`
                : 'scheduled delivery';
            const getBlocksArgs = {
                title: name,
                name: details.name,
                description: details.description,
                message:
                    scheduler.message && slackifyMarkdown(scheduler.message),
                ctaUrl: url,
                footerMarkdown: `This is a ${schedulerFooter} ${getHumanReadableCronExpression(
                    cron,
                    timezone || defaultSchedulerTimezone,
                )} from Lightdash.\n${
                    showExpirationWarning
                        ? `Delivered files expire after *${slackExpirationDays}* days.`
                        : ''
                }`,
                includeLinks,
            };

            if (thresholds !== undefined && thresholds.length > 0) {
                // We assume the threshold is possitive , so we don't need to get results here
                if (savedChartUuid) {
                    const slackImageUrl =
                        await this.slackClient.tryUploadingImageToSlack(
                            organizationUuid,
                            imageUrl,
                            name,
                        );
                    const thresholdFooter = includeLinks
                        ? `<${url}?${setUuidParam(
                              'threshold_uuid',
                              schedulerUuid,
                          )}|data alert>`
                        : 'data alert';

                    const expiration = slackImageUrl.expiring
                        ? `Delivered files expire after ${slackExpirationDays} days.`
                        : '';

                    const blocks = getChartThresholdAlertBlocks({
                        ...getBlocksArgs,
                        footerMarkdown: `This is a ${thresholdFooter} sent by Lightdash. ${expiration}`,
                        imageUrl: slackImageUrl.url,
                        thresholds,
                        includeLinks,
                    });
                    await this.slackClient.postMessage({
                        organizationUuid,
                        text: name,
                        channel,
                        blocks,
                    });
                } else {
                    throw new Error('Not implemented');
                }
            } else if (format === SchedulerFormat.IMAGE) {
                const slackImageUrl =
                    await this.slackClient.tryUploadingImageToSlack(
                        organizationUuid,
                        imageUrl,
                        name,
                    );

                const expiration = slackImageUrl.expiring
                    ? `Delivered files expire after ${slackExpirationDays} days.`
                    : '';
                const blocks = getChartAndDashboardBlocks({
                    ...getBlocksArgs,
                    footerMarkdown: `${getBlocksArgs.footerMarkdown} ${expiration}`,
                    imageUrl: slackImageUrl.url,
                });

                const message = await this.slackClient.postMessage({
                    organizationUuid,
                    text: name,
                    channel,
                    blocks,
                });

                if (pdfFile && message.ts) {
                    try {
                        // Add the pdf to the thread
                        const pdfBuffer = this.fileStorageClient.isEnabled()
                            ? await this.fileStorageClient.getFileStream(
                                  pdfFile.fileName,
                              )
                            : await fs.readFile(pdfFile.source);

                        await this.slackClient.postFileToThread({
                            organizationUuid,
                            file: pdfBuffer,
                            title: name,
                            channelId: channel,
                            threadTs: message.ts,
                            filename: `${name}.pdf`,
                            fileType: 'pdf',
                        });
                    } catch (err) {
                        if (
                            err instanceof Error &&
                            'code' in err &&
                            err.code === 'ENOENT'
                        ) {
                            throw new ReadFileError(
                                `PDF file not found for ${name}`,
                                {
                                    filePath: pdfFile,
                                },
                            );
                        }
                        throw err;
                    }
                }
            } else if (format === SchedulerFormat.PDF) {
                if (!pdfFile) {
                    throw new Error('Missing PDF file');
                }

                // Post text message first
                // Note: footerMarkdown already includes expiration warning
                // because showExpirationWarning is true for PDF format
                const blocks = getChartAndDashboardBlocks({
                    ...getBlocksArgs,
                });

                await this.slackClient.postMessage({
                    organizationUuid,
                    text: name,
                    channel,
                    blocks,
                });

                // Post PDF file as a separate message
                const pdfBuffer = this.fileStorageClient.isEnabled()
                    ? await this.fileStorageClient.getFileStream(
                          pdfFile.fileName,
                      )
                    : await fs.readFile(pdfFile.source);

                await this.slackClient.postFileToThread({
                    organizationUuid,
                    file: pdfBuffer,
                    title: name,
                    channelId: channel,
                    filename: `${name}.pdf`,
                    fileType: 'pdf',
                });
            } else {
                let blocks;
                if (savedChartUuid) {
                    if (csvUrl === undefined) {
                        throw new Error('Missing CSV URL');
                    }

                    blocks = getChartCsvResultsBlocks({
                        ...getBlocksArgs,
                        csvUrl:
                            csvUrl.path !== '#no-results'
                                ? csvUrl.path
                                : undefined,
                    });
                } else if (dashboardUuid) {
                    if (csvUrls === undefined) {
                        throw new Error('Missing CSV URLS');
                    }
                    blocks = getDashboardCsvResultsBlocks({
                        ...getBlocksArgs,
                        csvUrls,
                        failures,
                    });
                } else {
                    throw new Error('Not implemented');
                }
                await this.slackClient.postMessage({
                    organizationUuid,
                    text: name,
                    channel,
                    blocks,
                });
            }
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerSlackTargetUuid,
                    groupId: notification.jobGroup,
                    type: 'slack',
                    format,
                    ...getSchedulerResourceTypeAndId(scheduler),
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                target: channel,
                targetType: 'slack',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    error: `${e}`,
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerSlackTargetUuid,
                    groupId: notification.jobGroup,
                    type: 'slack',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });

            const translatedSlackError = translateSlackError(e);
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                targetType: 'slack',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: translatedSlackError?.error ?? getErrorMessage(e),
                    ...(translatedSlackError && {
                        slackErrorCode: translatedSlackError.slackErrorCode,
                    }),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            if (e instanceof SlackInstallationNotFoundError) {
                console.warn(
                    `Disabling scheduler with non-retryable error: ${e}`,
                );
                const user = await this.userService.getSessionByUserUuid(
                    scheduler.createdBy,
                );
                await this.schedulerService.setSchedulerEnabled(
                    user,
                    schedulerUuid!,
                    false,
                );
                return; // Do not cascade error
            }

            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async sendMsTeamsNotification(
        jobId: string,
        notification: MsTeamsNotificationPayload,
    ) {
        const {
            schedulerUuid,
            schedulerMsTeamsTargetUuid,
            webhook,
            scheduledTime,
            scheduler,
        } = notification;
        setSchedulerJobLogContext({
            jobId,
            schedulerUuid,
            schedulerName: scheduler.name,
            savedSqlUuid: scheduler.savedSqlUuid,
        });
        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            userId: notification.userUuid,
            properties: {
                jobId,
                organizationId: notification.organizationUuid,
                projectId: notification.projectUuid,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerMsTeamsTargetUuid,
                groupId: notification.jobGroup,
                type: 'msteams',
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        try {
            if (!this.lightdashConfig.microsoftTeams.enabled) {
                throw new MissingConfigError(
                    'Microsoft teams is not configured',
                );
            }

            const {
                format,
                savedChartUuid,
                dashboardUuid,
                name,
                cron,
                timezone,
                thresholds,
                includeLinks,
            } = scheduler;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: webhook,
                targetType: 'msteams',
                status: SchedulerJobStatus.STARTED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            // Backwards compatibility for old scheduled deliveries
            const msTeamsExpiration = await this.getDeliveryExpirationSeconds(
                notification.organizationUuid,
                'msteams',
            );
            const notificationPageData =
                notification.page ??
                (await this.getNotificationPageData(
                    scheduler,
                    jobId,
                    true, // maxAttempts 1 — always the final attempt
                    msTeamsExpiration,
                ));

            const {
                url,
                details,
                pageType,
                organizationUuid,
                imageUrl,
                csvUrl,
                csvUrls,
                pdfFile,
                failures,
            } = notificationPageData;

            const schedulerType =
                thresholds !== undefined && thresholds.length > 0
                    ? 'data alert'
                    : 'scheduled delivery';
            const schedulerFooter = includeLinks
                ? `<a href="${url}">${schedulerType}</a>`
                : schedulerType;

            const defaultSchedulerTimezone =
                await this.schedulerService.getSchedulerDefaultTimezone(
                    schedulerUuid,
                );

            const footer = `This is a ${schedulerFooter} ${getHumanReadableCronExpression(
                cron,
                timezone || defaultSchedulerTimezone,
            )} from Lightdash.`;
            const getBlocksArgs = {
                title: name,
                name: details.name,
                description: details.description,
                message: scheduler.message,
                ctaUrl: url,
                footer,
            };

            if (thresholds !== undefined && thresholds.length > 0) {
                // We assume the threshold is possitive , so we don't need to get results here
                if (savedChartUuid) {
                    if (imageUrl)
                        await this.msTeamsClient.postImageWithWebhook({
                            webhookUrl: webhook,
                            ...getBlocksArgs,
                            image: imageUrl,
                            thresholds,
                        });
                } else {
                    throw new Error('No chart found');
                }
            } else if (format === SchedulerFormat.IMAGE) {
                if (imageUrl)
                    await this.msTeamsClient.postImageWithWebhook({
                        webhookUrl: webhook,
                        ...getBlocksArgs,
                        image: imageUrl,
                        pdfUrl: pdfFile?.source,
                    });
            } else if (format === SchedulerFormat.PDF) {
                throw new ParameterError(
                    'PDF-only format is not supported for MS Teams webhooks',
                );
            } else if (format === SchedulerFormat.CSV) {
                if (savedChartUuid) {
                    if (csvUrl === undefined) {
                        throw new UnexpectedServerError('Missing CSV URL');
                    }
                    await this.msTeamsClient.postCsvWithWebhook({
                        webhookUrl: webhook,
                        ...getBlocksArgs,
                        csvUrl,
                    });
                } else if (dashboardUuid) {
                    if (csvUrls === undefined) {
                        throw new UnexpectedServerError('Missing CSV URLS');
                    }
                    await this.msTeamsClient.postCsvsWithWebhook({
                        webhookUrl: webhook,
                        ...getBlocksArgs,
                        csvUrls,
                        failures,
                    });
                } else {
                    throw new UnexpectedServerError('Not implemented');
                }
            }
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerMsTeamsTargetUuid,
                    groupId: notification.jobGroup,
                    type: 'msteams',
                    format,
                    ...getSchedulerResourceTypeAndId(scheduler),
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                target: webhook,
                targetType: 'msteams',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    error: `${e}`,
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerMsTeamsTargetUuid,
                    groupId: notification.jobGroup,
                    type: 'msteams',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                targetType: 'msteams',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async testAndCompileProject(
        jobId: string,
        scheduledTime: Date,
        payload: CompileProjectPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.COMPILE_PROJECT,
                jobId,
                scheduledTime,
            };
        try {
            const user = await this.userService.getSessionByUserUuid(
                payload.createdByUserUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            await this.projectService.testAndCompileProject(
                user,
                payload.projectUuid,
                getRequestMethod(payload.requestMethod),
                payload.jobUuid,
                payload.compilationSource,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
            if (process.env.IS_PULL_REQUEST !== 'true' && !payload.isPreview) {
                void this.schedulerClient.generateValidation({
                    userUuid: payload.createdByUserUuid,
                    projectUuid: payload.projectUuid,
                    context: 'test_and_compile',
                    organizationUuid: payload.organizationUuid,
                });
            }
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            });
            throw e;
        }
    }

    protected async createProjectWithCompile(
        jobId: string,
        scheduledTime: Date,
        payload: SchedulerCreateProjectWithCompilePayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.CREATE_PROJECT_WITH_COMPILE,
                jobId,
                scheduledTime,
            };

        try {
            const user = await this.userService.getSessionByUserUuid(
                payload.createdByUserUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    projectUuid: undefined,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            let projectData: CreateProject;
            try {
                projectData = JSON.parse(
                    this.encryptionUtil.decrypt(
                        Buffer.from(payload.data, 'base64'),
                    ),
                ) as CreateProject;
            } catch {
                throw new UnexpectedServerError('Failed to load project data');
            }

            const projectCreationResult = await this.projectService._create(
                user,
                projectData,
                payload.jobUuid,
                getRequestMethod(payload.requestMethod),
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: projectCreationResult.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    projectUuid: undefined,
                    organizationUuid: payload.organizationUuid,
                    error: e,
                },
            });
            // Update legacy job
            await this.projectService._markJobAsFailed(payload.jobUuid);
            throw e;
        }
    }

    protected async compileProject(
        jobId: string,
        scheduledTime: Date,
        payload: CompileProjectPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.COMPILE_PROJECT,
                jobId,
                scheduledTime,
            };
        try {
            const user = await this.userService.getSessionByUserUuid(
                payload.createdByUserUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            await this.projectService.compileProject(
                user,
                payload.projectUuid,
                getRequestMethod(payload.requestMethod),
                payload.jobUuid,
            );
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
            if (
                process.env.IS_PULL_REQUEST !== 'true' &&
                (!payload.isPreview || payload.validateAfterCompile === true)
            ) {
                void this.schedulerClient.generateValidation({
                    projectUuid: payload.projectUuid,
                    context: 'dbt_refresh',
                    userUuid: payload.createdByUserUuid,
                    organizationUuid: payload.organizationUuid,
                });
            }
            const { enabled: canReplaceCustomMetrics } =
                await this.featureFlagService.get({
                    user,
                    featureFlagId: FeatureFlags.ReplaceCustomMetricsOnCompile,
                });
            if (canReplaceCustomMetrics) {
                // Don't wait for replaceCustomFields response
                void this.schedulerClient.replaceCustomFields({
                    userUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                });
            }
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    userUuid: payload.userUuid,
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
            });
            throw e;
        }
    }

    protected async materializePreAggregate(
        jobId: string,
        scheduledTime: Date,
        payload: MaterializePreAggregatePayload,
    ) {
        setSchedulerJobLogContext({ jobId });
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.MATERIALIZE_PRE_AGGREGATE,
                jobId,
                scheduledTime,
            };

        try {
            const account = await this.userService.getAccountByUserUuid(
                payload.userUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.userUuid,
                    organizationUuid: payload.organizationUuid,
                    projectUuid: payload.projectUuid,
                    preAggregateDefinitionUuid:
                        payload.preAggregateDefinitionUuid,
                    trigger: payload.trigger,
                },
                status: SchedulerJobStatus.STARTED,
            });

            const result =
                await this.preAggregateMaterializationService.materializePreAggregate(
                    {
                        account,
                        projectUuid: payload.projectUuid,
                        preAggregateDefinitionUuid:
                            payload.preAggregateDefinitionUuid,
                        trigger: payload.trigger,
                    },
                );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.userUuid,
                    organizationUuid: payload.organizationUuid,
                    projectUuid: payload.projectUuid,
                    preAggregateDefinitionUuid:
                        payload.preAggregateDefinitionUuid,
                    trigger: payload.trigger,
                    materializationUuid: result.materializationUuid,
                    materializationStatus: result.status,
                    queryUuid: result.queryUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (error) {
            if (payload.trigger === 'cron' && error instanceof NotFoundError) {
                await this.schedulerClient.deleteScheduledPreAggregateCronJobsForDefinition(
                    payload.preAggregateDefinitionUuid,
                );
            }

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.userUuid,
                    organizationUuid: payload.organizationUuid,
                    projectUuid: payload.projectUuid,
                    preAggregateDefinitionUuid:
                        payload.preAggregateDefinitionUuid,
                    trigger: payload.trigger,
                    error: getErrorMessage(error),
                },
                status: SchedulerJobStatus.ERROR,
            });

            throw error;
        }
    }

    protected async generateDailyPreAggregateMaterializationJobs(
        currentDateStartOfDay: Date,
    ): Promise<void> {
        const preAggregateSchedulerDetails =
            await this.preAggregateModel.getProjectSchedulerDetailsForPreAggregates();

        let totalScheduledJobs = 0;

        await Promise.all(
            preAggregateSchedulerDetails.map(async (definition) => {
                const { createdByUserUuid } = definition;
                if (!createdByUserUuid) {
                    return;
                }

                try {
                    const scheduledJobs =
                        await this.schedulerClient.schedulePreAggregateCronJobs(
                            [
                                {
                                    organizationUuid:
                                        definition.organizationUuid,
                                    projectUuid: definition.projectUuid,
                                    createdByUserUuid,
                                    preAggregateDefinitionUuid:
                                        definition.preAggregateDefinitionUuid,
                                    refreshCron: definition.refreshCron,
                                    schedulerTimezone:
                                        definition.schedulerTimezone ||
                                        TimeZone.UTC,
                                    preAggExploreName:
                                        definition.preAggExploreName,
                                },
                            ],
                            currentDateStartOfDay,
                            true,
                        );

                    scheduledJobs.forEach(({ jobId, runAt }) => {
                        totalScheduledJobs += 1;

                        Logger.info(
                            `Scheduled pre-aggregate cron materialization job ${jobId}`,
                            {
                                projectUuid: definition.projectUuid,
                                preAggregateDefinitionUuid:
                                    definition.preAggregateDefinitionUuid,
                                preAggregateExploreName:
                                    definition.preAggExploreName,
                                runAt,
                            },
                        );
                    });
                } catch (error) {
                    Logger.error(
                        `Failed scheduling pre-aggregate cron jobs for definition ${definition.preAggregateDefinitionUuid} in project ${definition.projectUuid}: ${getErrorMessage(
                            error,
                        )}`,
                    );
                }
            }),
        );

        Logger.info(
            `Scheduled ${totalScheduledJobs} pre-aggregate cron materialization job(s)`,
        );
    }

    protected async validateProject(
        jobId: string,
        scheduledTime: Date,
        payload: ValidateProjectPayload,
    ) {
        await this.schedulerService.logSchedulerJob({
            task: SCHEDULER_TASKS.VALIDATE_PROJECT,
            jobId,
            scheduledTime,
            status: SchedulerJobStatus.STARTED,
            details: {
                projectUuid: payload.projectUuid,
                organizationUuid: payload.organizationUuid,
                createdByUserUuid: payload.userUuid,
                onlyValidateExploresInArgs: payload.onlyValidateExploresInArgs,
            },
        });

        this.analytics.track({
            event: 'validation.run',
            userId: payload.userUuid,
            properties: {
                context: payload.context,
                organizationId: payload.organizationUuid,
                projectId: payload.projectUuid,
            },
        });
        try {
            const validationTargetsSet = new Set(payload.validationTargets);
            const errors = await this.validationService.generateValidation(
                payload.projectUuid,
                payload.explores,
                validationTargetsSet,
                payload.onlyValidateExploresInArgs,
            );

            const contentIds = errors.map((validation) => {
                if (isChartValidationError(validation))
                    return validation.chartUuid;
                if (isDashboardValidationError(validation))
                    return validation.dashboardUuid;

                return validation.name;
            });

            await this.validationService.storeValidation(
                payload.projectUuid,
                errors,
                payload.explores ? jobId : undefined,
            );

            this.analytics.track({
                event: 'validation.completed',
                userId: payload.userUuid,
                properties: {
                    context: payload.context,
                    organizationId: payload.organizationUuid,
                    projectId: payload.projectUuid,
                    numContentAffected: new Set(contentIds).size,
                    numErrorsDetected: errors.length,
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.VALIDATE_PROJECT,
                jobId,
                scheduledTime,
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'validation.error',
                userId: payload.userUuid,
                properties: {
                    context: payload.context,
                    organizationId: payload.organizationUuid,
                    projectId: payload.projectUuid,
                    error: getErrorMessage(e),
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.VALIDATE_PROJECT,
                jobId,
                scheduledTime,
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.userUuid,
                },
            });
            throw e;
        }
    }

    protected async logWrapper<TRecordValues = string>(
        baseLog: Pick<
            SchedulerLog,
            'task' | 'jobId' | 'scheduledTime' | 'details'
        >,
        func: () => Promise<Record<string, TRecordValues> | undefined>, // Returns extra details for the log
    ) {
        try {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.STARTED,
            });

            const details = await func();

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: { ...baseLog.details, ...details },
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    ...baseLog.details,
                    error: getErrorMessage(e),
                    ...(e instanceof Error && 'data' in e && e?.data
                        ? e.data
                        : {}),
                },
            });
            Logger.error(`Error in scheduler task: ${e}`);
            throw e;
        }
    }

    protected async sqlRunner(
        jobId: string,
        scheduledTime: Date,
        payload: SqlRunnerPayload,
    ) {
        await this.logWrapper<string | VizColumn[]>(
            {
                task: SCHEDULER_TASKS.SQL_RUNNER,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const { fileUrl, columns } =
                    await this.projectService.streamSqlQueryIntoFile(payload);
                return { fileUrl, columns };
            },
        );
    }

    protected async sqlRunnerPivotQuery(
        jobId: string,
        scheduledTime: Date,
        payload: SqlRunnerPivotQueryPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.SQL_RUNNER_PIVOT_QUERY,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => this.projectService.pivotQueryWorkerTask(payload),
        );
    }

    protected async uploadGsheetFromQuery(
        jobId: string,
        scheduledTime: Date,
        payload: UploadGsheetPayload,
    ) {
        setSchedulerJobLogContext({ jobId });
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY,
                jobId,
                scheduledTime,
            };

        const analyticsProperties: DownloadCsv['properties'] = {
            jobId,
            userId: payload.userUuid,
            organizationId: payload.organizationUuid,
            projectId: payload.projectUuid,
            fileType: SchedulerFormat.GSHEETS,
        };

        let failureStage: 'query' | 'upload' = 'query';

        try {
            if (!this.googleDriveClient.isEnabled) {
                throw new Error(
                    'Unable to upload Google Sheet, Google Drive is not enabled',
                );
            }

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    progress: { phase: 'query', attempt: 1 },
                },
                status: SchedulerJobStatus.STARTED,
            });

            const account = await this.userService.getAccountByUserUuid(
                payload.userUuid,
            );
            this.analytics.trackAccount(account, {
                event: 'download_results.started',
                userId: payload.userUuid,
                properties: analyticsProperties,
            });

            if (payload.source === 'rows') {
                // Rows path has no query phase — go straight to upload.
                failureStage = 'upload';
                await this.uploadGsheetFromRowsInner(
                    payload,
                    baseLog,
                    analyticsProperties,
                    account,
                    jobId,
                );
            } else {
                await this.uploadGsheetFromMetricQueryInner(
                    payload,
                    baseLog,
                    analyticsProperties,
                    account,
                    jobId,
                    () => {
                        failureStage = 'upload';
                    },
                );
            }

            this.analytics.trackAccount(account, {
                event: 'download_results.completed',
                userId: account.user.id,
                properties: analyticsProperties,
            });
        } catch (e) {
            const userFacingError =
                failureStage === 'query'
                    ? "This export couldn't be completed because the query took too long or failed."
                    : "We couldn't write the results to Google Sheets.";

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.userUuid,
                    error: getErrorMessage(e),
                    userFacingError,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            });

            this.analytics.track({
                event: 'download_results.error',
                userId: payload.userUuid,
                properties: analyticsProperties,
            });

            throw e;
        }
    }

    private async uploadResultsToGoogleSheet({
        jobId,
        refreshToken,
        spreadsheetId,
        rows,
        itemMap,
        pivotDetails,
        displayTimezone,
        payload,
    }: {
        jobId: string;
        refreshToken: string;
        spreadsheetId: string;
        rows: Record<string, unknown>[];
        itemMap: ItemsMap;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        displayTimezone: string | null;
        payload: UploadMetricGsheetPayload;
    }): Promise<void> {
        const onRetry = (attempt: number) =>
            this.schedulerService.updateGsheetExportProgress(jobId, {
                phase: 'upload',
                attempt,
            });

        if (payload.pivotConfig) {
            if (!pivotDetails) {
                throw new UnexpectedServerError(
                    'Cannot export pivoted results without SQL pivot details',
                );
            }
            // pivotResultsAsCsv expects a formatted ResultRow[] type, so we need to convert it first
            const formattedRows = formatRows(
                rows,
                itemMap,
                undefined,
                undefined,
                displayTimezone ?? undefined,
            );

            const pivotedResults = pivotResultsAsCsv({
                pivotConfig: payload.pivotConfig,
                rows: formattedRows,
                itemMap,
                customLabels: payload.customLabels,
                onlyRaw: true,
                pivotDetails,
                timezone: displayTimezone ?? undefined,
            });

            await retryTransientGoogleSheetsWrite(
                () =>
                    this.googleDriveClient.appendCsvToSheet(
                        refreshToken,
                        spreadsheetId,
                        pivotedResults,
                    ),
                onRetry,
            );
            return;
        }

        await retryTransientGoogleSheetsWrite(
            () =>
                this.googleDriveClient.appendToSheet(
                    refreshToken,
                    spreadsheetId,
                    rows,
                    itemMap,
                    payload.showTableNames,
                    undefined, // tabName
                    payload.columnOrder,
                    payload.customLabels,
                    payload.hiddenFields,
                    displayTimezone ?? undefined,
                ),
            onRetry,
        );
    }

    private async uploadGsheetFromMetricQueryInner(
        payload: UploadMetricGsheetPayload,
        baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'>,
        analyticsProperties: DownloadCsv['properties'],
        account: AccountType,
        jobId: string,
        onQueryComplete: () => void,
    ) {
        const metricQuery: MetricQuery = {
            ...payload.metricQuery,
            exploreName: payload.exploreId,
        };

        let pivotConfiguration: PivotConfiguration | undefined;
        if (payload.pivotConfig) {
            const explore = await this.projectService.getExplore(
                account,
                payload.projectUuid,
                payload.exploreId,
            );
            const fields = getItemMap(
                explore,
                metricQuery.additionalMetrics,
                metricQuery.tableCalculations,
            );
            pivotConfiguration = derivePivotConfigurationFromPivotConfig(
                payload.pivotConfig,
                metricQuery,
                fields,
            );
        }

        const {
            rows,
            fields: itemMap,
            pivotDetails,
            displayTimezone,
        } = await this.asyncQueryService.executeMetricQueryAndGetResults(
            {
                account,
                projectUuid: payload.projectUuid,
                metricQuery,
                context: QueryExecutionContext.GSHEETS,
                pivotConfiguration,
            },
            SCHEDULER_POLLING_OPTIONS,
        );

        onQueryComplete();
        await this.schedulerService.updateGsheetExportProgress(jobId, {
            phase: 'upload',
            attempt: 1,
        });

        const refreshToken = await this.userService.getRefreshToken(
            payload.userUuid,
        );
        const { spreadsheetId, spreadsheetUrl } =
            await this.googleDriveClient.createNewSheet(
                refreshToken,
                payload.exploreId,
            );

        if (!spreadsheetId) {
            throw new Error('Unable to create new sheet');
        }

        await this.uploadResultsToGoogleSheet({
            jobId,
            refreshToken,
            spreadsheetId,
            rows,
            itemMap,
            pivotDetails,
            displayTimezone,
            payload,
        });

        const { csvCellsLimit } = await resolveOrganizationExportLimits(
            this.organizationSettingsModel,
            this.lightdashConfig.query,
            payload.organizationUuid,
        );
        const truncated = this.csvService.couldBeTruncated(rows, csvCellsLimit);

        await this.schedulerService.logSchedulerJob({
            ...baseLog,
            details: {
                fileUrl: spreadsheetUrl,
                createdByUserUuid: payload.userUuid,
                truncated,
                projectUuid: payload.projectUuid,
                organizationUuid: payload.organizationUuid,
            },
            status: SchedulerJobStatus.COMPLETED,
        });
    }

    private async uploadGsheetFromRowsInner(
        payload: UploadGsheetFromRowsPayload,
        baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'>,
        analyticsProperties: DownloadCsv['properties'],
        account: AccountType,
        jobId: string,
    ) {
        // Rows path has no warehouse query step — we're already in the upload
        // phase from the outer wrapper's perspective. Report progress + retry
        // the Sheets write on transient errors, same as the metric-query path.
        await this.schedulerService.updateGsheetExportProgress(jobId, {
            phase: 'upload',
            attempt: 1,
        });

        const refreshToken = await this.userService.getRefreshToken(
            payload.userUuid,
        );
        const { spreadsheetId, spreadsheetUrl } =
            await this.googleDriveClient.createNewSheet(
                refreshToken,
                payload.title,
            );

        if (!spreadsheetId) {
            throw new Error('Unable to create new sheet');
        }

        const itemMap = buildItemMapFromColumns(payload.columns);
        const columnOrder = payload.columns.map((c) => c.key);
        const customLabels = Object.fromEntries(
            payload.columns
                .filter((c) => c.label)
                .map((c) => [c.key, c.label as string]),
        );

        await retryTransientGoogleSheetsWrite(
            () =>
                this.googleDriveClient.appendToSheet(
                    refreshToken,
                    spreadsheetId,
                    payload.rows,
                    itemMap,
                    false, // showTableNames — no table context for app-supplied rows
                    undefined, // tabName
                    columnOrder,
                    customLabels,
                    [], // hiddenFields
                    undefined, // timezone
                ),
            (attempt) =>
                this.schedulerService.updateGsheetExportProgress(jobId, {
                    phase: 'upload',
                    attempt,
                }),
        );

        await this.schedulerService.logSchedulerJob({
            ...baseLog,
            details: {
                fileUrl: spreadsheetUrl,
                createdByUserUuid: payload.userUuid,
                truncated: false,
                projectUuid: payload.projectUuid,
                organizationUuid: payload.organizationUuid,
            },
            status: SchedulerJobStatus.COMPLETED,
        });
    }

    protected async sendEmailNotification(
        jobId: string,
        notification: EmailNotificationPayload,
    ) {
        const {
            schedulerUuid,
            schedulerEmailTargetUuid,
            recipient,
            scheduledTime,
            scheduler,
        } = notification;

        setSchedulerJobLogContext({
            jobId,
            schedulerUuid,
            schedulerName: scheduler.name,
            savedSqlUuid: scheduler.savedSqlUuid,
        });

        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            userId: notification.userUuid,
            properties: {
                jobId,
                organizationId: notification.organizationUuid,
                projectId: notification.projectUuid,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerEmailTargetUuid,
                groupId: notification.jobGroup,
                type: 'email',
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        try {
            const {
                format,
                savedChartUuid,
                dashboardUuid,
                name,
                thresholds,
                includeLinks,
            } = scheduler;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
                scheduledTime,
                target: recipient,
                targetType: 'email',
                status: SchedulerJobStatus.STARTED,
            });

            // Backwards compatibility for old scheduled deliveries
            const emailExpiration = await this.getDeliveryExpirationSeconds(
                notification.organizationUuid,
                'email',
            );
            const notificationPageData =
                notification.page ??
                (await this.getNotificationPageData(
                    scheduler,
                    jobId,
                    true, // maxAttempts 1 — always the final attempt
                    emailExpiration,
                ));

            const {
                url,
                details,
                pageType,
                imageUrl,
                imageS3Key,
                csvUrl,
                csvUrls,
                pdfFile,
                failures,
            } = notificationPageData;

            let imageBuffer: Buffer | undefined;
            if (
                this.lightdashConfig.smtp?.inlineImageCid === true &&
                imageS3Key &&
                this.fileStorageClient.isEnabled()
            ) {
                try {
                    const stream =
                        await this.fileStorageClient.getFileStream(imageS3Key);
                    const chunks: Buffer[] = [];
                    for await (const chunk of stream) {
                        chunks.push(
                            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
                        );
                    }
                    imageBuffer = Buffer.concat(chunks);
                } catch (e) {
                    Logger.warn(
                        `Failed to stream CID inline image from S3 (key: ${imageS3Key}), falling back to external image URL: ${e}`,
                    );
                }
            }

            const schedulerUrl = `${url}?${setUuidParam(
                'scheduler_uuid',
                schedulerUuid,
            )}`;

            const defaultSchedulerTimezone =
                await this.schedulerService.getSchedulerDefaultTimezone(
                    schedulerUuid,
                );

            if (thresholds !== undefined && thresholds.length > 0) {
                // We assume the threshold is possitive , so we don't need to get results here
                if (imageUrl === undefined) {
                    throw new Error('Missing image URL');
                }
                if (scheduler.message) {
                    throw new Error(
                        'Message not supported on threshold alerts',
                    );
                }
                // Reuse message from imageNotification for threshold information
                const thresholdMessageList = thresholds.map(
                    (threshold) =>
                        `- **${friendlyName(
                            threshold.fieldId,
                        )}** ${operatorActionValue(
                            threshold.operator,
                            threshold.value,
                            '**',
                        )}`,
                );
                const thresholdMessage = `Your results for the chart **${
                    details.name
                }** triggered the following alerts:\n${thresholdMessageList.join(
                    '\n',
                )}`;
                await this.emailClient.sendImageNotificationEmail(
                    recipient,
                    `Lightdash Data Alert`,
                    name,
                    details.description || '',
                    thresholdMessage,
                    new Date().toLocaleDateString('en-GB'),
                    `Delivered files expire after ${Math.ceil(emailExpiration / 86400)} days`,
                    imageUrl,
                    url,
                    schedulerUrl,
                    includeLinks,
                    pdfFile?.source,
                    undefined, // expiration days
                    'This is a data alert sent by Lightdash',
                    imageBuffer,
                );
            } else if (
                format === SchedulerFormat.IMAGE ||
                format === SchedulerFormat.PDF
            ) {
                if (
                    format === SchedulerFormat.IMAGE &&
                    imageUrl === undefined
                ) {
                    throw new Error('Missing image URL');
                }
                if (format === SchedulerFormat.PDF && !pdfFile) {
                    throw new Error('Missing PDF file');
                }
                await this.emailClient.sendImageNotificationEmail(
                    recipient,
                    name,
                    details.name,
                    details.description || '',
                    scheduler.message,
                    new Date().toLocaleDateString('en-GB'),
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone || defaultSchedulerTimezone,
                    ),
                    imageUrl,
                    url,
                    schedulerUrl,
                    includeLinks,
                    pdfFile?.source,
                    Math.ceil(emailExpiration / 86400),
                    undefined, // deliveryType
                    format === SchedulerFormat.IMAGE ? imageBuffer : undefined,
                );
            } else if (savedChartUuid) {
                if (csvUrl === undefined) {
                    throw new Error('Missing CSV URL');
                }
                const csvOptions = SchedulerTask.getCsvOptions(scheduler);
                await this.emailClient.sendChartCsvNotificationEmail(
                    recipient,
                    name,
                    details.name,
                    details.description || '',
                    scheduler.message,
                    new Date().toLocaleDateString('en-GB'),
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone || defaultSchedulerTimezone,
                    ),
                    csvUrl,
                    url,
                    schedulerUrl,
                    includeLinks,
                    Math.ceil(emailExpiration / 86400),
                    csvOptions?.asAttachment,
                    format,
                );
            } else if (dashboardUuid) {
                if (csvUrls === undefined) {
                    throw new Error('Missing CSV URLS');
                }
                const csvOptions = SchedulerTask.getCsvOptions(scheduler);

                await this.emailClient.sendDashboardCsvNotificationEmail(
                    recipient,
                    name,
                    details.name,
                    details.description || '',
                    scheduler.message,
                    new Date().toLocaleDateString('en-GB'),
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone || defaultSchedulerTimezone,
                    ),
                    csvUrls,
                    url,
                    schedulerUrl,
                    includeLinks,
                    Math.ceil(emailExpiration / 86400),
                    csvOptions?.asAttachment,
                    format,
                    failures,
                );
            } else {
                throw new Error('Not implemented');
            }

            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerEmailTargetUuid,
                    groupId: notification.jobGroup,
                    type: 'email',
                    format,
                    withPdf: pdfFile !== undefined,
                    ...getSchedulerResourceTypeAndId(scheduler),
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
                scheduledTime,
                target: recipient,
                targetType: 'email',
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    error: `${e}`,
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerEmailTargetUuid,
                    groupId: notification.jobGroup,
                    type: 'email',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'email',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
                target: recipient,
            });

            throw e; // Cascade error to it can be retried by graphile
        }
    }

    // eslint-disable-next-line consistent-return -- we throw in the default case. tsc doesn't like it.
    static evaluateThreshold(
        thresholds: ThresholdOptions[],
        results: Record<string, AnyType>[],
    ): {
        met: boolean;
        fieldId: string | null;
        operator: ThresholdOperator | null;
        thresholdValue: number | null;
        rowCount: number;
        evaluatedRawValue: AnyType;
        evaluatedParsedValue: number | null;
        previousRawValue?: AnyType;
        previousParsedValue?: number | null;
    } {
        const rowCount = results.length;

        if (thresholds.length < 1 || rowCount < 1) {
            return {
                met: false,
                fieldId: thresholds[0]?.fieldId ?? null,
                operator: thresholds[0]?.operator ?? null,
                thresholdValue: thresholds[0]?.value ?? null,
                rowCount,
                evaluatedRawValue: undefined,
                evaluatedParsedValue: null,
            };
        }

        const { fieldId, operator, value: thresholdValue } = thresholds[0];

        const getRawAndParsed = (resultIdx: number) => {
            if (resultIdx >= results.length) {
                throw new NotEnoughResults(
                    `Threshold alert error: Expected at least ${resultIdx} rows, but only ${results.length} row(s) were returned.`,
                );
            }

            const result = results[resultIdx];

            if (!(fieldId in result)) {
                // This error will disable the scheduler
                throw new FieldReferenceError(
                    `Threshold alert error: Tried to reference field with unknown id: ${fieldId}`,
                );
            }
            return {
                raw: result[fieldId],
                parsed: parseFloat(result[fieldId]),
            };
        };

        const latest = getRawAndParsed(0);
        const evaluatedRawValue = latest.raw;
        const evaluatedParsedValue = latest.parsed;

        switch (operator) {
            case ThresholdOperator.GREATER_THAN:
                return {
                    met: evaluatedParsedValue > thresholdValue,
                    fieldId,
                    operator,
                    thresholdValue,
                    rowCount,
                    evaluatedRawValue,
                    evaluatedParsedValue,
                };

            case ThresholdOperator.LESS_THAN:
                return {
                    met: evaluatedParsedValue < thresholdValue,
                    fieldId,
                    operator,
                    thresholdValue,
                    rowCount,
                    evaluatedRawValue,
                    evaluatedParsedValue,
                };

            case ThresholdOperator.INCREASED_BY:
            case ThresholdOperator.DECREASED_BY:
                if (rowCount < 2) {
                    throw new NotEnoughResults(
                        `Threshold alert error: Increase/decrease comparison requires at least two rows, but only ${rowCount} row(s) were returned.`,
                    );
                }
                const previous = getRawAndParsed(1);
                const percentage =
                    operator === ThresholdOperator.INCREASED_BY
                        ? ((evaluatedParsedValue - previous.parsed) /
                              previous.parsed) *
                          100
                        : ((previous.parsed - evaluatedParsedValue) /
                              previous.parsed) *
                          100;
                return {
                    met: percentage > thresholdValue,
                    fieldId,
                    operator,
                    thresholdValue,
                    rowCount,
                    evaluatedRawValue,
                    evaluatedParsedValue,
                    previousRawValue: previous.raw,
                    previousParsedValue: previous.parsed,
                };

            default:
                return assertUnreachable(
                    operator,
                    `Unknown threshold alert operator: ${operator}`,
                );
        }
    }

    static isPositiveThresholdAlert(
        thresholds: ThresholdOptions[],
        results: Record<string, AnyType>[],
    ): boolean {
        return SchedulerTask.evaluateThreshold(thresholds, results).met;
    }

    protected async uploadGsheets(
        jobId: string,
        notification: GsheetsNotificationPayload,
    ) {
        const { schedulerUuid, scheduledTime } = notification;

        setSchedulerJobLogContext({
            jobId,
            schedulerUuid,
        });

        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            userId: notification.userUuid,
            properties: {
                jobId,
                organizationId: notification.organizationUuid,
                projectId: notification.projectUuid,
                schedulerId: schedulerUuid,
                schedulerTargetId: undefined,
                groupId: notification.jobGroup,
                type: 'gsheets',
                sendNow: schedulerUuid === undefined,
            },
        });
        let sessionUser: SessionUser | undefined;
        let account: AccountType | undefined;
        let scheduler: SchedulerAndTargets | undefined;

        let deliveryUrl = `${this.lightdashConfig.siteUrl}/generalSettings/projectManagement/${notification.projectUuid}/scheduledDeliveries?tab=scheduled-deliveries&schedulerUuid=${schedulerUuid}`;
        try {
            if (!this.googleDriveClient.isEnabled) {
                throw new MissingConfigError(
                    'Unable to upload Google Sheet from scheduler, Google Drive is not enabled',
                );
            }
            scheduler =
                await this.schedulerService.schedulerModel.getSchedulerAndTargets(
                    schedulerUuid,
                );

            const { format, savedChartUuid, dashboardUuid, thresholds } =
                scheduler;

            const gdriveId = isSchedulerGsheetsOptions(scheduler.options)
                ? scheduler.options.gdriveId
                : undefined;
            if (gdriveId === undefined) {
                throw new Error('Missing gdriveId');
            }

            const tabName = isSchedulerGsheetsOptions(scheduler.options)
                ? scheduler.options.tabName
                : undefined;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: gdriveId,
                targetType: 'gsheets',
                status: SchedulerJobStatus.STARTED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
            sessionUser = await this.userService.getSessionByUserUuid(
                scheduler.createdBy,
            );
            account = await this.userService.getAccountByUserUuid(
                scheduler.createdBy,
            );

            const schedulerUuidParam = setUuidParam(
                'scheduler_uuid',
                schedulerUuid,
            );

            if (format !== SchedulerFormat.GSHEETS) {
                throw new UnexpectedServerError(
                    `Unable to process format ${format} on sendGdriveNotification`,
                );
            } else if (savedChartUuid) {
                const chart =
                    await this.schedulerService.savedChartModel.get(
                        savedChartUuid,
                    );
                deliveryUrl = `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${savedChartUuid}/view?${schedulerUuidParam}&isSync=true`;

                const defaultSchedulerTimezone =
                    await this.schedulerService.getSchedulerDefaultTimezone(
                        schedulerUuid,
                    );

                const shouldPivot =
                    isTableChartConfig(chart.chartConfig.config) &&
                    !!getPivotConfig(chart);

                const {
                    rows,
                    fields: itemMap,
                    pivotDetails,
                    displayTimezone,
                } = await this.asyncQueryService.executeSavedChartQueryAndGetResults(
                    {
                        account,
                        projectUuid: chart.projectUuid,
                        chartUuid: savedChartUuid,
                        invalidateCache: true,
                        context:
                            QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD,
                        pivotResults: shouldPivot,
                    },
                    SCHEDULER_POLLING_OPTIONS,
                );

                if (thresholds !== undefined && thresholds.length > 0) {
                    throw new UnexpectedServerError(
                        'Thresholds not implemented for google sheets',
                    );
                }
                const showTableNames = isTableChartConfig(
                    chart.chartConfig.config,
                )
                    ? (chart.chartConfig.config.showTableNames ?? false)
                    : true;
                const customLabels = getCustomLabelsFromTableConfig(
                    chart.chartConfig.config,
                );

                const refreshToken = await this.userService.getRefreshToken(
                    scheduler.createdBy,
                );

                const reportUrl = `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chart.uuid}/view?${schedulerUuidParam}&isSync=true`;
                await this.googleDriveClient.uploadMetadata(
                    refreshToken,
                    gdriveId,
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone || defaultSchedulerTimezone,
                    ),
                    undefined,
                    reportUrl,
                );
                const pivotConfig = getPivotConfig(chart);
                if (
                    pivotConfig &&
                    isTableChartConfig(chart.chartConfig.config)
                ) {
                    if (!pivotDetails) {
                        throw new Error(
                            'Cannot export pivoted results without SQL pivot details',
                        );
                    }
                    // pivotResultsAsCsv expects a formatted ResultRow[] type, so we need to convert it first
                    const formattedRows = formatRows(
                        rows,
                        itemMap,
                        undefined,
                        undefined,
                        displayTimezone ?? undefined,
                    );

                    const pivotedResults = pivotResultsAsCsv({
                        pivotConfig,
                        rows: formattedRows,
                        itemMap,
                        customLabels,
                        onlyRaw: true,
                        pivotDetails,
                        timezone: displayTimezone ?? undefined,
                    });
                    await this.googleDriveClient.appendCsvToSheet(
                        refreshToken,
                        gdriveId,
                        pivotedResults,
                        tabName,
                    );
                } else {
                    await this.googleDriveClient.appendToSheet(
                        refreshToken,
                        gdriveId,
                        rows,
                        itemMap,
                        showTableNames,
                        tabName,
                        chart.tableConfig.columnOrder,
                        customLabels,
                        getHiddenTableFields(chart.chartConfig),
                        displayTimezone ?? undefined,
                    );
                }
            } else if (dashboardUuid) {
                const dashboard = await this.dashboardService.getByIdOrSlug(
                    sessionUser,
                    dashboardUuid,
                );
                deliveryUrl = `${this.lightdashConfig.siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}/view?${schedulerUuidParam}&isSync=true`;

                const defaultSchedulerTimezone =
                    await this.schedulerService.getSchedulerDefaultTimezone(
                        schedulerUuid,
                    );

                const chartTiles = dashboard.tiles
                    .filter(isDashboardChartTileType)
                    .filter((tile) => tile.properties.savedChartUuid);

                const refreshToken = await this.userService.getRefreshToken(
                    scheduler.createdBy,
                );

                const chartNames = chartTiles.reduce<Record<string, string>>(
                    (acc, tile) => {
                        const chartUuid = tile.properties.savedChartUuid!;
                        return {
                            ...acc,
                            [chartUuid]:
                                tile.properties.title ||
                                tile.properties.chartName ||
                                chartUuid,
                        };
                    },
                    {},
                );

                await this.googleDriveClient.uploadMetadata(
                    refreshToken,
                    gdriveId,
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone ?? defaultSchedulerTimezone,
                    ),
                    Object.values(chartNames),
                );

                Logger.debug(
                    `Uploading dashboard with ${chartTiles.length} charts to Google Sheets`,
                );

                // Extract dashboard filters and apply scheduler filter overrides
                const dashboardFilters = dashboard.filters;
                const schedulerFilters = isDashboardScheduler(scheduler)
                    ? scheduler.filters
                    : undefined;

                if (schedulerFilters) {
                    dashboardFilters.dimensions = applyDimensionOverrides(
                        dashboard.filters,
                        schedulerFilters,
                    );
                }

                // Get the dashboard parameters to override the saved chart parameters
                const dashboardParameters =
                    getDashboardParametersValuesMap(dashboard);

                // We want to process all charts in sequence, so we don't load all chart results in memory
                await chartTiles
                    .reduce(async (promise, tile) => {
                        await promise;
                        const chartUuid = tile.properties.savedChartUuid!;
                        const chart =
                            await this.schedulerService.savedChartModel.get(
                                chartUuid,
                            );
                        const shouldPivotChart =
                            isTableChartConfig(chart.chartConfig.config) &&
                            !!getPivotConfig(chart);

                        const {
                            rows,
                            fields: itemMap,
                            pivotDetails,
                            displayTimezone,
                        } = await this.asyncQueryService.executeDashboardChartQueryAndGetResults(
                            {
                                account: account!,
                                projectUuid: dashboard.projectUuid,
                                tileUuid: tile.uuid,
                                chartUuid,
                                dashboardUuid,
                                dashboardFilters,
                                dashboardSorts: [],
                                invalidateCache: true,
                                context:
                                    QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD,
                                pivotResults: shouldPivotChart,
                                parameters: dashboardParameters,
                            },
                            SCHEDULER_POLLING_OPTIONS,
                        );
                        const showTableNames = isTableChartConfig(
                            chart.chartConfig.config,
                        )
                            ? (chart.chartConfig.config.showTableNames ?? false)
                            : true;
                        const customLabels = getCustomLabelsFromTableConfig(
                            chart.chartConfig.config,
                        );

                        const chartTabName =
                            await this.googleDriveClient.createNewTab(
                                refreshToken,
                                gdriveId,
                                chartNames[chartUuid] || chartUuid,
                            );
                        const pivotConfig = getPivotConfig(chart);
                        if (
                            pivotConfig &&
                            isTableChartConfig(chart.chartConfig.config)
                        ) {
                            if (!pivotDetails) {
                                throw new Error(
                                    'Cannot export pivoted results without SQL pivot details',
                                );
                            }
                            // pivotResultsAsCsv expects a formatted ResultRow[] type, so we need to convert it first
                            const formattedRows = formatRows(
                                rows,
                                itemMap,
                                undefined,
                                undefined,
                                displayTimezone ?? undefined,
                            );

                            const pivotedResults = pivotResultsAsCsv({
                                pivotConfig,
                                rows: formattedRows,
                                itemMap,
                                customLabels,
                                onlyRaw: true,
                                pivotDetails,
                                timezone: displayTimezone ?? undefined,
                            });

                            await this.googleDriveClient.appendCsvToSheet(
                                refreshToken,
                                gdriveId,
                                pivotedResults,
                                chartTabName,
                            );
                        } else {
                            await this.googleDriveClient.appendToSheet(
                                refreshToken,
                                gdriveId,
                                rows,
                                itemMap,
                                showTableNames,
                                chartTabName,
                                chart.tableConfig.columnOrder,
                                customLabels,
                                getHiddenTableFields(chart.chartConfig),
                                displayTimezone ?? undefined,
                            );
                        }
                    }, Promise.resolve())
                    .catch((error) => {
                        Logger.debug('Error processing charts:', error);
                        throw error;
                    });
            } else if (scheduler.savedSqlUuid) {
                const sqlChart =
                    await this.asyncQueryService.savedSqlModel.getByUuid(
                        scheduler.savedSqlUuid,
                        {},
                    );
                deliveryUrl = `${this.lightdashConfig.siteUrl}/projects/${sqlChart.project.projectUuid}/sql-runner/${sqlChart.slug}?${schedulerUuidParam}&isSync=true`;

                const defaultSchedulerTimezone =
                    await this.schedulerService.getSchedulerDefaultTimezone(
                        schedulerUuid,
                    );

                const refreshToken = await this.userService.getRefreshToken(
                    scheduler.createdBy,
                );

                // Execute the SQL chart query using the chart's visualization config
                // This produces the same pivoted/aggregated results that the chart shows
                const { rows } =
                    await this.asyncQueryService.executeSqlChartQueryAndGetResults(
                        {
                            account,
                            projectUuid: sqlChart.project.projectUuid,
                            savedSqlUuid: scheduler.savedSqlUuid,
                            invalidateCache: true,
                            context:
                                QueryExecutionContext.SCHEDULED_GSHEETS_SQL_CHART,
                        },
                        SCHEDULER_POLLING_OPTIONS,
                    );

                await this.googleDriveClient.uploadMetadata(
                    refreshToken,
                    gdriveId,
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone || defaultSchedulerTimezone,
                    ),
                    undefined,
                    deliveryUrl,
                );

                // Convert rows to string[][] for Google Sheets
                const columnNames = rows.length > 0 ? Object.keys(rows[0]) : [];
                const headerRow = columnNames;
                const dataRows = rows.map((row) =>
                    columnNames.map((col) => {
                        const value = row[col];
                        if (value === null || value === undefined) return '';
                        if (value instanceof Date) return value.toISOString();
                        return String(value);
                    }),
                );
                const csvData = [headerRow, ...dataRows];

                await this.googleDriveClient.appendCsvToSheet(
                    refreshToken,
                    gdriveId,
                    csvData,
                    tabName,
                );
            } else {
                throw new UnexpectedServerError('Not implemented');
            }

            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: undefined,
                    groupId: notification.jobGroup,
                    type: 'gsheets',
                    format,
                    ...getSchedulerResourceTypeAndId(scheduler),
                    sendNow: schedulerUuid === undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: gdriveId,
                targetType: 'gsheets',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    error: `${e}`,
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: undefined,
                    groupId: notification.jobGroup,
                    type: 'gsheets',
                    sendNow: schedulerUuid === undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'gsheets',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            const shouldDisableSync =
                e instanceof NotFoundError ||
                e instanceof ForbiddenError ||
                e instanceof MissingConfigError ||
                e instanceof UnexpectedGoogleSheetsError ||
                e instanceof WarehouseConnectionError;

            // Notify/disable is the worker's job (it knows the attempt count);
            // here we just report the failure with the context it needs.
            throw new SchedulerDeliveryError({
                cause: e,
                isNonRetryable: shouldDisableSync,
                createdByUserUuid:
                    scheduler?.createdBy ?? notification.userUuid,
                notification: {
                    organizationUuid: account?.organization?.organizationUuid,
                    recipientEmail: account?.user.email,
                    schedulerName: scheduler?.name ?? 'Unknown',
                    deliveryUrl,
                },
            });
        }
    }

    protected async notifyGsheetsDeliveryFailure(
        err: SchedulerDeliveryError,
        jobId: string,
    ): Promise<void> {
        const { isNonRetryable, notification } = err;
        const { organizationUuid, recipientEmail, schedulerName, deliveryUrl } =
            notification;

        if (this.slackClient.isEnabled && organizationUuid) {
            await this.slackClient.postMessageToNotificationChannel({
                organizationUuid,
                text: `Error uploading Google Sheets: ${schedulerName}`,
                blocks: getNotificationChannelErrorBlocks(
                    schedulerName,
                    err.cause,
                    deliveryUrl,
                    'Google Sync',
                    isNonRetryable,
                ),
            });
        }

        try {
            if (recipientEmail) {
                await this.emailClient.sendGoogleSheetsErrorNotificationEmail(
                    recipientEmail,
                    schedulerName,
                    deliveryUrl,
                    getErrorMessage(err.cause),
                    isNonRetryable,
                    jobId,
                );
            }
        } catch (emailError) {
            Logger.error(
                `Failed to send Google Sheets failure email: ${emailError}`,
            );
        }
    }

    protected async disableGsheetsScheduler(
        schedulerUuid: string,
        createdByUserUuid: string,
    ): Promise<void> {
        const sessionUser =
            await this.userService.getSessionByUserUuid(createdByUserUuid);
        await this.schedulerService.setSchedulerEnabled(
            sessionUser,
            schedulerUuid,
            false,
        );
    }

    protected async logScheduledTarget(
        format: SchedulerFormat,
        target: CreateSchedulerTarget | undefined,
        targetJobId: string,
        schedulerUuid: string | undefined,
        jobId: string,
        scheduledTime: Date,
        details: {
            projectUuid: string;
            organizationUuid: string;
            createdByUserUuid: string;
        },
    ) {
        if (format === SchedulerFormat.GSHEETS) {
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                target: undefined,
                targetType: 'gsheets',
                jobId: targetJobId,
                schedulerUuid,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.SCHEDULED,
                details,
            });
            return;
        }
        if (target === undefined) {
            Logger.error(`Missing target for scheduler format ${format}`);
            return;
        }
        const getTargetDetails = (): Pick<
            CreateSchedulerLog,
            'task' | 'target' | 'targetType'
        > => {
            if (isCreateSchedulerSlackTarget(target)) {
                return {
                    task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                    target: target.channel,
                    targetType: 'slack',
                };
            }

            if (isCreateSchedulerMsTeamsTarget(target)) {
                return {
                    task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                    target: target.webhook,
                    targetType: 'msteams',
                };
            }
            if (isCreateSchedulerGoogleChatTarget(target)) {
                return {
                    task: SCHEDULER_TASKS.SEND_GOOGLE_CHAT_NOTIFICATION,
                    target: target.googleChatWebhook,
                    targetType: 'googlechat',
                };
            }
            return {
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                target: target.recipient,
                targetType: 'email',
            };
        };
        const { task, target: jobTarget, targetType } = getTargetDetails();

        await this.schedulerService.logSchedulerJob({
            task,
            target: jobTarget,
            targetType,
            jobId: targetJobId,
            schedulerUuid,
            jobGroup: jobId,
            scheduledTime,
            status: SchedulerJobStatus.SCHEDULED,
            details,
        });
    }

    protected async handleScheduledDelivery(
        jobId: string,
        scheduledTime: Date,
        schedulerPayload: ScheduledDeliveryPayload,
        isFinalAttempt: boolean,
    ) {
        const schedulerUuid = getSchedulerUuid(schedulerPayload);

        const scheduler: SchedulerAndTargets | CreateSchedulerAndTargets =
            isCreateScheduler(schedulerPayload)
                ? schedulerPayload
                : await this.schedulerService.schedulerModel.getSchedulerAndTargets(
                      schedulerPayload.schedulerUuid,
                  );

        if (!scheduler.enabled) {
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                schedulerUuid,
                jobId,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: `Scheduler is disabled, skipping scheduled delivery.`,
                    projectUuid: schedulerPayload.projectUuid,
                    organizationUuid: schedulerPayload.organizationUuid,
                    createdByUserUuid: schedulerPayload.userUuid,
                },
            });
            return;
        }

        const {
            createdBy: userUuid,
            savedChartUuid,
            dashboardUuid,
            thresholds,
            notificationFrequency,
            targets,
        } = scheduler;

        const sessionUser =
            await this.userService.getSessionByUserUuid(userUuid);
        const account = await this.userService.getAccountByUserUuid(userUuid);

        // If the scheduler is not a gsheets and has no targets, we skip the delivery
        if (
            scheduler.format !== SchedulerFormat.GSHEETS &&
            targets.length === 0
        ) {
            Logger.warn(
                `Scheduler ${schedulerUuid} has no targets, disabling scheduler and skipping scheduled delivery. Formats: ${scheduler.format}`,
            );

            // Disable scheduler if it has no targets
            if (schedulerUuid) {
                await this.schedulerService.setSchedulerEnabled(
                    sessionUser,
                    schedulerUuid,
                    false,
                );
            }

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                schedulerUuid,
                jobId,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    partialFailures: [
                        {
                            type: PartialFailureType.MISSING_TARGETS,
                        },
                    ],
                    projectUuid: schedulerPayload.projectUuid,
                    organizationUuid: schedulerPayload.organizationUuid,
                    createdByUserUuid: schedulerPayload.userUuid,
                },
            });
            return;
        }

        // Run the agent and use its report as the message, then fall through to
        // the normal render + send. Kept in a separate const so the type guard
        // doesn't leak into `scheduler` and break later `in scheduler` narrowing.
        const augmentedScheduler = isAugmentedScheduler(scheduler)
            ? scheduler
            : null;
        if (augmentedScheduler && this.schedulerAiAugmentation) {
            scheduler.message =
                await this.schedulerAiAugmentation.generateScheduledReport(
                    augmentedScheduler,
                    schedulerPayload.organizationUuid,
                );
        }

        this.analytics.track({
            event: 'scheduler_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            userId: schedulerPayload.userUuid,
            properties: {
                jobId,
                organizationId: schedulerPayload.organizationUuid,
                projectId: schedulerPayload.projectUuid,
                schedulerId: schedulerUuid,
                groupId: jobId,
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });
        await this.schedulerService.logSchedulerJob({
            task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
            schedulerUuid,
            jobId,
            jobGroup: jobId,
            scheduledTime,
            status: SchedulerJobStatus.STARTED,
            details: {
                projectUuid: schedulerPayload.projectUuid,
                organizationUuid: schedulerPayload.organizationUuid,
                createdByUserUuid: schedulerPayload.userUuid,
            },
        });

        const traceProperties = {
            organizationUuid: schedulerPayload.organizationUuid,
            projectUuid: schedulerPayload.projectUuid,
            userUuid: schedulerPayload.userUuid,
        };

        const chartFilterOverrides = isChartScheduler(scheduler)
            ? scheduler.filters
            : undefined;
        const chartParameterOverrides = isChartScheduler(scheduler)
            ? scheduler.parameters
            : undefined;

        try {
            if (thresholds !== undefined && thresholds.length > 0) {
                // TODO add multiple AND conditions
                if (savedChartUuid) {
                    // We are fetching here the results before getting image or CSV
                    const { queryUuid, rows } =
                        await this.asyncQueryService.executeSavedChartQueryAndGetResults(
                            {
                                account,
                                projectUuid: schedulerPayload.projectUuid,
                                chartUuid: savedChartUuid,
                                context: QueryExecutionContext.SCHEDULED_CHART,
                                filterOverrides: chartFilterOverrides,
                                parameters: chartParameterOverrides,
                            },
                            SCHEDULER_POLLING_OPTIONS,
                        );

                    const evaluation = SchedulerTask.evaluateThreshold(
                        thresholds,
                        rows,
                    );
                    const firstRow: Record<string, AnyType> | undefined =
                        rows[0];
                    const dimensionFieldIds = firstRow
                        ? Object.keys(firstRow).filter(
                              (k) => k !== evaluation.fieldId,
                          )
                        : [];
                    const firstRowDimensions = firstRow
                        ? Object.fromEntries(
                              Object.entries(firstRow).filter(
                                  ([k]) => k !== evaluation.fieldId,
                              ),
                          )
                        : {};
                    Logger.info('scheduler.threshold_evaluated', {
                        schedulerUuid,
                        jobId,
                        savedChartUuid,
                        queryUuid,
                        fieldId: evaluation.fieldId,
                        operator: evaluation.operator,
                        thresholdValue: evaluation.thresholdValue,
                        rowCount: evaluation.rowCount,
                        evaluatedRawValue: evaluation.evaluatedRawValue,
                        evaluatedParsedValue: evaluation.evaluatedParsedValue,
                        previousRawValue: evaluation.previousRawValue,
                        previousParsedValue: evaluation.previousParsedValue,
                        dimensionFieldIds,
                        firstRowDimensions,
                        result: evaluation.met
                            ? ThresholdStatus.MET
                            : ThresholdStatus.NOT_MET,
                    });

                    if (evaluation.met) {
                        // If the delivery frequency is once, we disable the scheduler.
                        // It will get sent once this time.
                        if (
                            notificationFrequency ===
                                NotificationFrequency.ONCE &&
                            schedulerUuid
                        ) {
                            console.debug(
                                'Alert is set to ONCE, disabling scheduler after delivery',
                            );
                            await this.schedulerService.setSchedulerEnabled(
                                sessionUser,
                                schedulerUuid,
                                false,
                            );
                        }
                        console.debug(
                            'Positive threshold alert, continue with notification',
                        );
                    } else {
                        console.debug(
                            'Negative threshold alert, skipping notification',
                        );
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                            schedulerUuid,
                            jobId,
                            jobGroup: jobId,
                            scheduledTime,
                            status: SchedulerJobStatus.COMPLETED,
                            details: {
                                projectUuid: schedulerPayload.projectUuid,
                                organizationUuid:
                                    schedulerPayload.organizationUuid,
                                createdByUserUuid: schedulerPayload.userUuid,
                                thresholdStatus: ThresholdStatus.NOT_MET,
                                thresholdFieldId: evaluation.fieldId,
                                thresholdOperator: evaluation.operator,
                                thresholdValue: evaluation.thresholdValue,
                                evaluatedParsedValue:
                                    evaluation.evaluatedParsedValue,
                                rowCount: evaluation.rowCount,
                            },
                        });
                        this.analytics.track({
                            event: 'scheduler_job.completed',
                            anonymousId: LightdashAnalytics.anonymousId,
                            userId: schedulerPayload.userUuid,
                            properties: {
                                jobId,
                                organizationId:
                                    schedulerPayload.organizationUuid,
                                projectId: schedulerPayload.projectUuid,
                                schedulerId: schedulerUuid,
                                groupId: jobId,
                                isThresholdAlert: true,
                                thresholdStatus: ThresholdStatus.NOT_MET,
                            },
                        });
                        return;
                    }
                } else if (dashboardUuid) {
                    throw new Error(
                        'Threshold alert not implemented for dashboards',
                    );
                }
            }

            let page: NotificationPayloadBase['page'] | undefined;
            let perChannelPages:
                | {
                      email?: NotificationPayloadBase['page'];
                      slack?: NotificationPayloadBase['page'];
                      msteams?: NotificationPayloadBase['page'];
                  }
                | undefined;

            if (scheduler.format === SchedulerFormat.GSHEETS) {
                page = undefined;
            } else {
                // Effective per-channel expiry (org override → org base → env
                // channel → env base), resolved per channel so a delivery can
                // last longer on, say, Slack than email.
                const [
                    emailExpiration,
                    slackExpiration,
                    msTeamsExpiration,
                    googleChatExpiration,
                ] = await Promise.all([
                    this.getDeliveryExpirationSeconds(
                        schedulerPayload.organizationUuid,
                        'email',
                    ),
                    this.getDeliveryExpirationSeconds(
                        schedulerPayload.organizationUuid,
                        'slack',
                    ),
                    this.getDeliveryExpirationSeconds(
                        schedulerPayload.organizationUuid,
                        'msteams',
                    ),
                    this.getDeliveryExpirationSeconds(
                        schedulerPayload.organizationUuid,
                        'googlechat',
                    ),
                ]);

                const hasEmail = targets.some(
                    (t) =>
                        !isCreateSchedulerSlackTarget(t) &&
                        !isCreateSchedulerMsTeamsTarget(t) &&
                        !isCreateSchedulerGoogleChatTarget(t),
                );
                const hasSlack = targets.some(isCreateSchedulerSlackTarget);
                const hasMsTeams = targets.some(isCreateSchedulerMsTeamsTarget);
                const hasGoogleChat = targets.some(
                    isCreateSchedulerGoogleChatTarget,
                );

                const expirationToChannels = new Map<
                    number,
                    Set<'email' | 'slack' | 'msteams' | 'googlechat'>
                >();
                const addToMap = (
                    expiration: number,
                    channel: 'email' | 'slack' | 'msteams' | 'googlechat',
                ) => {
                    const existing = expirationToChannels.get(expiration);
                    if (existing) {
                        existing.add(channel);
                    } else {
                        expirationToChannels.set(
                            expiration,
                            new Set([channel]),
                        );
                    }
                };
                if (hasEmail) addToMap(emailExpiration, 'email');
                if (hasSlack) addToMap(slackExpiration, 'slack');
                if (hasMsTeams) addToMap(msTeamsExpiration, 'msteams');
                if (hasGoogleChat) addToMap(googleChatExpiration, 'googlechat');

                const pageByChannel = await Array.from(
                    expirationToChannels.entries(),
                ).reduce(
                    async (accPromise, [expiration, channels]) => {
                        const acc = await accPromise;
                        const channelPage = await this.getNotificationPageData(
                            scheduler,
                            jobId,
                            isFinalAttempt,
                            expiration,
                        );
                        for (const channel of channels) {
                            acc[channel] = channelPage;
                        }
                        return acc;
                    },
                    Promise.resolve(
                        {} as Record<string, NotificationPayloadBase['page']>,
                    ),
                );

                perChannelPages = pageByChannel;
                page =
                    pageByChannel.email ??
                    pageByChannel.slack ??
                    pageByChannel.msteams ??
                    pageByChannel.googlechat;
            }

            const scheduledJobs =
                await this.schedulerClient.generateJobsForSchedulerTargets(
                    scheduledTime,
                    scheduler,
                    page,
                    jobId,
                    traceProperties,
                    perChannelPages,
                );

            // Create scheduled jobs for targets
            await Promise.all(
                scheduledJobs.map(({ target, jobId: targetJobId }) => {
                    if (!target) {
                        return Promise.resolve();
                    }

                    return this.logScheduledTarget(
                        scheduler.format,
                        target,
                        targetJobId,
                        schedulerUuid,
                        jobId,
                        scheduledTime,
                        {
                            projectUuid: schedulerPayload.projectUuid,
                            organizationUuid: schedulerPayload.organizationUuid,
                            createdByUserUuid: schedulerPayload.userUuid,
                        },
                    );
                }),
            );

            // Use page failures directly as partialFailures for logging
            const partialFailures = page?.failures;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                schedulerUuid,
                jobId,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: schedulerPayload.projectUuid,
                    organizationUuid: schedulerPayload.organizationUuid,
                    createdByUserUuid: schedulerPayload.userUuid,
                    ...(partialFailures &&
                        partialFailures.length > 0 && { partialFailures }),
                },
            });

            this.analytics.track({
                event: 'scheduler_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: schedulerPayload.userUuid,
                properties: {
                    jobId,
                    organizationId: schedulerPayload.organizationUuid,
                    projectId: schedulerPayload.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: jobId,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                    hasPartialFailures:
                        partialFailures && partialFailures.length > 0,
                    partialFailuresCount: partialFailures?.length ?? 0,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: schedulerPayload.userUuid,
                properties: {
                    jobId,
                    organizationId: schedulerPayload.organizationUuid,
                    projectId: schedulerPayload.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: jobId,
                    error: `${e}`,
                },
            });
            const translatedSlackError = translateSlackError(e);
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                schedulerUuid,
                jobId,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: translatedSlackError?.error ?? getErrorMessage(e),
                    ...(translatedSlackError && {
                        slackErrorCode: translatedSlackError.slackErrorCode,
                    }),
                    projectUuid: schedulerPayload.projectUuid,
                    organizationUuid: schedulerPayload.organizationUuid,
                    createdByUserUuid: schedulerPayload.userUuid,
                },
            });

            // Send failure notification email to scheduler creator
            try {
                const user = await this.userService.getSessionByUserUuid(
                    scheduler.createdBy,
                );
                if (user.email) {
                    const schedulerUrlParam = setUuidParam(
                        'scheduler_uuid',
                        schedulerUuid,
                    );
                    const schedulerUrl =
                        scheduler.savedChartUuid || scheduler.dashboardUuid
                            ? `${this.lightdashConfig.siteUrl}/projects/${
                                  schedulerPayload.projectUuid
                              }/${
                                  scheduler.savedChartUuid
                                      ? 'saved'
                                      : 'dashboards'
                              }/${
                                  scheduler.savedChartUuid ||
                                  scheduler.dashboardUuid
                              }/view?${schedulerUrlParam}`
                            : this.lightdashConfig.siteUrl;

                    await this.emailClient.sendScheduledDeliveryFailureEmail(
                        user.email,
                        scheduler.name,
                        schedulerUrl,
                        translatedSlackError?.error ?? getErrorMessage(e),
                        jobId,
                    );
                }
            } catch (emailError) {
                Logger.error(
                    `Failed to send scheduled delivery failure email: ${emailError}`,
                );
                // Don't throw - we still want to handle the original error
            }

            // Notify recipients of failure (project-level setting)
            try {
                const projectSettings =
                    await this.projectService.getSchedulerSettingsForWorker(
                        schedulerPayload.projectUuid,
                    );

                if (projectSettings.schedulerFailureNotifyRecipients) {
                    let contactSentence: string | null = null;
                    if (projectSettings.schedulerFailureIncludeContact) {
                        if (projectSettings.schedulerFailureContactOverride) {
                            contactSentence =
                                projectSettings.schedulerFailureContactOverride;
                        } else {
                            try {
                                const owner =
                                    await this.userService.getSessionByUserUuid(
                                        scheduler.createdBy,
                                    );
                                const ownerName =
                                    `${owner.firstName} ${owner.lastName}`.trim();
                                const ownerContact = owner.email
                                    ? `${ownerName} (${owner.email})`
                                    : ownerName;
                                contactSentence = `You can also reach out to ${ownerContact} for details.`;
                            } catch (ownerError) {
                                // Owner may have been deleted; fall back to no
                                // contact line rather than failing the whole
                                // recipient notification fan-out.
                                Logger.warn(
                                    `Could not fetch owner info for scheduler ${schedulerUuid}: ${ownerError}`,
                                );
                            }
                        }
                    }

                    const contentName: string | null =
                        'savedChartName' in scheduler
                            ? (scheduler.savedChartName ??
                              scheduler.dashboardName ??
                              scheduler.savedSqlName ??
                              null)
                            : null;

                    await Promise.all(
                        targets.map(async (target) => {
                            try {
                                if (isCreateSchedulerSlackTarget(target)) {
                                    if (!this.slackClient.isEnabled) return;
                                    const blocks =
                                        getDeliveryFailureRecipientBlocks(
                                            contentName,
                                            contactSentence,
                                        );
                                    await this.slackClient.postMessage({
                                        organizationUuid:
                                            schedulerPayload.organizationUuid,
                                        text: contentName
                                            ? `Scheduled delivery for "${contentName}" failed to run`
                                            : 'A scheduled delivery failed to run',
                                        channel: target.channel,
                                        blocks,
                                    });
                                } else if (
                                    isCreateSchedulerMsTeamsTarget(target)
                                ) {
                                    await this.msTeamsClient.postDeliveryFailureNotificationToRecipient(
                                        {
                                            webhookUrl: target.webhook,
                                            contentName,
                                            contactSentence,
                                        },
                                    );
                                } else if (
                                    isCreateSchedulerGoogleChatTarget(target)
                                ) {
                                    await this.googleChatClient.postDeliveryFailureNotificationToRecipient(
                                        {
                                            webhookUrl:
                                                target.googleChatWebhook,
                                            contentName,
                                            contactSentence,
                                        },
                                    );
                                } else if ('recipient' in target) {
                                    await this.emailClient.sendDeliveryFailureNotificationToRecipient(
                                        target.recipient,
                                        contentName,
                                        contactSentence,
                                    );
                                }
                            } catch (notifyError) {
                                Logger.error(
                                    `Failed to send recipient failure notification for scheduler ${schedulerUuid}: ${notifyError}`,
                                );
                            }
                        }),
                    );
                }
            } catch (notifyError) {
                Logger.error(
                    `Failed to fan out recipient failure notifications for scheduler ${schedulerUuid}: ${notifyError}`,
                );
            }

            if (e instanceof NotEnoughResults) {
                Logger.warn(
                    `Scheduler ${schedulerUuid} did not return enough results for threshold alert`,
                );
                // We don't want to retry the error now, but we are not going to disable the scheduler.
                return; // Do not cascade error
            }

            if (
                e instanceof FieldReferenceError ||
                e instanceof WarehouseConnectionError ||
                e instanceof ParameterError
            ) {
                // This captures both the error from thresholdAlert and metricQuery
                // WarehouseConnectionError indicates misconfigured credentials (wrong password, unreachable host, etc.)
                // ParameterError indicates invalid configuration (e.g., selected tabs no longer exist)
                Logger.warn(
                    `Disabling scheduler with non-retryable error: ${e}`,
                );
                const user = await this.userService.getSessionByUserUuid(
                    scheduler.createdBy,
                );
                await this.schedulerService.setSchedulerEnabled(
                    user,
                    schedulerUuid!,
                    false,
                );
                return; // Do not cascade error
            }
            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async indexCatalog(
        jobId: string,
        scheduledTime: Date,
        payload: SchedulerIndexCatalogJobPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.INDEX_CATALOG,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const { catalogFieldMap } =
                    await this.catalogService.indexCatalog(
                        payload.projectUuid,
                        payload.userUuid,
                    );

                await this.catalogService.migrateCatalogItemTags(
                    payload.projectUuid,
                    payload.prevCatalogItemsWithTags,
                );

                await this.catalogService.migrateCatalogItemIcons(
                    payload.projectUuid,
                    payload.prevCatalogItemsWithIcons,
                );

                await this.catalogService.migrateMetricsTreeEdges(
                    payload.projectUuid,
                    payload.prevMetricTreeEdges,
                );

                await this.catalogService.migrateMetricsTreeNodes(
                    payload.projectUuid,
                    payload.prevMetricsTreeNodes,
                );

                await this.catalogService.setChartUsages(
                    payload.projectUuid,
                    catalogFieldMap,
                );

                return {}; // Don't pollute with more details
            },
        );
    }

    private async createZipDownloadUrl({
        files,
        fileType,
        zipNameBase,
        organizationUuid,
        projectUuid,
        createdByUserUuid,
        logContext,
    }: {
        files: {
            entryNameBase: string;
            localPath: string;
            chartName?: string;
        }[];
        fileType: SchedulerFormat.CSV | SchedulerFormat.XLSX;
        zipNameBase: string;
        organizationUuid: string;
        projectUuid: string;
        createdByUserUuid: string;
        logContext?: string;
    }) {
        if (!this.fileStorageClient.isEnabled()) {
            throw new MissingConfigError('Cloud storage is not enabled');
        }

        if (files.length === 0) {
            throw new UnexpectedServerError('No files to include in zip');
        }

        const zipPath = `/tmp/${nanoid()}.zip`;
        let zipFileName: string;
        try {
            const zipWriteStream = fsSync.createWriteStream(zipPath);
            const archive = archiver('zip', {
                zlib: { level: 9 },
            });

            const zipDone = new Promise<void>((resolve, reject) => {
                zipWriteStream.on('close', resolve);
                zipWriteStream.on('error', reject);
                archive.on('error', reject);
            });
            archive.pipe(zipWriteStream);

            const streams = await Promise.all(
                files.map(async (file) => {
                    const fetchUrl = file.localPath;
                    try {
                        const response = await fetch(fetchUrl);
                        if (!response.ok || !response.body) {
                            Logger.warn(
                                `Failed to fetch export file "${file.entryNameBase}": HTTP ${response.status} ${response.statusText}`,
                            );
                            return null;
                        }

                        return {
                            entryNameBase: file.entryNameBase,
                            stream: Readable.fromWeb(
                                response.body as Parameters<
                                    typeof Readable.fromWeb
                                >[0],
                            ),
                        };
                    } catch (e) {
                        const cause =
                            e instanceof Error && e.cause ? e.cause : undefined;
                        Logger.error(
                            `Failed to fetch export file "${file.entryNameBase}": ${getErrorMessage(e)}`,
                            {
                                chartName: file.chartName,
                                fileUrl: fetchUrl.split('?')[0],
                                cause:
                                    cause instanceof Error
                                        ? {
                                              message: cause.message,
                                              code: (
                                                  cause as NodeJS.ErrnoException
                                              ).code,
                                          }
                                        : cause,
                            },
                        );
                        return null;
                    }
                }),
            );

            const validStreams = streams.filter(
                (
                    stream,
                ): stream is { entryNameBase: string; stream: Readable } =>
                    stream !== null,
            );

            if (validStreams.length === 0) {
                throw new UnexpectedServerError(
                    'All file downloads failed — no files to include in zip',
                );
            }

            const usedNames = new Set<string>();
            const deduplicateName = (baseName: string): string => {
                const extension = `.${fileType}`;
                const base = sanitizeGenericFileName(baseName);
                let name = `${base}${extension}`;
                if (usedNames.has(name)) {
                    let suffix = 2;
                    while (usedNames.has(`${base}_${suffix}${extension}`))
                        suffix += 1;
                    name = `${base}_${suffix}${extension}`;
                }
                usedNames.add(name);
                return name;
            };

            validStreams.forEach((file) => {
                archive.append(file.stream, {
                    name: deduplicateName(file.entryNameBase),
                });
            });

            await archive.finalize();
            await zipDone;

            if (logContext) {
                Logger.info(
                    `Generated zip of ${validStreams.length} ${fileType}s for ${logContext}`,
                );
            }

            zipFileName = `${sanitizeGenericFileName(
                zipNameBase,
            )}-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;

            await this.fileStorageClient.uploadZip(
                fsSync.createReadStream(zipPath),
                zipFileName,
            );
        } finally {
            await fs.unlink(zipPath).catch(() => {});
        }

        return this.persistentDownloadFileService.createPersistentUrl({
            s3Key: zipFileName,
            fileType: 'zip',
            organizationUuid,
            projectUuid,
            createdByUserUuid,
        });
    }

    private async createWorkbookDownloadUrl({
        files,
        workbookNameBase,
        organizationUuid,
        projectUuid,
        createdByUserUuid,
        expirationSecondsOverride,
    }: {
        files: NonNullable<NotificationPayloadBase['page']['csvUrls']>;
        workbookNameBase: string;
        organizationUuid: string;
        projectUuid: string;
        createdByUserUuid: string;
        expirationSecondsOverride?: number;
    }) {
        if (!this.fileStorageClient.isEnabled()) {
            throw new MissingConfigError('Cloud storage is not enabled');
        }

        if (files.length === 0) {
            throw new UnexpectedServerError('No files to include in workbook');
        }

        const workbookPath = `/tmp/${nanoid()}.xlsx`;
        let workbookFileName: string;
        let workbookResult: Awaited<
            ReturnType<typeof WorkbookExportHelper.createWorkbookFile>
        >;
        try {
            workbookResult = await WorkbookExportHelper.createWorkbookFile({
                files: files.map((file) => ({
                    filename: file.filename,
                    sheetName: file.chartName ?? file.filename,
                    localPath: file.localPath,
                })),
                outputPath: workbookPath,
                onFileError: (filename, error) => {
                    Logger.warn(
                        `Failed to add XLSX file "${filename}" to workbook: ${error}`,
                    );
                },
            });

            if (workbookResult.worksheetCount === 0) {
                throw new UnexpectedServerError(
                    'All XLSX downloads failed — no files to include in workbook',
                );
            }

            workbookFileName = `${sanitizeGenericFileName(
                workbookNameBase,
            )}-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;

            await this.fileStorageClient.uploadExcel(
                fsSync.createReadStream(workbookPath),
                workbookFileName,
            );
        } finally {
            await fs.unlink(workbookPath).catch(() => {});
        }

        return {
            url: await this.persistentDownloadFileService.createPersistentUrl({
                s3Key: workbookFileName,
                fileType: DownloadFileType.XLSX,
                organizationUuid,
                projectUuid,
                createdByUserUuid,
                expirationSeconds: expirationSecondsOverride,
            }),
            numFileFailures: workbookResult.failedFileCount,
        };
    }

    protected async exportContent(
        jobId: string,
        scheduledTime: Date,
        payload: ExportContentPayload,
    ) {
        await this.logWrapper<string | number>(
            {
                task: SCHEDULER_TASKS.EXPORT_CONTENT,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                if (payload.resourceType !== SchedulerResourceType.DASHBOARD) {
                    throw new ParameterError(
                        'Only dashboard export is supported',
                    );
                }

                const scheduler = {
                    name: 'Content export',
                    createdBy: payload.userUuid,
                    format: payload.format,
                    options: payload.options,
                    cron: '* * * * *',
                    timezone: 'UTC',
                    savedChartUuid: null,
                    dashboardUuid: payload.resourceUuid,
                    savedSqlUuid: null,
                    appUuid: null,
                    appName: null,
                    agentUuid: null,
                    prompt: null,
                    sourceThreadUuid: null,
                    aiSchedulerOptions: null,
                    enabled: true,
                    includeLinks: false,
                    projectUuid: payload.projectUuid,
                    targets: [],
                    customViewportWidth: payload.customViewportWidth,
                    selectedTabs: payload.selectedTabs ?? null,
                    filters: payload.dashboardFilters?.dimensions,
                } satisfies CreateSchedulerAndTargets & {
                    dashboardUuid: string;
                    customViewportWidth?: number;
                    selectedTabs: string[] | null;
                    filters?: DashboardFilterRule[];
                };

                const page = await this.getNotificationPageData(
                    scheduler,
                    jobId,
                    false,
                    undefined,
                    {
                        dashboardFilters: payload.dashboardFilters,
                        dateZoomGranularity: payload.dateZoomGranularity,
                    },
                );

                if (payload.format === SchedulerFormat.IMAGE) {
                    if (!page.imageUrl) {
                        throw new UnexpectedServerError(
                            'Dashboard image export failed',
                        );
                    }

                    return {
                        url: page.imageUrl,
                        fileType: payload.format,
                        numFailures: page.failures?.length ?? 0,
                    };
                }

                if (
                    payload.format === SchedulerFormat.CSV ||
                    payload.format === SchedulerFormat.XLSX
                ) {
                    if (!page.csvUrls) {
                        throw new UnexpectedServerError(
                            'Dashboard data export failed',
                        );
                    }

                    const shouldCreateWorkbook =
                        payload.format === SchedulerFormat.XLSX &&
                        isSchedulerCsvOptions(payload.options) &&
                        payload.options.xlsxFileLayout === 'workbook';

                    if (shouldCreateWorkbook) {
                        const workbookUrl = page.csvUrls[0]?.path;
                        if (!workbookUrl) {
                            throw new UnexpectedServerError(
                                'Dashboard workbook export failed',
                            );
                        }

                        return {
                            url: workbookUrl,
                            fileType: DownloadFileType.XLSX,
                            numFailures: page.failures?.length ?? 0,
                        };
                    }

                    const url = await this.createZipDownloadUrl({
                        files: page.csvUrls.map((file) => ({
                            entryNameBase: file.filename,
                            localPath: file.localPath,
                        })),
                        fileType: payload.format,
                        zipNameBase: page.details.name,
                        organizationUuid: payload.organizationUuid,
                        projectUuid: payload.projectUuid,
                        createdByUserUuid: payload.userUuid,
                    });

                    return {
                        url,
                        fileType: 'zip',
                        numFailures: page.failures?.length ?? 0,
                    };
                }

                return assertUnreachable(
                    payload.format,
                    `Format ${payload.format} is not supported for export`,
                );
            },
        );
    }

    protected async exportCsvDashboard(
        jobId: string,
        scheduledTime: Date,
        payload: ExportCsvDashboardPayload,
    ) {
        setSchedulerJobLogContext({
            jobId,
        });
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.EXPORT_CSV_DASHBOARD,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                if (!this.fileStorageClient.isEnabled()) {
                    throw new MissingConfigError(
                        'Cloud storage is not enabled',
                    );
                }

                const {
                    dashboardUuid,
                    dashboardFilters,
                    dateZoomGranularity,
                    selectedTabs,
                    userUuid,
                    organizationUuid,
                    projectUuid,
                } = payload;

                const account =
                    await this.userService.getAccountByUserUuid(userUuid);
                const dashboard =
                    await this.schedulerService.dashboardModel.getByIdOrSlug(
                        dashboardUuid,
                    );

                const baseAnalyticsProperties: DownloadCsv['properties'] = {
                    jobId,
                    userId: userUuid,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    fileType: SchedulerFormat.CSV,
                    values: 'formatted',
                    limit: 'results',
                    storage: 's3',
                    context: 'dashboard csv zip',
                };

                this.analytics.trackAccount(account, {
                    event: 'download_results.started',
                    userId: account.user.id,
                    properties: baseAnalyticsProperties,
                });

                const dateZoom = dateZoomGranularity
                    ? { granularity: dateZoomGranularity }
                    : undefined;

                const limit = pLimit(5);

                const isInSelectedTab = (tile: { tabUuid?: string | null }) =>
                    isTileInSelectedTabs(tile, selectedTabs);

                const chartTilePromises = dashboard.tiles
                    .filter(isDashboardChartTileType)
                    .filter((tile) => tile.properties.savedChartUuid)
                    .filter(isInSelectedTab)
                    .map((tile) =>
                        limit(() =>
                            this.exportCsvForChartTile({
                                account,
                                projectUuid,
                                dashboardUuid,
                                dashboardFilters,
                                dateZoom,
                                chartUuid: tile.properties.savedChartUuid!,
                                tileUuid: tile.uuid,
                            }),
                        ),
                    );

                const sqlChartTilePromises = dashboard.tiles
                    .filter(isDashboardSqlChartTile)
                    .filter((tile) => !!tile.properties.savedSqlUuid)
                    .filter(isInSelectedTab)
                    .map((tile) =>
                        limit(() =>
                            this.exportCsvForSqlChartTile({
                                account,
                                projectUuid,
                                dashboardUuid,
                                dashboardFilters,
                                chartUuid: tile.properties.savedSqlUuid!,
                                tileUuid: tile.uuid,
                            }),
                        ),
                    );

                const results = await Promise.allSettled([
                    ...chartTilePromises,
                    ...sqlChartTilePromises,
                ]);

                const successfulResults = results.filter(
                    (
                        result,
                    ): result is PromiseFulfilledResult<{
                        chartName: string;
                        filename: string;
                        fileUrl: string;
                        s3FileUrl?: string;
                    }> => result.status === 'fulfilled',
                );

                const failedCount = results.filter(
                    (r) => r.status === 'rejected',
                ).length;
                if (failedCount > 0) {
                    Logger.warn(
                        `Dashboard CSV export completed with ${failedCount} failed chart(s) out of ${results.length} total`,
                    );
                }

                if (successfulResults.length === 0) {
                    throw new UnexpectedServerError(
                        'All chart queries failed — no CSVs to export',
                    );
                }

                const url = await this.createZipDownloadUrl({
                    files: successfulResults.map((r) => ({
                        entryNameBase: r.value.chartName,
                        localPath: r.value.s3FileUrl ?? r.value.fileUrl,
                        chartName: r.value.chartName,
                    })),
                    fileType: SchedulerFormat.CSV,
                    zipNameBase: dashboard.name,
                    organizationUuid,
                    projectUuid,
                    createdByUserUuid: userUuid,
                    logContext: `dashboard ${dashboardUuid}`,
                });

                this.analytics.trackAccount(account, {
                    event: 'download_results.completed',
                    userId: account.user.id,
                    properties: {
                        ...baseAnalyticsProperties,
                        numCharts: successfulResults.length,
                        numFailures: failedCount,
                    },
                });

                return { url, numFailures: failedCount };
            },
        );
    }

    private async exportCsvForChartTile({
        account,
        projectUuid,
        dashboardUuid,
        dashboardFilters,
        dateZoom,
        chartUuid,
        tileUuid,
    }: {
        account: AccountType;
        projectUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        dateZoom: DateZoom | undefined;
        chartUuid: string;
        tileUuid: string;
    }): Promise<{
        chartName: string;
        filename: string;
        fileUrl: string;
        s3FileUrl?: string;
    }> {
        const chart =
            await this.schedulerService.savedChartModel.get(chartUuid);
        const downloadPivotConfig = getDownloadPivotConfig(chart);
        const shouldPivotResults = !!downloadPivotConfig;
        const query =
            await this.asyncQueryService.executeAsyncDashboardChartQuery({
                account,
                projectUuid,
                tileUuid,
                chartUuid,
                invalidateCache: true,
                context: QueryExecutionContext.CSV,
                dashboardUuid,
                dashboardFilters,
                dashboardSorts: [],
                dateZoom,
                limit: getSchedulerCsvLimit({
                    formatted: true,
                    limit: 'table',
                }),
                pivotResults: shouldPivotResults,
            });
        const downloadResult =
            await this.asyncQueryService.downloadSyncQueryResults(
                {
                    account,
                    projectUuid,
                    queryUuid: query.queryUuid,
                    type: DownloadFileType.CSV,
                    onlyRaw: false,
                    customLabels: getCustomLabelsFromTableConfig(
                        chart.chartConfig.config,
                    ),
                    hiddenFields: getHiddenTableFields(chart.chartConfig),
                    pivotConfig: downloadPivotConfig,
                    columnOrder: chart.tableConfig.columnOrder,
                },
                SCHEDULER_POLLING_OPTIONS,
            );
        return {
            chartName: chart.name,
            filename: chart.name,
            fileUrl: downloadResult.fileUrl,
            s3FileUrl: downloadResult.s3FileUrl,
        };
    }

    private async exportCsvForSqlChartTile({
        account,
        projectUuid,
        dashboardUuid,
        dashboardFilters,
        chartUuid,
        tileUuid,
    }: {
        account: AccountType;
        projectUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        chartUuid: string;
        tileUuid: string;
    }): Promise<{
        chartName: string;
        filename: string;
        fileUrl: string;
        s3FileUrl?: string;
    }> {
        const query =
            await this.asyncQueryService.executeAsyncDashboardSqlChartQuery({
                account,
                projectUuid,
                savedSqlUuid: chartUuid,
                invalidateCache: true,
                context: QueryExecutionContext.CSV,
                dashboardUuid,
                tileUuid,
                dashboardFilters,
                dashboardSorts: [],
                limit:
                    getSchedulerCsvLimit({
                        formatted: true,
                        limit: 'table',
                    }) ?? MAX_SAFE_INTEGER,
            });
        const chart = await this.asyncQueryService.savedSqlModel.getByUuid(
            chartUuid,
            {
                projectUuid,
            },
        );
        const downloadResult =
            await this.asyncQueryService.downloadSyncQueryResults(
                {
                    account,
                    projectUuid,
                    queryUuid: query.queryUuid,
                    type: DownloadFileType.CSV,
                    onlyRaw: false,
                    customLabels: getCustomLabelsFromVizTableConfig(
                        isVizTableConfig(chart.config)
                            ? chart.config
                            : undefined,
                    ),
                    hiddenFields: getHiddenFieldsFromVizTableConfig(
                        isVizTableConfig(chart.config)
                            ? chart.config
                            : undefined,
                    ),
                    columnOrder: getColumnOrderFromVizTableConfig(
                        isVizTableConfig(chart.config)
                            ? chart.config
                            : undefined,
                    ),
                },
                SCHEDULER_POLLING_OPTIONS,
            );
        return {
            chartName: chart.name,
            filename: chart.name,
            fileUrl: downloadResult.fileUrl,
            s3FileUrl: downloadResult.s3FileUrl,
        };
    }

    protected async replaceCustomFields(
        jobId: string,
        scheduledTime: Date,
        payload: ReplaceCustomFieldsPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.REPLACE_CUSTOM_FIELDS,
                jobId,
                scheduledTime,
                details: {
                    userUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.userUuid,
                },
            },
            async (): Promise<{
                replaceableCustomFields: ReplaceableCustomFields;
                replaceFields: ReplaceCustomFields;
                updatedCharts: Array<Pick<SavedChartDAO, 'uuid' | 'name'>>;
            }> => {
                const replaceableCustomFields =
                    await this.projectService.findReplaceableCustomFields(
                        payload,
                    );
                const replaceFields =
                    convertReplaceableFieldMatchMapToReplaceCustomFields(
                        replaceableCustomFields,
                    );
                const updatedCharts =
                    await this.projectService.replaceCustomFields({
                        userUuid: payload.userUuid,
                        projectUuid: payload.projectUuid,
                        organizationUuid: payload.organizationUuid,
                        replaceFields,
                        skipChartsUpdatedAfter: scheduledTime,
                    });
                return {
                    replaceableCustomFields,
                    replaceFields,
                    updatedCharts,
                };
            },
        );
    }

    protected async renameResources(
        jobId: string,
        scheduledTime: Date,
        payload: RenameResourcesPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.RENAME_RESOURCES,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const results =
                    await this.renameService.runScheduledRenameResources(
                        payload,
                    );
                return { results };
            },
        );
    }

    protected async downloadAsyncQueryResults(
        jobId: string,
        scheduledTime: Date,
        payload: DownloadAsyncQueryResultsPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const account = await this.userService.getAccountByUserUuid(
                    payload.userUuid,
                );
                return this.asyncQueryService.download({
                    account,
                    ...payload,
                });
            },
        );
    }

    // ==================== Batch Notification Methods ====================
    // These methods handle multiple targets of the same type in a single job,
    // providing aggregated result reporting for better failure notification handling.
    private async sendDeliveryFailureNotification(
        scheduler: SchedulerAndTargets,
        batchResult: BatchDeliveryResult,
        projectUuid: string | undefined,
    ): Promise<void> {
        if (batchResult.failed === 0) return; // No failures, nothing to send

        try {
            const user = await this.userService.getSessionByUserUuid(
                scheduler.createdBy,
            );
            if (!user.email) {
                Logger.warn(
                    `Cannot send failure notification - scheduler creator has no email`,
                );
                return;
            }

            const schedulerUrlParam = setUuidParam(
                'scheduler_uuid',
                scheduler.schedulerUuid,
            );

            const resourceUuid =
                scheduler.savedChartUuid || scheduler.dashboardUuid;
            const resourceType = scheduler.savedChartUuid
                ? 'saved'
                : 'dashboards';

            let schedulerUrl = this.lightdashConfig.siteUrl;
            if (resourceUuid && projectUuid) {
                schedulerUrl = `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/${resourceType}/${resourceUuid}/view?${schedulerUrlParam}`;
            }

            const failedTargets = batchResult.results
                .filter((r) => !r.success)
                .map((r) => ({ target: r.target, error: r.error }));

            await this.emailClient.sendScheduledDeliveryTargetFailureEmail(
                user.email,
                scheduler.name,
                schedulerUrl,
                batchResult.type,
                failedTargets,
                batchResult.total,
            );

            Logger.info(
                `Sent delivery failure notification for scheduler ${scheduler.schedulerUuid} to ${user.email}`,
            );
        } catch (emailError) {
            Logger.error(
                `Failed to send delivery failure notification: ${emailError}`,
            );
        }
    }

    protected async sendSlackBatchNotification(
        jobId: string,
        notification: SlackBatchNotificationPayload,
    ): Promise<BatchDeliveryResult> {
        const { schedulerUuid, targets, scheduledTime, scheduler, page } =
            notification;

        const results: DeliveryResult[] = [];

        setSchedulerJobLogContext({
            jobId,
            schedulerUuid,
            schedulerName: scheduler.name,
            savedSqlUuid: scheduler.savedSqlUuid,
        });

        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            userId: notification.userUuid,
            properties: {
                jobId,
                organizationId: notification.organizationUuid,
                projectId: notification.projectUuid,
                schedulerId: schedulerUuid,
                groupId: notification.jobGroup,
                type: 'slack',
                targetCount: targets.length,
                sendNow: false,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        await this.schedulerService.logSchedulerJob({
            task: SCHEDULER_TASKS.SEND_SLACK_BATCH_NOTIFICATION,
            schedulerUuid,
            jobId,
            jobGroup: notification.jobGroup,
            scheduledTime,
            targetType: 'slack',
            status: SchedulerJobStatus.STARTED,
            details: {
                projectUuid: notification.projectUuid,
                organizationUuid: notification.organizationUuid,
                createdByUserUuid: notification.userUuid,
                targetCount: targets.length,
            },
        });

        // Process all targets in parallel, catching errors per-target
        const settledResults = await Promise.allSettled(
            targets.map(async (target) => {
                const singleTargetPayload: SlackNotificationPayload = {
                    ...notification,
                    schedulerSlackTargetUuid: target.schedulerSlackTargetUuid,
                    channel: target.channel,
                };
                await this.sendSlackNotification(jobId, singleTargetPayload);
                return target;
            }),
        );

        // Collect results from settled promises
        settledResults.forEach((result, index) => {
            const target = targets[index];
            if (result.status === 'fulfilled') {
                results.push({
                    target: target.channel,
                    targetUuid: target.schedulerSlackTargetUuid,
                    success: true,
                });
            } else {
                results.push({
                    target: target.channel,
                    targetUuid: target.schedulerSlackTargetUuid,
                    success: false,
                    error: getErrorMessage(result.reason),
                });
            }
        });

        // Determine overall status
        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        const batchResult: BatchDeliveryResult = {
            type: 'slack',
            total: targets.length,
            succeeded,
            failed,
            results,
        };

        if (failed === 0) {
            // All succeeded
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'slack',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'slack',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    batchResult,
                },
            });
        } else if (succeeded === 0) {
            // All failed - total failure
            const translatedByCode = new Map<string, string>();
            for (const r of settledResults) {
                if (r.status === 'rejected') {
                    const t = translateSlackError(r.reason);
                    if (t) translatedByCode.set(t.slackErrorCode, t.error);
                }
            }
            const batchErrorMessage =
                translatedByCode.size > 0
                    ? `All Slack deliveries failed: ${[
                          ...translatedByCode.values(),
                      ].join(' ')}`
                    : 'All Slack deliveries failed';
            const slackErrorCodes = [...translatedByCode.keys()];
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'slack',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                    error: batchErrorMessage,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'slack',
                status: SchedulerJobStatus.ERROR,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    error: batchErrorMessage,
                    ...(slackErrorCodes.length > 0 && { slackErrorCodes }),
                    batchResult,
                },
            });
            await this.sendDeliveryFailureNotification(
                scheduler,
                batchResult,
                notification.projectUuid,
            );
        } else {
            // Partial failure - some succeeded, some failed
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'slack',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    partialFailure: true,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'slack',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    partialFailure: true,
                    batchResult,
                },
            });
            await this.sendDeliveryFailureNotification(
                scheduler,
                batchResult,
                notification.projectUuid,
            );
        }

        return batchResult;
    }

    protected async sendEmailBatchNotification(
        jobId: string,
        notification: EmailBatchNotificationPayload,
    ): Promise<BatchDeliveryResult> {
        const { schedulerUuid, targets, scheduledTime, scheduler, page } =
            notification;

        const results: DeliveryResult[] = [];

        setSchedulerJobLogContext({
            jobId,
            schedulerUuid,
            schedulerName: scheduler.name,
            savedSqlUuid: scheduler.savedSqlUuid,
        });

        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            userId: notification.userUuid,
            properties: {
                jobId,
                organizationId: notification.organizationUuid,
                projectId: notification.projectUuid,
                schedulerId: schedulerUuid,
                groupId: notification.jobGroup,
                type: 'email',
                targetCount: targets.length,
                sendNow: false,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        await this.schedulerService.logSchedulerJob({
            task: SCHEDULER_TASKS.SEND_EMAIL_BATCH_NOTIFICATION,
            schedulerUuid,
            jobId,
            jobGroup: notification.jobGroup,
            scheduledTime,
            targetType: 'email',
            status: SchedulerJobStatus.STARTED,
            details: {
                projectUuid: notification.projectUuid,
                organizationUuid: notification.organizationUuid,
                createdByUserUuid: notification.userUuid,
                targetCount: targets.length,
            },
        });

        // Process all targets in parallel, catching errors per-target
        const settledResults = await Promise.allSettled(
            targets.map(async (target) => {
                const singleTargetPayload: EmailNotificationPayload = {
                    ...notification,
                    schedulerEmailTargetUuid: target.schedulerEmailTargetUuid,
                    recipient: target.recipient,
                };
                await this.sendEmailNotification(jobId, singleTargetPayload);
                return target;
            }),
        );

        // Collect results from settled promises
        settledResults.forEach((result, index) => {
            const target = targets[index];
            if (result.status === 'fulfilled') {
                results.push({
                    target: target.recipient,
                    targetUuid: target.schedulerEmailTargetUuid,
                    success: true,
                });
            } else {
                results.push({
                    target: target.recipient,
                    targetUuid: target.schedulerEmailTargetUuid,
                    success: false,
                    error: getErrorMessage(result.reason),
                });
            }
        });

        // Determine overall status
        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        const batchResult: BatchDeliveryResult = {
            type: 'email',
            total: targets.length,
            succeeded,
            failed,
            results,
        };

        if (failed === 0) {
            // All succeeded
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'email',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'email',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    batchResult,
                },
            });
        } else if (succeeded === 0) {
            // All failed - total failure
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'email',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                    error: 'All email deliveries failed',
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'email',
                status: SchedulerJobStatus.ERROR,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    error: 'All email deliveries failed',
                    batchResult,
                },
            });
            await this.sendDeliveryFailureNotification(
                scheduler,
                batchResult,
                notification.projectUuid,
            );
            throw new Error(
                `All email deliveries failed: ${results
                    .map((r) => r.error)
                    .join(', ')}`,
            );
        } else {
            // Partial failure - some succeeded, some failed
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'email',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    partialFailure: true,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'email',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    partialFailure: true,
                    batchResult,
                },
            });
            await this.sendDeliveryFailureNotification(
                scheduler,
                batchResult,
                notification.projectUuid,
            );
        }

        return batchResult;
    }

    protected async sendMsTeamsBatchNotification(
        jobId: string,
        notification: MsTeamsBatchNotificationPayload,
    ): Promise<BatchDeliveryResult> {
        const { schedulerUuid, targets, scheduledTime, scheduler, page } =
            notification;

        const results: DeliveryResult[] = [];

        setSchedulerJobLogContext({
            jobId,
            schedulerUuid,
            schedulerName: scheduler.name,
            savedSqlUuid: scheduler.savedSqlUuid,
        });

        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            userId: notification.userUuid,
            properties: {
                jobId,
                organizationId: notification.organizationUuid,
                projectId: notification.projectUuid,
                schedulerId: schedulerUuid,
                groupId: notification.jobGroup,
                type: 'msteams',
                targetCount: targets.length,
                sendNow: false,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        await this.schedulerService.logSchedulerJob({
            task: SCHEDULER_TASKS.SEND_MSTEAMS_BATCH_NOTIFICATION,
            schedulerUuid,
            jobId,
            jobGroup: notification.jobGroup,
            scheduledTime,
            targetType: 'msteams',
            status: SchedulerJobStatus.STARTED,
            details: {
                projectUuid: notification.projectUuid,
                organizationUuid: notification.organizationUuid,
                createdByUserUuid: notification.userUuid,
                targetCount: targets.length,
            },
        });

        // Process all targets in parallel, catching errors per-target
        const settledResults = await Promise.allSettled(
            targets.map(async (target) => {
                const singleTargetPayload: MsTeamsNotificationPayload = {
                    ...notification,
                    schedulerMsTeamsTargetUuid:
                        target.schedulerMsTeamsTargetUuid,
                    webhook: target.webhook,
                };
                await this.sendMsTeamsNotification(jobId, singleTargetPayload);
                return target;
            }),
        );

        // Collect results from settled promises
        settledResults.forEach((result, index) => {
            const target = targets[index];
            if (result.status === 'fulfilled') {
                results.push({
                    target: target.webhook,
                    targetUuid: target.schedulerMsTeamsTargetUuid,
                    success: true,
                });
            } else {
                results.push({
                    target: target.webhook,
                    targetUuid: target.schedulerMsTeamsTargetUuid,
                    success: false,
                    error: getErrorMessage(result.reason),
                });
            }
        });

        // Determine overall status
        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        const batchResult: BatchDeliveryResult = {
            type: 'msteams',
            total: targets.length,
            succeeded,
            failed,
            results,
        };

        if (failed === 0) {
            // All succeeded
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'msteams',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'msteams',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    batchResult,
                },
            });
        } else if (succeeded === 0) {
            // All failed - total failure
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'msteams',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                    error: 'All MS Teams deliveries failed',
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'msteams',
                status: SchedulerJobStatus.ERROR,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    error: 'All MS Teams deliveries failed',
                    batchResult,
                },
            });
            await this.sendDeliveryFailureNotification(
                scheduler,
                batchResult,
                notification.projectUuid,
            );
        } else {
            // Partial failure - some succeeded, some failed
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'msteams',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    partialFailure: true,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'msteams',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    partialFailure: true,
                    batchResult,
                },
            });
            await this.sendDeliveryFailureNotification(
                scheduler,
                batchResult,
                notification.projectUuid,
            );
        }

        return batchResult;
    }

    protected async sendGoogleChatNotification(
        jobId: string,
        notification: GoogleChatNotificationPayload,
    ) {
        const {
            schedulerUuid,
            schedulerGoogleChatTargetUuid,
            googleChatWebhook,
            scheduledTime,
            scheduler,
        } = notification;
        setSchedulerJobLogContext({
            jobId,
            schedulerUuid,
            schedulerName: scheduler.name,
            savedSqlUuid: scheduler.savedSqlUuid,
        });
        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            userId: notification.userUuid,
            properties: {
                jobId,
                organizationId: notification.organizationUuid,
                projectId: notification.projectUuid,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerGoogleChatTargetUuid,
                groupId: notification.jobGroup,
                type: 'googlechat',
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        try {
            const {
                format,
                savedChartUuid,
                dashboardUuid,
                name,
                cron,
                timezone,
                thresholds,
                includeLinks,
            } = scheduler;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_GOOGLE_CHAT_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: googleChatWebhook,
                targetType: 'googlechat',
                status: SchedulerJobStatus.STARTED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            // Backwards compatibility for old scheduled deliveries
            const googleChatExpiration =
                await this.getDeliveryExpirationSeconds(
                    notification.organizationUuid,
                    'googlechat',
                );
            const notificationPageData =
                notification.page ??
                (await this.getNotificationPageData(
                    scheduler,
                    jobId,
                    true, // maxAttempts 1 — always the final attempt
                    googleChatExpiration,
                ));

            const {
                url,
                details,
                pageType,
                organizationUuid,
                imageUrl,
                csvUrl,
                csvUrls,
                pdfFile,
                failures,
            } = notificationPageData;

            const schedulerType =
                thresholds !== undefined && thresholds.length > 0
                    ? 'data alert'
                    : 'scheduled delivery';
            const schedulerFooter = includeLinks
                ? `<a href="${url}">${schedulerType}</a>`
                : schedulerType;

            const defaultSchedulerTimezone =
                await this.schedulerService.getSchedulerDefaultTimezone(
                    schedulerUuid,
                );

            const footer = `This is a ${schedulerFooter} ${getHumanReadableCronExpression(
                cron,
                timezone || defaultSchedulerTimezone,
            )} from Lightdash.`;
            const getBlocksArgs = {
                title: name,
                name: details.name,
                description: details.description,
                message: scheduler.message,
                ctaUrl: url,
                footer,
            };

            if (thresholds !== undefined && thresholds.length > 0) {
                // We assume the threshold is possitive , so we don't need to get results here
                if (savedChartUuid) {
                    if (imageUrl)
                        await this.googleChatClient.postImageWithWebhook({
                            webhookUrl: googleChatWebhook,
                            ...getBlocksArgs,
                            image: imageUrl,
                            thresholds,
                        });
                } else {
                    throw new Error('No chart found');
                }
            } else if (format === SchedulerFormat.IMAGE) {
                if (imageUrl)
                    await this.googleChatClient.postImageWithWebhook({
                        webhookUrl: googleChatWebhook,
                        ...getBlocksArgs,
                        image: imageUrl,
                        pdfUrl: pdfFile?.source,
                    });
            } else if (format === SchedulerFormat.PDF) {
                throw new ParameterError(
                    'PDF-only format is not supported for Google Chat webhooks',
                );
            } else if (format === SchedulerFormat.CSV) {
                if (savedChartUuid) {
                    if (csvUrl === undefined) {
                        throw new UnexpectedServerError('Missing CSV URL');
                    }
                    await this.googleChatClient.postCsvWithWebhook({
                        webhookUrl: googleChatWebhook,
                        ...getBlocksArgs,
                        csvUrl,
                    });
                } else if (dashboardUuid) {
                    if (csvUrls === undefined) {
                        throw new UnexpectedServerError('Missing CSV URLS');
                    }
                    await this.googleChatClient.postCsvsWithWebhook({
                        webhookUrl: googleChatWebhook,
                        ...getBlocksArgs,
                        csvUrls,
                        failures,
                    });
                } else {
                    throw new UnexpectedServerError('Not implemented');
                }
            }
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerGoogleChatTargetUuid,
                    groupId: notification.jobGroup,
                    type: 'googlechat',
                    format,
                    ...getSchedulerResourceTypeAndId(scheduler),
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_GOOGLE_CHAT_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                target: googleChatWebhook,
                targetType: 'googlechat',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    error: `${e}`,
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerGoogleChatTargetUuid,
                    groupId: notification.jobGroup,
                    type: 'googlechat',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_GOOGLE_CHAT_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                targetType: 'googlechat',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async sendGoogleChatBatchNotification(
        jobId: string,
        notification: GoogleChatBatchNotificationPayload,
    ): Promise<BatchDeliveryResult> {
        const { schedulerUuid, targets, scheduledTime, scheduler, page } =
            notification;

        const results: DeliveryResult[] = [];

        setSchedulerJobLogContext({
            jobId,
            schedulerUuid,
            schedulerName: scheduler.name,
            savedSqlUuid: scheduler.savedSqlUuid,
        });

        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            userId: notification.userUuid,
            properties: {
                jobId,
                organizationId: notification.organizationUuid,
                projectId: notification.projectUuid,
                schedulerId: schedulerUuid,
                groupId: notification.jobGroup,
                type: 'googlechat',
                targetCount: targets.length,
                sendNow: false,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        await this.schedulerService.logSchedulerJob({
            task: SCHEDULER_TASKS.SEND_GOOGLE_CHAT_BATCH_NOTIFICATION,
            schedulerUuid,
            jobId,
            jobGroup: notification.jobGroup,
            scheduledTime,
            targetType: 'googlechat',
            status: SchedulerJobStatus.STARTED,
            details: {
                projectUuid: notification.projectUuid,
                organizationUuid: notification.organizationUuid,
                createdByUserUuid: notification.userUuid,
                targetCount: targets.length,
            },
        });

        // Process all targets in parallel, catching errors per-target
        const settledResults = await Promise.allSettled(
            targets.map(async (target) => {
                const singleTargetPayload: GoogleChatNotificationPayload = {
                    ...notification,
                    schedulerGoogleChatTargetUuid:
                        target.schedulerGoogleChatTargetUuid,
                    googleChatWebhook: target.googleChatWebhook,
                };
                await this.sendGoogleChatNotification(
                    jobId,
                    singleTargetPayload,
                );
                return target;
            }),
        );

        // Collect results from settled promises
        settledResults.forEach((result, index) => {
            const target = targets[index];
            if (result.status === 'fulfilled') {
                results.push({
                    target: target.googleChatWebhook,
                    targetUuid: target.schedulerGoogleChatTargetUuid,
                    success: true,
                });
            } else {
                results.push({
                    target: target.googleChatWebhook,
                    targetUuid: target.schedulerGoogleChatTargetUuid,
                    success: false,
                    error: getErrorMessage(result.reason),
                });
            }
        });

        // Determine overall status
        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        const batchResult: BatchDeliveryResult = {
            type: 'googlechat',
            total: targets.length,
            succeeded,
            failed,
            results,
        };

        if (failed === 0) {
            // All succeeded
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'googlechat',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_GOOGLE_CHAT_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'googlechat',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    batchResult,
                },
            });
        } else if (succeeded === 0) {
            // All failed - total failure
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'googlechat',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                    error: 'All Google Chat deliveries failed',
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_GOOGLE_CHAT_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'googlechat',
                status: SchedulerJobStatus.ERROR,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    error: 'All Google Chat deliveries failed',
                    batchResult,
                },
            });
            await this.sendDeliveryFailureNotification(
                scheduler,
                batchResult,
                notification.projectUuid,
            );
        } else {
            // Partial failure - some succeeded, some failed
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                userId: notification.userUuid,
                properties: {
                    jobId,
                    organizationId: notification.organizationUuid,
                    projectId: notification.projectUuid,
                    schedulerId: schedulerUuid,
                    groupId: notification.jobGroup,
                    type: 'googlechat',
                    targetCount: targets.length,
                    succeeded,
                    failed,
                    partialFailure: true,
                    sendNow: false,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_GOOGLE_CHAT_BATCH_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'googlechat',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                    partialFailure: true,
                    batchResult,
                },
            });
            await this.sendDeliveryFailureNotification(
                scheduler,
                batchResult,
                notification.projectUuid,
            );
        }

        return batchResult;
    }

    protected async syncSlackChannels(
        jobId: string,
        payload: SyncSlackChannelsPayload,
    ) {
        const { organizationUuid } = payload;

        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.SYNC_SLACK_CHANNELS,
                jobId,
                scheduledTime: new Date(),
                details: {
                    organizationUuid,
                },
            },
            async () => this.slackClient.syncChannelsToCache(organizationUuid),
        );
    }
}
