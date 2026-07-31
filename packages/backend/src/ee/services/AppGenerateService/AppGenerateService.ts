import {
    CopyObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
    S3ServiceException,
    type ObjectIdentifier,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    APP_VERSION_CANCELLED_BY_USER,
    assertEmbeddedAuth,
    assertUnreachable,
    checkThemeLimits,
    DATA_APP_CLAUDE_MODELS,
    DATA_APP_VIZ_TEMPLATE,
    dataAppVizJsonSchema,
    dataAppVizSchema,
    DEFAULT_DATA_APP_CLAUDE_MODEL,
    extractLockfilePackages,
    FeatureFlags,
    FilterOperator,
    ForbiddenError,
    formatPromptWithClarifications,
    getEffectiveFieldAiHints,
    getErrorMessage,
    getVisibleDataAppClaudeModels,
    isDashboardChartTileType,
    isExploreError,
    isValidDataAppSlug,
    MAX_APP_FILES_PER_VERSION,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    resolveDefaultVisibleDataAppClaudeModel,
    sanitizeAppPackageJsonScripts,
    themeLimitMessage,
    TooManyRequestsError,
    validateDataAppCode,
    validateDataAppDependencies,
    type AnonymousAccount,
    type ApiOrganizationDesign,
    type AppBuildFromSourceJobPayload,
    type AppChartReference,
    type AppClarification,
    type AppDashboardReference,
    type AppExternalConnectionReference,
    type AppGeneratePipelineJobPayload,
    type AppVersionChartResource,
    type AppVersionDependencies,
    type AppVersionDependencyEntry,
    type AppVersionExternalConnectionResource,
    type AppVersionFileResource,
    type AppVersionResources,
    type AppVersionStatusHistoryEntry,
    type AppVersionStatusHistoryEntryKind,
    type ChartConfig,
    type ChartReference,
    type ChartSampleData,
    type CompiledExploreJoin,
    type CompiledTable,
    type DashboardBlueprint,
    type DataAppActivityEvent,
    type DataAppActivityFilters,
    type DataAppClaudeModel,
    type DataAppCode,
    type DataAppCodeDownload,
    type DataAppCodeFile,
    type DataAppContext,
    type DataAppDependencies,
    type DataAppManifestExternalConnection,
    type DataAppTemplate,
    type DataAppViz,
    type DataAppVizSchema,
    type EmbedProjectApp,
    type Explore,
    type ExternalConnectionMethod,
    type ExternalConnectionSample,
    type ImportAppCodeRequestBody,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type LightdashProjectParameter,
    type MetricQuery,
    type ModelRequiredFilterRule,
    type PromoteAppAction,
    type PromoteAppDiff,
    type SavedChart,
    type SessionUser,
    type TogglePinnedItemInfo,
    type UpgradeAppRequestBody,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { Knex } from 'knex';
import isEqual from 'lodash/isEqual';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { PassThrough, Readable } from 'node:stream';
import { extract, pack as tarPack, type Headers } from 'tar-stream';
import { validate as isValidUuid, v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
    type AiKeyManagement,
} from '../../../analytics/aiUsage';
import {
    LightdashAnalytics,
    type DataAppUploadIdentitySource,
    type DataAppUploadRejectedEvent,
} from '../../../analytics/LightdashAnalytics';
import { fromSession } from '../../../auth/account';
import { resolveS3Credentials } from '../../../clients/Aws/S3BaseClient';
import { LightdashConfig } from '../../../config/parseConfig';
import {
    APP_VERSION_STAGE_ORDER,
    APP_VERSION_TERMINAL_STATUSES,
    isAppVersionInProgress,
    type AppVersionStatus,
    type DbApp,
    type DbAppActivityRow,
    type DbAppVersion,
} from '../../../database/entities/apps';
import { AnalyticsModel } from '../../../models/AnalyticsModel';
import { AppModel } from '../../../models/AppModel';
import { CatalogModel } from '../../../models/CatalogModel/CatalogModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationDesignModel } from '../../../models/OrganizationDesignModel';
import { PinnedListModel } from '../../../models/PinnedListModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { ProjectParametersModel } from '../../../models/ProjectParametersModel';
import { SpaceModel } from '../../../models/SpaceModel';
import { mintPreviewToken } from '../../../routers/appPreviewToken';
import { BaseService } from '../../../services/BaseService';
import type { DashboardService } from '../../../services/DashboardService/DashboardService';
import type { ProjectService } from '../../../services/ProjectService/ProjectService';
import type { PromoteService } from '../../../services/PromoteService/PromoteService';
import type { SavedChartService } from '../../../services/SavedChartsService/SavedChartService';
import type { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import {
    getOtelTraceHeaders,
    runWithOtelSpanContext,
} from '../../../tracing/tracing';
import { type ExternalConnectionModel } from '../../models/ExternalConnectionModel';
import type { SandboxRegistryModel } from '../../models/SandboxRegistryModel';
import type { CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { getModel, resolveKeyManagement } from '../ai/models';
import {
    OrgAiCopilotConfigResolver,
    type CopilotConfig,
    type ResolvedCopilotConfig,
} from '../ai/OrgAiCopilotConfigResolver';
import {
    getAiCallTelemetry,
    getLanguageModelAttribution,
} from '../ai/utils/aiCallTelemetry';
import {
    createSandboxManager,
    S3SnapshotStore,
    SandboxCommandError,
    SandboxManager,
    type AzureSandboxesConfig,
    type PersistentWorkspace,
    type SandboxHandle,
    type SandboxSpec,
} from '../SandboxRuntime';
import { assertCanViewApp as assertUserCanViewApp } from './appAuthz';
import {
    buildManifest,
    contentTypeForPath,
    s3KeyToRelPath,
    versionPrefix,
} from './appCode';
import { contextFile, promptHistoryToMarkdown } from './appContext';
import {
    CLARIFY_APP_SYSTEM_PROMPT,
    CLARIFY_VIZ_SYSTEM_PROMPT,
} from './clarifierPrompts';
import {
    classifyClaudeCliFailure,
    ClaudeGenerationError,
} from './claudeCliFailure';
import {
    buildClaudeCodeEnv,
    claudeCodeAllowedHosts,
    describeClaudeCodeEnv,
} from './claudeCodeEnv';
import {
    buildClaudeCodeOtelEnv,
    claudeCodeOtelAllowedHosts,
} from './claudeCodeOtelEnv';
import {
    addClaudeGenerationAttempt,
    addClaudeUsage,
    ClaudeStreamProcessor,
    ZERO_CLAUDE_GENERATION_TELEMETRY,
    ZERO_CLAUDE_USAGE,
    type ClaudeGenerationTelemetry,
    type ClaudeGenerationUsage,
} from './ClaudeStreamProcessor';
import {
    buildDashboardBlueprint,
    DASHBOARD_BLUEPRINT_PATH,
    dashboardBlueprintPromptBlock,
    describeDashboardBlueprint,
} from './dashboardBlueprint';
import {
    assertDependenciesHaveNoKnownMalware,
    assertDependenciesMeetMinReleaseAge,
} from './dependencyGuards';
import {
    copyDesignIntoSandbox,
    type DesignSandboxCopyResult,
} from './designSandboxCopy';
import { resolveOtelExportHeaders } from './gcpOtelAuth';
import { readDesignForDownload } from './readDesignForDownload';
import { readS3ObjectAsBuffer } from './s3Utils';
import {
    buildTemplateBaseline,
    TEMPLATE_SCRIPTS,
} from './templateDependencies';
import { getTemplateInstructions } from './templates';

/**
 * Pure helper: builds a ChartReference from a resolved chart object.
 * Extracted at module scope so it can be unit-tested without spinning up the
 * full async service.
 */
export const buildChartReference = (
    chart: Pick<
        SavedChart,
        'name' | 'tableName' | 'metricQuery' | 'chartConfig'
    > &
        Partial<Pick<SavedChart, 'description' | 'pivotConfig'>>,
    chartUuid: string,
    linked: boolean,
    sampleData: ChartSampleData | null,
): ChartReference => ({
    chartName: chart.name,
    chartDescription: chart.description ?? '',
    exploreName: chart.tableName,
    metricQuery: chart.metricQuery,
    chartConfig: chart.chartConfig,
    pivotConfig: chart.pivotConfig ?? null,
    sampleData,
    chartUuid,
    linked,
});

type AppExternalConnectionDoc = {
    alias: string;
    origin: string;
    instructions: string | null;
    allowedMethods: ExternalConnectionMethod[];
    allowedPathPrefixes: string[];
    samples: ExternalConnectionSample[];
};

type AppGenerateServiceDeps = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    analyticsModel: AnalyticsModel;
    catalogModel: CatalogModel;
    appModel: AppModel;
    featureFlagModel: FeatureFlagModel;
    organizationDesignModel: OrganizationDesignModel;
    pinnedListModel: PinnedListModel;
    projectModel: ProjectModel;
    projectParametersModel: ProjectParametersModel;
    spaceModel: SpaceModel;
    schedulerClient: CommercialSchedulerClient;
    savedChartService: SavedChartService;
    spacePermissionService: SpacePermissionService;
    dashboardService: DashboardService;
    projectService: ProjectService;
    promoteService: PromoteService;
    externalConnectionModel: ExternalConnectionModel;
    sandboxRegistryModel: SandboxRegistryModel;
    orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;
};

type GenerateAppOptions = {
    designUuidInput?: string | null;
    externalConnections?: AppExternalConnectionReference[];
};

type GenerateAppResult = {
    appUuid: string;
    version: number;
};

/**
 * A staged attachment resolved from its S3 object at version-creation /
 * sandbox-write time. ContentType and metadata on the staged object are the
 * source of truth for type and filename — the client only ever sends ids.
 */
type StagedAppFile = {
    fileId: string;
    mimeType: string;
    filename: string;
    isImage: boolean;
    isScreenshot: boolean;
};

type NamedStagedFile = StagedAppFile & { sandboxFilename: string };

/**
 * A compiled table rendered as dbt-style YAML lines. Header (`- name:` through
 * `meta:`) and column blocks stay separate so a model can be composed into one
 * document or split across files without re-parsing.
 */
type RenderedModel = {
    name: string;
    description: string | null;
    joinedTables: string[];
    headerLines: string[];
    columnBlocks: string[][];
    dimensionCount: number;
    metricCount: number;
    requiredFilterCount: number;
    defaultFilterCount: number;
    hasSqlFilter: boolean;
};

/**
 * Model-level filters that apply when this model is queried as an explore.
 * They live on the base table but only take effect for queries against the
 * explore itself, so they're passed explicitly and omitted for join-target
 * models inlined by pass 2 of exploresToRenderedModels.
 */
type RenderedModelFilters = {
    requiredFilters: ModelRequiredFilterRule[];
    sqlFilter: string | null;
};

type ModelFile = {
    filename: string;
    contents: string;
};

type DataAppVersionFailureTelemetry = {
    wasResumed?: boolean;
    claudeProvider?: 'anthropic' | 'bedrock';
    keyManagement?: AiKeyManagement;
    schedulerWaitMs?: number;
    generationUsage?: ClaudeGenerationUsage;
    generationAttemptCount?: number;
    toolCallCount?: number;
    timeToFirstTokenMs?: number | null;
    slowestTurnMs?: number;
    buildFixGenerationMs?: number;
};

type DataAppBuildFixTelemetry = {
    usage: ClaudeGenerationUsage;
    buildMs: number;
    fixAttempts: number;
    fixGenerationMs: number;
};

// Wall-clock heartbeat to bump status_updated_at while the pipeline is
// running, independent of any per-stage progress updates. Must stay well
// under STALE_THRESHOLD (5 minutes) in sweepStaleLocks.
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

// What to snapshot between turns so a destroyed container can `claude
// --continue` from a fresh one: the agent's Claude session (HOME differs by
// runtime user — root on Docker, user on E2B — so both candidates are declared;
// `--ignore-failed-read` skips the absent one) plus the built source tree, so
// resume is one atomic restore. `.claude.json` is a required sibling of
// `.claude` — claude refuses to start without it. node_modules is re-derivable.
const DATA_APP_WORKSPACE: PersistentWorkspace = {
    include: [
        '/root/.claude',
        '/root/.claude.json',
        '/home/user/.claude',
        '/home/user/.claude.json',
        '/app/src',
    ],
    exclude: ['node_modules'],
};
// Kill any in-flight `claude` process before a cancelled sandbox is paused.
// Native-pause backends (E2B) freeze running processes into the snapshot, so
// without this the cancelled generation resumes execution the next time the
// sandbox is resumed. `[c]laude` keeps pkill from matching this command's own
// shell; pkill exits 1 when nothing matched, hence the trailing `true`. The
// prompt file is removed so nothing left in the sandbox can replay the
// cancelled prompt (the next iteration writes a fresh one).
const INTERRUPT_CLAUDE_COMMAND =
    "pkill -TERM -f '[c]laude' 2>/dev/null; sleep 1; " +
    "pkill -KILL -f '[c]laude' 2>/dev/null; rm -f /tmp/prompt.txt 2>/dev/null; true";

// Prepended to the prompt when a version since the last ready one was
// cancelled: the resumed `--continue` session still ends with the cancelled
// instruction (and possibly its partial tool calls), and Claude would
// otherwise treat it as outstanding work to pick back up.
const CANCELLED_PROMPT_NOTICE =
    '[System notice] The user cancelled the previous instruction while you were working on it. ' +
    'Treat that instruction as withdrawn: do not resume, finish, or build on it. ' +
    'The working tree may contain unfinished changes from the cancelled work. ' +
    "Act only on the user's new request below.";

// Maximum number of in-progress app builds allowed per project at one time.
// Prevents trivial sandbox exhaustion via repeated POST /code calls.
const MAX_CONCURRENT_APP_BUILDS_PER_PROJECT = 5;

export class AppGenerateService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly analyticsModel: AnalyticsModel;

    private readonly catalogModel: CatalogModel;

    private readonly appModel: AppModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly organizationDesignModel: OrganizationDesignModel;

    private readonly pinnedListModel: PinnedListModel;

    private readonly projectModel: ProjectModel;

    private readonly projectParametersModel: ProjectParametersModel;

    private readonly spaceModel: SpaceModel;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly savedChartService: SavedChartService;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly dashboardService: DashboardService;

    private readonly projectService: ProjectService;

    private readonly promoteService: PromoteService;

    private readonly externalConnectionModel: ExternalConnectionModel;

    private readonly sandboxRegistryModel: SandboxRegistryModel;

    private readonly orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;

    // Lazily built from config on first use; memoized for the service lifetime.
    private sandboxManager: SandboxManager | undefined;

    constructor({
        lightdashConfig,
        analytics,
        analyticsModel,
        catalogModel,
        appModel,
        featureFlagModel,
        organizationDesignModel,
        pinnedListModel,
        projectModel,
        projectParametersModel,
        spaceModel,
        schedulerClient,
        savedChartService,
        spacePermissionService,
        dashboardService,
        projectService,
        promoteService,
        externalConnectionModel,
        sandboxRegistryModel,
        orgAiCopilotConfigResolver,
    }: AppGenerateServiceDeps) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.analyticsModel = analyticsModel;
        this.catalogModel = catalogModel;
        this.appModel = appModel;
        this.featureFlagModel = featureFlagModel;
        this.organizationDesignModel = organizationDesignModel;
        this.pinnedListModel = pinnedListModel;
        this.projectModel = projectModel;
        this.projectParametersModel = projectParametersModel;
        this.spaceModel = spaceModel;
        this.schedulerClient = schedulerClient;
        this.savedChartService = savedChartService;
        this.spacePermissionService = spacePermissionService;
        this.dashboardService = dashboardService;
        this.projectService = projectService;
        this.promoteService = promoteService;
        this.externalConnectionModel = externalConnectionModel;
        this.sandboxRegistryModel = sandboxRegistryModel;
        this.orgAiCopilotConfigResolver = orgAiCopilotConfigResolver;
    }

    /**
     * Resolve the organization UUID for a project. Used to derive the CASL
     * subject's `organizationUuid` from the resource (the project itself)
     * rather than the user — so cross-org access attempts are denied by
     * CASL instead of relying only on upstream project scoping.
     */
    private async getProjectOrgUuid(projectUuid: string): Promise<string> {
        const summary = await this.projectModel.getSummary(projectUuid);
        return summary.organizationUuid;
    }

    /**
     * Run a CASL check on `DataApp`, throwing `ForbiddenError` if denied.
     * Callers must pass the resource-derived organizationUuid so that the
     * check is a genuine cross-org guard, not a tautology on the user's own
     * org.
     */
    private assertDataAppAbility(
        user: SessionUser,
        action: 'view' | 'create' | 'manage',
        organizationUuid: string,
        projectUuid: string,
        errorMessage: string,
        extraContext: Record<string, unknown> = {},
    ): void {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                action,
                subject('DataApp', {
                    organizationUuid,
                    projectUuid,
                    ...extraContext,
                }),
            )
        ) {
            throw new ForbiddenError(errorMessage);
        }
    }

    /**
     * Adding custom npm dependencies to a data app is a supply-chain
     * capability gated above ordinary data-app management (admins only by
     * default), via the dedicated `manage:DataAppDependency` scope.
     */
    private assertCanManageDataAppDependencies(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string,
    ): void {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('DataAppDependency', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to add custom dependencies to data apps. This requires an admin role.',
            );
        }
    }

    /**
     * Permission check for reading a data app.
     *
     * Apps can live in two modes:
     * - Assigned to a space → the subject carries space access context, so
     *   any user with space access matches `view:DataApp`.
     * - Personal / unassigned → space context is empty, but
     *   `createdByUserUuid` lets the creator match the self rule. Project
     *   admins always match via the project-wide rule.
     */
    private async assertCanViewApp(
        user: SessionUser,
        app: Pick<
            DbApp,
            'project_uuid' | 'space_uuid' | 'created_by_user_uuid'
        > & {
            organization_uuid: string;
        },
    ): Promise<void> {
        await assertUserCanViewApp(
            {
                auditedAbility: this.createAuditedAbility(user),
                getSpaceAccessContext: (userUuid, spaceUuid) =>
                    this.spacePermissionService.getSpaceAccessContext(
                        userUuid,
                        spaceUuid,
                    ),
            },
            user,
            app,
        );
    }

    /**
     * Permission check for editing/deleting/iterating on an existing data app.
     *
     * Mirrors the chart/dashboard pattern: space editors and admins inherit
     * manage via the space context. For personal (spaceless) apps,
     * `createdByUserUuid` lets the creator match the self rule. Project
     * admins always match via the project-wide rule.
     */
    private async assertCanManageApp(
        user: SessionUser,
        app: Pick<
            DbApp,
            'project_uuid' | 'space_uuid' | 'created_by_user_uuid'
        > & {
            organization_uuid: string;
        },
        errorMessage: string,
        extraContext: Record<string, unknown> = {},
    ): Promise<void> {
        const spaceContext = app.space_uuid
            ? await this.spacePermissionService.getSpaceAccessContext(
                  user.userUuid,
                  app.space_uuid,
              )
            : {};
        this.assertDataAppAbility(
            user,
            'manage',
            app.organization_uuid,
            app.project_uuid,
            errorMessage,
            {
                ...spaceContext,
                createdByUserUuid: app.created_by_user_uuid,
                ...extraContext,
            },
        );
    }

    private static getAnthropicApiKey(copilot: CopilotConfig): string {
        const key = copilot.providers.anthropic?.apiKey;
        if (!key) {
            throw new MissingConfigError(
                'Anthropic API key is not configured (ANTHROPIC_API_KEY)',
            );
        }
        return key;
    }

    /**
     * Resolves the env vars passed to the `claude` CLI in the sandbox: the
     * Bedrock block (reusing the copilot's BEDROCK_* config) when configured,
     * otherwise the Anthropic API key. Throws MissingConfigError when neither
     * is set. `copilot` is the org-resolved config (BYO key when the org brings
     * one), so a BYO org runs on its own key rather than the instance key.
     */
    private static getClaudeCodeEnv(
        copilot: CopilotConfig,
    ): Record<string, string> {
        return buildClaudeCodeEnv(copilot, () =>
            AppGenerateService.getAnthropicApiKey(copilot),
        );
    }

    /**
     * Builds the Claude Code OTEL env injected into the sandbox for this build,
     * minting fresh OTLP export auth headers (e.g. a GCP bearer token) at
     * execute/resume time. Telemetry is strictly non-fatal: when it is disabled
     * or header minting fails, returns an empty env so generation proceeds
     * untraced. `traceparent` nests the sandbox spans under the backend's
     * `DataApp.generate` parent.
     */
    private async resolveSandboxOtelEnv(
        appUuid: string,
        traceparent: string | undefined,
    ): Promise<Record<string, string>> {
        const { otel } = this.lightdashConfig.appRuntime;
        if (!otel.enabled) {
            return {};
        }
        try {
            const headers = await resolveOtelExportHeaders(otel.auth);
            return buildClaudeCodeOtelEnv(otel, headers, traceparent);
        } catch (error) {
            this.logger.warn(
                `App ${appUuid}: OTEL tracing disabled for this build — failed to resolve export headers: ${getErrorMessage(
                    error,
                )}`,
            );
            return {};
        }
    }

    /**
     * The sandbox manager over the provider selected by `SANDBOX_PROVIDER`
     * (e2b | docker). Memoized — the feature talks only to the manager for
     * lifecycle (acquire/resume/suspend/destroy via the stable `sandbox_uuid`)
     * and to the returned {@link SandboxHandle} for the data plane.
     * See docs/sandbox-runtime.md.
     */
    private getSandboxManager(): SandboxManager {
        if (!this.sandboxManager) {
            const { sandboxProvider } = this.lightdashConfig.appRuntime;
            this.sandboxManager = createSandboxManager({
                provider: sandboxProvider,
                e2bApiKey: this.lightdashConfig.appRuntime.e2bApiKey,
                dockerImage: this.lightdashConfig.appRuntime.sandboxDockerImage,
                lambdaMicroVm: this.lightdashConfig.appRuntime.lambdaMicroVm,
                azureSandboxes:
                    sandboxProvider === 'azure-sandboxes'
                        ? this.getAzureSandboxesConfig()
                        : null,
                // Object-store snapshots are only for the Docker backend (no
                // native pause); native-pause providers (E2B, Lambda, Azure
                // Sandboxes) never touch S3, so don't construct a client.
                snapshotStore:
                    sandboxProvider === 'docker'
                        ? new S3SnapshotStore({
                              lightdashConfig: this.lightdashConfig,
                          })
                        : null,
                registryModel: this.sandboxRegistryModel,
                logger: this.logger,
            });
        }
        return this.sandboxManager;
    }

    /**
     * Resolve the template/image ref the active provider launches from. E2B
     * composes `name:tag`; Docker uses the local image name.
     */
    private getSandboxTemplateRef(): string {
        const { sandboxProvider, e2bTemplateName, e2bTemplateTag } =
            this.lightdashConfig.appRuntime;
        if (sandboxProvider === 'docker') {
            return this.lightdashConfig.appRuntime.sandboxDockerImage;
        }
        if (sandboxProvider === 'lambda-microvm') {
            const imageArn =
                this.lightdashConfig.appRuntime.lambdaMicroVmDataAppImageArn;
            if (!imageArn) {
                throw new MissingConfigError(
                    'Lambda MicroVM data-app image ARN is not configured (LAMBDA_MICROVM_DATA_APP_IMAGE_ARN)',
                );
            }
            return imageArn;
        }
        if (sandboxProvider === 'azure-sandboxes') {
            const diskImage =
                this.lightdashConfig.appRuntime.azureSandboxesDataAppDiskImage;
            if (!diskImage) {
                throw new MissingConfigError(
                    'Azure data-app sandbox disk image is not configured (AZURE_SANDBOXES_DATA_APP_DISK_IMAGE)',
                );
            }
            return diskImage;
        }
        // E2B treats `name` and `name:default` interchangeably, so an empty
        // tag is fine — it just resolves to the implicit `default` build.
        return e2bTemplateTag
            ? `${e2bTemplateName}:${e2bTemplateTag}`
            : e2bTemplateName;
    }

    /** Assemble the `azure-sandboxes` provider config for the data-app pipeline
     * (the data-app sandbox group + shared subscription/region settings). */
    private getAzureSandboxesConfig(): AzureSandboxesConfig {
        const {
            azureSandboxes,
            azureSandboxesDataAppGroup,
            sandboxIdleTimeoutMs,
        } = this.lightdashConfig.appRuntime;
        if (
            !azureSandboxes.subscriptionId ||
            !azureSandboxes.resourceGroup ||
            !azureSandboxesDataAppGroup
        ) {
            throw new MissingConfigError(
                'Azure Sandboxes is not configured (AZURE_SANDBOXES_SUBSCRIPTION_ID / AZURE_SANDBOXES_RESOURCE_GROUP / AZURE_SANDBOXES_DATA_APP_GROUP)',
            );
        }
        return {
            subscriptionId: azureSandboxes.subscriptionId,
            resourceGroup: azureSandboxes.resourceGroup,
            region: azureSandboxes.region,
            sandboxGroup: azureSandboxesDataAppGroup,
            apiVersion: azureSandboxes.apiVersion,
            tokenScope: azureSandboxes.tokenScope,
            resourceTier: azureSandboxes.resourceTier,
            autoSuspendIdleSeconds: Math.floor(sandboxIdleTimeoutMs / 1000),
        };
    }

    private buildSandboxSpec(
        copilot: CopilotConfig,
        extraEgressHosts: string[] = [],
    ): SandboxSpec {
        return {
            templateRef: this.getSandboxTemplateRef(),
            timeoutMs: 60 * 60 * 1000,
            egress: {
                allow: [
                    ...claudeCodeAllowedHosts(copilot),
                    ...extraEgressHosts,
                    ...claudeCodeOtelAllowedHosts(
                        this.lightdashConfig.appRuntime.otel,
                    ),
                ],
            },
        };
    }

    private getS3Client(): { client: S3Client; bucket: string } {
        const s3Config = this.lightdashConfig.appRuntime.s3;
        if (!s3Config) {
            throw new MissingConfigError(
                'S3 is not configured for app runtime',
            );
        }

        const config: S3ClientConfig = {
            region: s3Config.region,
            endpoint: s3Config.endpoint || undefined,
            forcePathStyle: s3Config.forcePathStyle ?? false,
        };

        const credentials = resolveS3Credentials(s3Config);
        if (credentials) {
            config.credentials = credentials;
        }

        return {
            client: new S3Client(config),
            bucket: s3Config.bucket,
        };
    }

    private async assertDataAppsEnabled(user: SessionUser): Promise<void> {
        const enabled = await this.dataAppsEnabledFor(user);
        if (!enabled) {
            throw new ForbiddenError('Data apps are not enabled');
        }
    }

    async dataAppsEnabledFor(user: SessionUser): Promise<boolean> {
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.EnableDataApps,
        });
        return enabled;
    }

    /**
     * Link the given external connections to the app before its catalog stage,
     * so the generated app can call them via client.externalFetch. A connection
     * from another project is never linked (that would expose its credentialed
     * proxy to a foreign app). Linking is idempotent, so re-sending an
     * already-linked connection is fine.
     */
    private async linkExternalConnections(
        user: SessionUser,
        projectUuid: string,
        appId: string,
        externalConnections: AppExternalConnectionReference[] | undefined,
    ): Promise<AppVersionExternalConnectionResource[]> {
        const resolved = await this.resolveExternalConnectionResources(
            user,
            projectUuid,
            appId,
            externalConnections,
        );
        await this.linkResolvedExternalConnections(appId, resolved);
        return resolved;
    }

    private async resolveExternalConnectionResources(
        user: SessionUser,
        projectUuid: string,
        appId: string,
        externalConnections: AppExternalConnectionReference[] | undefined,
    ): Promise<AppVersionExternalConnectionResource[]> {
        if (!externalConnections || externalConnections.length === 0) return [];
        // Authorize against the connection resource the same way the admin API
        // (ExternalConnectionService.linkToApp) does — generation must not be a
        // weaker door to attaching a credentialed connection to an app.
        const ability = this.createAuditedAbility(user);
        const resolved: AppVersionExternalConnectionResource[] = [];
        for (const conn of externalConnections) {
            // eslint-disable-next-line no-await-in-loop
            const connection = await this.externalConnectionModel.findByUuid(
                conn.externalConnectionUuid,
            );
            if (!connection || connection.projectUuid !== projectUuid) {
                this.logger.warn(
                    `App ${appId}: skipping external connection ${conn.externalConnectionUuid} — not found or not in project ${projectUuid}`,
                );
                // eslint-disable-next-line no-continue
                continue;
            }
            // The alias becomes a sandbox file path (/tmp/external-data/{alias}.json),
            // so reject anything outside the safe charset — mirrors linkToApp.
            if (!/^[a-z0-9_-]+$/i.test(conn.alias) || conn.alias.length > 64) {
                throw new ParameterError(
                    'Alias must contain only letters, numbers, hyphens, and underscores (max 64 chars)',
                );
            }
            if (
                ability.cannot(
                    'manage',
                    subject('ExternalConnection', {
                        organizationUuid: connection.organizationUuid,
                        projectUuid: connection.projectUuid,
                    }),
                )
            ) {
                throw new ForbiddenError(
                    'You do not have permission to link this external connection',
                );
            }
            resolved.push({
                externalConnectionUuid: conn.externalConnectionUuid,
                name: connection.name,
                alias: conn.alias,
            });
        }
        return resolved;
    }

    private async linkResolvedExternalConnections(
        appId: string,
        connections: AppVersionExternalConnectionResource[],
    ): Promise<void> {
        for (const conn of connections) {
            // eslint-disable-next-line no-await-in-loop
            await this.externalConnectionModel.linkToApp(
                appId,
                conn.externalConnectionUuid,
                conn.alias,
            );
        }
    }

    /**
     * Resolves manifest `{alias, connectionSlug}` links against the target
     * project. Invalid aliases and authz failures throw — rejecting the upload
     * before any side effects — while a slug with no matching connection is
     * skipped with a warning the CLI surfaces: the app still uploads and the
     * missing link shows up as an in-app fetch error, not an upload failure.
     */
    private async resolveManifestExternalConnections(
        user: SessionUser,
        projectUuid: string,
        organizationUuid: string,
        links: DataAppManifestExternalConnection[] | undefined,
    ): Promise<{
        resolvedLinks: AppExternalConnectionReference[];
        linkWarnings: string[];
    }> {
        if (!links || links.length === 0) {
            return { resolvedLinks: [], linkWarnings: [] };
        }
        const seenAliases = new Set<string>();
        for (const link of links) {
            // The alias becomes a sandbox file path — same charset rule as
            // linkToApp and the generation pipeline.
            if (!/^[a-z0-9_-]+$/i.test(link.alias) || link.alias.length > 64) {
                throw new ParameterError(
                    `Invalid external connection alias "${link.alias}" in the app manifest: aliases must contain only letters, numbers, hyphens, and underscores (max 64 chars)`,
                );
            }
            if (seenAliases.has(link.alias)) {
                throw new ParameterError(
                    `Duplicate external connection alias "${link.alias}" in the app manifest`,
                );
            }
            seenAliases.add(link.alias);
        }

        const ability = this.createAuditedAbility(user);
        const resolvedLinks: AppExternalConnectionReference[] = [];
        const linkWarnings: string[] = [];
        for (const link of links) {
            // eslint-disable-next-line no-await-in-loop
            const connection = await this.externalConnectionModel.findBySlug(
                projectUuid,
                organizationUuid,
                link.connectionSlug,
            );
            if (!connection) {
                linkWarnings.push(
                    `Skipped linking external connection alias "${link.alias}": no connection with slug "${link.connectionSlug}" exists in the target project. Upload it first ('lightdash upload --external-connections ${link.connectionSlug}') or fix connectionSlug in lightdash-app.yml.`,
                );
                // eslint-disable-next-line no-continue
                continue;
            }
            // Linking attaches a credentialed connection to an app — hold the
            // same bar as the admin API and the generation pipeline.
            if (
                ability.cannot(
                    'manage',
                    subject('ExternalConnection', {
                        organizationUuid: connection.organizationUuid,
                        projectUuid: connection.projectUuid,
                    }),
                )
            ) {
                throw new ForbiddenError(
                    'You do not have permission to link this external connection',
                );
            }
            resolvedLinks.push({
                externalConnectionUuid: connection.externalConnectionUuid,
                alias: link.alias,
            });
        }
        return { resolvedLinks, linkWarnings };
    }

    /**
     * Boolean variant of `assertCanViewApp` — does not throw on denial.
     * Use for filtering lists where unauthorized items should be silently
     * dropped (e.g. omnibar search) rather than surfacing a permission error.
     */
    async canViewApp(
        user: SessionUser,
        app: Pick<
            DbApp,
            'project_uuid' | 'space_uuid' | 'created_by_user_uuid'
        > & {
            organization_uuid: string;
        },
    ): Promise<boolean> {
        const spaceContext = app.space_uuid
            ? await this.spacePermissionService.getSpaceAccessContext(
                  user.userUuid,
                  app.space_uuid,
              )
            : {};
        const auditedAbility = this.createAuditedAbility(user);
        return auditedAbility.can(
            'view',
            subject('DataApp', {
                organizationUuid: app.organization_uuid,
                projectUuid: app.project_uuid,
                ...spaceContext,
                createdByUserUuid: app.created_by_user_uuid,
            }),
        );
    }

    /**
     * Bulk filter for callers that have a list of apps already loaded
     * (e.g. SearchService). Resolves space access contexts in parallel —
     * one `getSpaceAccessContext` call per app with a space.
     */
    async filterAppsUserCanView<
        T extends {
            spaceUuid: string | null;
            createdBy: { userUuid: string } | null;
        },
    >(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string,
        apps: T[],
    ): Promise<T[]> {
        const checks = await Promise.all(
            apps.map((app) =>
                this.canViewApp(user, {
                    organization_uuid: organizationUuid,
                    project_uuid: projectUuid,
                    space_uuid: app.spaceUuid,
                    // A null createdBy can never match the self rule — coerce
                    // to a sentinel that won't equal any real userUuid.
                    created_by_user_uuid: app.createdBy?.userUuid ?? '',
                }),
            ),
        );
        return apps.filter((_, i) => checks[i]);
    }

    /**
     * Deterministic staging path for uploaded files.
     * No file extension — the MIME type is stored as the S3 object's
     * ContentType and the original filename in its metadata.
     */
    private static fileStagingKey(appUuid: string, fileId: string): string {
        return `apps/${appUuid}/uploads/${fileId}`;
    }

    private static appThumbnailKey(appUuid: string): string {
        return `apps/${appUuid}/thumbnail.png`;
    }

    private static mimeToExt(mimeType: string): string {
        const extMap: Record<string, string> = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'application/pdf': 'pdf',
        };
        return extMap[mimeType] ?? 'png';
    }

    private static readonly RASTER_IMAGE_TYPES = [
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/webp',
    ];

    /**
     * Magic-byte signatures for each allowed image MIME type.
     * Checked against the first bytes of the upload stream to ensure
     * the content matches the declared Content-Type.
     */
    private static readonly IMAGE_SIGNATURES: Record<
        string,
        { offset: number; bytes: number[] }[]
    > = {
        'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
        'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
        'image/gif': [
            { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
            { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
        ],
        'image/webp': [
            {
                offset: 0,
                bytes: [0x52, 0x49, 0x46, 0x46], // RIFF
            },
            {
                offset: 8,
                bytes: [0x57, 0x45, 0x42, 0x50], // WEBP
            },
        ],
    };

    private static readonly SIGNATURE_PREFIX_SIZE = 12;

    private static readonly PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46]; // %PDF

    /** Split resolved attachments into the two version-resource arrays. */
    private static toAttachmentResources(stagedFiles: StagedAppFile[]): {
        images: AppVersionResources['images'];
        files: AppVersionFileResource[];
    } {
        return {
            images: stagedFiles
                .filter((f) => f.isImage)
                .map((f) => ({ imageId: f.fileId })),
            files: stagedFiles
                .filter((f) => !f.isImage)
                .map(({ fileId, filename, mimeType }) => ({
                    fileId,
                    filename,
                    mimeType,
                })),
        };
    }

    private static validateFileIds(fileIds: string[]): void {
        if (fileIds.length > MAX_APP_FILES_PER_VERSION) {
            throw new ParameterError(
                `Too many attachments: ${fileIds.length}. Maximum: ${MAX_APP_FILES_PER_VERSION}`,
            );
        }
        for (const id of fileIds) {
            if (!isValidUuid(id)) {
                throw new ParameterError(
                    'Invalid fileId: must be a valid UUID',
                );
            }
        }
    }

    /**
     * MIME types worth preserving as-is on text uploads. Anything else that
     * sniffs as text (unknown extensions arrive as application/octet-stream or
     * vendor types) is normalized to text/plain so downstream consumers never
     * see a binary-looking ContentType on a text object.
     */
    private static isTextLikeMimeType(mimeType: string): boolean {
        if (mimeType.startsWith('text/')) return true;
        if (mimeType.endsWith('+json') || mimeType.endsWith('+xml'))
            return true;
        return [
            'application/json',
            'application/xml',
            'application/yaml',
            'application/x-yaml',
            'application/toml',
            'application/javascript',
            'application/typescript',
            'application/sql',
            'application/x-ndjson',
            'application/x-sh',
            'image/svg+xml',
        ].includes(mimeType);
    }

    /**
     * A file is treated as text when its first bytes contain no NUL and decode
     * as UTF-8. Streaming decode tolerates a multi-byte sequence cut off at
     * the sample boundary. UTF-16 (NUL bytes in ASCII range) is deliberately
     * rejected — the sandbox agent reads files as UTF-8.
     */
    private static sniffsAsText(body: Buffer): boolean {
        const sample = body.subarray(0, 8192);
        if (sample.includes(0)) return false;
        try {
            new TextDecoder('utf-8', { fatal: true }).decode(sample, {
                stream: true,
            });
            return true;
        } catch {
            return false;
        }
    }

    private static matchesSignature(
        body: Buffer,
        signature: { offset: number; bytes: number[] }[],
    ): boolean {
        return signature.every((sig) =>
            sig.bytes.every((byte, i) => body[sig.offset + i] === byte),
        );
    }

    /**
     * Sandbox- and metadata-safe version of a user filename: basename only,
     * conservative character set, bounded length (extension preserved).
     * Returns null when nothing usable remains — callers fall back to a
     * generated name.
     */
    private static sanitizeFilename(filename: string): string | null {
        const base = filename.split(/[/\\]/).pop() ?? '';
        const cleaned = base
            // eslint-disable-next-line no-control-regex
            .replace(/[\x00-\x1f\x7f]/g, '')
            .replace(/[^A-Za-z0-9._ -]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^\.+/, '');
        if (cleaned.length === 0) return null;
        if (cleaned.length <= 100) return cleaned;
        const dot = cleaned.lastIndexOf('.');
        const ext = dot > 0 ? cleaned.slice(dot).slice(0, 20) : '';
        return `${cleaned.slice(0, 100 - ext.length)}${ext}`;
    }

    /**
     * Resolve the user-supplied Claude model to a known value, defaulting when
     * absent. Rejects unknown strings outright so a stray value can't shell
     * out as `--model <anything>` against the Claude CLI inside the sandbox.
     * Also enforces the org admin's Data App model visibility settings: an
     * explicitly hidden model is rejected (can't be newly selected), while an
     * absent model gracefully falls back to the next visible one if the
     * system default has been hidden.
     */
    private async resolveClaudeModel(
        organizationUuid: string,
        claudeModel: DataAppClaudeModel | undefined,
    ): Promise<DataAppClaudeModel> {
        if (
            claudeModel !== undefined &&
            !(DATA_APP_CLAUDE_MODELS as readonly string[]).includes(claudeModel)
        ) {
            throw new ParameterError(
                `Invalid claudeModel: ${claudeModel}. Allowed: ${DATA_APP_CLAUDE_MODELS.join(
                    ', ',
                )}`,
            );
        }

        const visibility =
            await this.orgAiCopilotConfigResolver.getDataAppModelVisibility(
                organizationUuid,
            );

        if (claudeModel === undefined) {
            return (
                resolveDefaultVisibleDataAppClaudeModel(visibility) ??
                DEFAULT_DATA_APP_CLAUDE_MODEL
            );
        }

        if (!getVisibleDataAppClaudeModels(visibility).includes(claudeModel)) {
            throw new ParameterError(
                `The "${claudeModel}" model has been disabled by your organization`,
            );
        }

        return claudeModel;
    }

    /**
     * Reasoning-effort policy for the claude CLI: first builds run low —
     * benchmarked ~40% faster with no quality-gate regressions — while
     * iterations run high (the CLI default, now passed explicitly), since
     * they make targeted edits to existing code where deeper reasoning
     * matters more than blank-page latency.
     */
    private static resolveClaudeEffort(version: number): 'low' | 'high' {
        return version === 1 ? 'low' : 'high';
    }

    /**
     * Buffer the full upload body (capped at maxBytes). Buffering up-front
     * avoids stream pause/pipe state-machine pitfalls and gives us a Buffer
     * ready for signed S3 PutObject.
     */
    private static async bufferUploadBody(
        stream: Readable,
        maxBytes: number,
    ): Promise<Buffer> {
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of stream) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buf.length;
            if (total > maxBytes) {
                throw new ParameterError(
                    `File too large: exceeded ${maxBytes} bytes`,
                );
            }
            chunks.push(buf);
        }
        const body = Buffer.concat(chunks);
        if (body.length === 0) {
            throw new ParameterError('Upload body is empty');
        }
        return body;
    }

    /**
     * Classify an upload by its declared MIME type and actual content.
     * Raster images must match their magic bytes; PDFs must start with %PDF;
     * everything else is accepted only when it sniffs as UTF-8 text. The
     * returned mimeType is what gets stored as the S3 ContentType — declared
     * type for images/PDFs and recognized text types, text/plain otherwise.
     */
    private static validateUploadContent(
        body: Buffer,
        declaredMimeType: string,
    ): { category: 'image' | 'pdf' | 'text'; mimeType: string } {
        if (AppGenerateService.RASTER_IMAGE_TYPES.includes(declaredMimeType)) {
            if (body.length < AppGenerateService.SIGNATURE_PREFIX_SIZE) {
                throw new ParameterError(
                    'Upload body too small to be a valid image',
                );
            }
            const signatures =
                AppGenerateService.IMAGE_SIGNATURES[declaredMimeType];
            if (
                signatures &&
                !AppGenerateService.matchesSignature(body, signatures)
            ) {
                throw new ParameterError(
                    `File content does not match declared Content-Type: ${declaredMimeType}`,
                );
            }
            return { category: 'image', mimeType: declaredMimeType };
        }

        const isPdfContent = AppGenerateService.matchesSignature(body, [
            { offset: 0, bytes: AppGenerateService.PDF_SIGNATURE },
        ]);
        if (declaredMimeType === 'application/pdf') {
            if (!isPdfContent) {
                throw new ParameterError(
                    'File content does not match declared Content-Type: application/pdf',
                );
            }
            return { category: 'pdf', mimeType: 'application/pdf' };
        }
        // Browsers report an empty/generic type for unknown extensions —
        // classify by content instead of rejecting on the declared type.
        if (isPdfContent) {
            return { category: 'pdf', mimeType: 'application/pdf' };
        }

        if (AppGenerateService.sniffsAsText(body)) {
            return {
                category: 'text',
                mimeType: AppGenerateService.isTextLikeMimeType(
                    declaredMimeType,
                )
                    ? declaredMimeType
                    : 'text/plain',
            };
        }

        throw new ParameterError(
            `Unsupported file type: ${declaredMimeType}. Supported: images (PNG, JPEG, GIF, WEBP), PDF, and text-based files (JSON, CSV, Markdown, XML/TWB, YAML, code, …)`,
        );
    }

    async uploadFile(
        user: SessionUser,
        projectUuid: string,
        declaredMimeType: string,
        body: Readable,
        contentLength: number,
        appUuid: string,
        filename?: string,
        kind?: 'screenshot',
    ): Promise<{
        fileId: string;
        imageId: string;
        filename: string;
        mimeType: string;
    }> {
        await this.assertDataAppsEnabled(user);

        // For iterations the app already exists — use its space + creator
        // context so a space editor or the creator can attach a file. For
        // initial creation the appUuid is generated client-side and the app
        // row doesn't exist yet, so we authorize against `create:DataApp`
        // (anyone who can create an app can stage a file for it).
        const app = await this.appModel.findApp(appUuid, projectUuid);
        if (app) {
            await this.assertCanManageApp(
                user,
                app,
                'Insufficient permissions to upload app files',
            );
        } else {
            const organizationUuid = await this.getProjectOrgUuid(projectUuid);
            this.assertDataAppAbility(
                user,
                'create',
                organizationUuid,
                projectUuid,
                'Insufficient permissions to upload app files',
            );
        }

        const maxSize = 10 * 1024 * 1024; // 10 MB
        if (contentLength > maxSize) {
            throw new ParameterError(
                `File too large: ${contentLength} bytes. Maximum: ${maxSize} bytes`,
            );
        }

        // Declared types that can never pass content classification are
        // rejected before the body is buffered, so a 10MB video doesn't cost
        // memory just to fail. Everything else (incl. octet-stream) is
        // classified by content after buffering.
        const [declaredKind] = declaredMimeType.split('/');
        const cannotPassClassification =
            ['video', 'audio', 'font'].includes(declaredKind) ||
            (declaredKind === 'image' &&
                declaredMimeType !== 'image/svg+xml' &&
                !AppGenerateService.RASTER_IMAGE_TYPES.includes(
                    declaredMimeType,
                ));
        if (cannotPassClassification) {
            throw new ParameterError(
                `Unsupported file type: ${declaredMimeType}. Supported: images (PNG, JPEG, GIF, WEBP), PDF, and text-based files (JSON, CSV, Markdown, XML/TWB, YAML, code, …)`,
            );
        }

        // Buffer the whole body, then validate content against the declared
        // type. We need the full Buffer anyway so the AWS SDK can use standard
        // S3v4 signing — streaming bodies cause chunked signing which
        // MinIO/GCS reject with RequestTimeout.
        const bufferedBody = await AppGenerateService.bufferUploadBody(
            body,
            maxSize,
        );
        const { category, mimeType } = AppGenerateService.validateUploadContent(
            bufferedBody,
            declaredMimeType,
        );
        if (kind === 'screenshot' && category !== 'image') {
            throw new ParameterError('Screenshots must be images');
        }

        const fileId = uuidv4();
        const storedFilename =
            (filename ? AppGenerateService.sanitizeFilename(filename) : null) ??
            `file-${fileId.slice(0, 8)}.${
                category === 'text'
                    ? 'txt'
                    : AppGenerateService.mimeToExt(mimeType)
            }`;

        const { client: s3Client, bucket } = this.getS3Client();
        const s3Key = AppGenerateService.fileStagingKey(appUuid, fileId);

        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: s3Key,
                Body: bufferedBody,
                ContentLength: bufferedBody.length,
                ContentType: mimeType,
                // Persist upload kind + original filename on the staged object
                // so `writeFileToSandbox` and version creation can use them
                // later without needing a separate DB column. S3 metadata
                // values must be ASCII, hence the URI encoding.
                Metadata: {
                    filename: encodeURIComponent(storedFilename),
                    ...(kind ? { kind } : {}),
                },
            }),
        );

        this.analytics.track({
            event: 'data_app.file_uploaded',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                appUuid,
                fileId,
                category,
                mimeType,
                sizeBytes: contentLength,
            },
        });

        return {
            fileId,
            imageId: fileId,
            filename: storedFilename,
            mimeType,
        };
    }

    async getImageUrl(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        imageId: string,
    ): Promise<{ imageUrl: string }> {
        await this.assertDataAppsEnabled(user);

        if (!isValidUuid(imageId)) {
            throw new ParameterError('Invalid imageId: must be a valid UUID');
        }

        const app = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanManageApp(
            user,
            app,
            'Insufficient permissions to view app images',
        );

        const belongsToApp = await this.appModel.appImageExists(
            appUuid,
            imageId,
        );
        if (!belongsToApp) {
            throw new NotFoundError(`Image not found: ${imageId}`);
        }

        const { client: s3Client, bucket } = this.getS3Client();
        const s3Key = AppGenerateService.fileStagingKey(appUuid, imageId);

        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
        const imageUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
            { expiresIn: 900 },
        );

        return { imageUrl };
    }

    async uploadThumbnail(
        user: SessionUser,
        projectUuid: string,
        mimeType: string,
        body: Readable,
        contentLength: number,
        appUuid: string,
    ): Promise<void> {
        await this.assertDataAppsEnabled(user);

        const app = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanManageApp(
            user,
            app,
            'Insufficient permissions to update app thumbnail',
        );

        if (mimeType !== 'image/png') {
            throw new ParameterError('App thumbnails must be PNG images');
        }

        const maxSize = 10 * 1024 * 1024; // 10 MB
        if (contentLength > maxSize) {
            throw new ParameterError(
                `Thumbnail too large: ${contentLength} bytes. Maximum: ${maxSize} bytes`,
            );
        }

        const bufferedBody = await AppGenerateService.bufferUploadBody(
            body,
            maxSize,
        );
        AppGenerateService.validateUploadContent(bufferedBody, mimeType);

        const { client: s3Client, bucket } = this.getS3Client();
        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: AppGenerateService.appThumbnailKey(appUuid),
                Body: bufferedBody,
                ContentLength: bufferedBody.length,
                ContentType: 'image/png',
            }),
        );

        this.analytics.track({
            event: 'data_app.thumbnail_uploaded',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                appUuid,
                sizeBytes: bufferedBody.length,
            },
        });
    }

    async getThumbnailUrl(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
    ): Promise<{ thumbnailUrl: string }> {
        await this.assertDataAppsEnabled(user);

        const app = await this.appModel.getApp(appUuid, projectUuid);
        // Viewing a thumbnail is a read: anyone who can view the app can see it
        // (e.g. on a project homepage), not just those who can manage it.
        await this.assertCanViewApp(user, app);

        const { client: s3Client, bucket } = this.getS3Client();
        const key = AppGenerateService.appThumbnailKey(appUuid);

        try {
            await s3Client.send(
                new HeadObjectCommand({
                    Bucket: bucket,
                    Key: key,
                }),
            );
        } catch (error) {
            if (
                error instanceof S3ServiceException &&
                error.$metadata.httpStatusCode === 404
            ) {
                throw new NotFoundError('App thumbnail not found');
            }
            throw error;
        }

        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
        const thumbnailUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: bucket, Key: key }),
            { expiresIn: 900 },
        );

        return { thumbnailUrl };
    }

    /**
     * Remove an app's thumbnail. Idempotent — deleting a thumbnail that does
     * not exist succeeds (S3 delete semantics).
     */
    async deleteThumbnail(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
    ): Promise<void> {
        await this.assertDataAppsEnabled(user);

        const app = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanManageApp(
            user,
            app,
            'Insufficient permissions to update app thumbnail',
        );

        const { client: s3Client, bucket } = this.getS3Client();
        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: bucket,
                Key: AppGenerateService.appThumbnailKey(appUuid),
            }),
        );

        this.analytics.track({
            event: 'data_app.thumbnail_deleted',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                appUuid,
            },
        });
    }

    private static truncateEnd(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return `...[truncated ${text.length - maxLength} chars]...${text.slice(-maxLength)}`;
    }

    private static elapsed(start: number): number {
        return Math.round(performance.now() - start);
    }

    async trackTimeoutFailure(
        payload: AppGeneratePipelineJobPayload,
        error: unknown,
        schedulerWaitMs?: number,
    ): Promise<void> {
        await this.trackVersionFailed(payload, 'timeout', error, {}, null, 0, {
            schedulerWaitMs,
        });
    }

    private static emitDataAppAiUsage(
        payload: AppGeneratePipelineJobPayload,
        model: DataAppClaudeModel,
        provider: 'anthropic' | 'bedrock',
        keyManagement: AiKeyManagement,
        usage: ClaudeGenerationUsage,
    ): void {
        emitAiUsage(
            getAiCallTelemetry({
                functionId: 'appClaudeGeneration',
                feature: 'data-app',
                organizationUuid: payload.organizationUuid,
                projectUuid: payload.projectUuid,
                userUuid: payload.userUuid,
                model,
                provider,
                keyManagement,
                extra: {
                    appUuid: payload.appUuid,
                    appVersion: payload.version,
                },
            }),
            {
                inputTokens:
                    usage.inputTokens +
                    usage.cacheReadInputTokens +
                    usage.cacheCreationInputTokens,
                outputTokens: usage.outputTokens,
                cacheReadTokens: usage.cacheReadInputTokens,
                cacheWriteTokens: usage.cacheCreationInputTokens,
                reasoningTokens: null,
                totalTokens:
                    usage.inputTokens +
                    usage.cacheReadInputTokens +
                    usage.cacheCreationInputTokens +
                    usage.outputTokens,
            },
        );
    }

    /**
     * Persist what the generation cost onto the version row, for the org-wide
     * activity log. Bookkeeping only — a failure here must never take down a
     * generation that otherwise succeeded, so it logs and moves on.
     */
    private async recordGenerationUsage(
        payload: AppGeneratePipelineJobPayload,
        usage: ClaudeGenerationUsage,
    ): Promise<void> {
        try {
            await this.appModel.recordVersionGenerationUsage(
                payload.appUuid,
                payload.version,
                usage,
            );
        } catch (error) {
            this.logger.warn(
                `App ${payload.appUuid}: failed to record generation usage for version ${payload.version}: ${getErrorMessage(error)}`,
            );
        }
    }

    private async trackVersionFailed(
        payload: AppGeneratePipelineJobPayload,
        failureStage:
            | 'sandbox'
            | 'catalog'
            | 'generating'
            | 'building'
            | 'packaging'
            | 'db'
            | 'config'
            | 'timeout',
        error: unknown,
        durations: Record<string, number>,
        overallStart: number | null,
        buildFixAttempts: number,
        telemetry: DataAppVersionFailureTelemetry = {},
    ): Promise<void> {
        const { generationUsage } = telemetry;
        const claudeModel =
            payload.claudeModel ?? DEFAULT_DATA_APP_CLAUDE_MODEL;

        if (
            generationUsage &&
            (generationUsage.inputTokens > 0 ||
                generationUsage.outputTokens > 0 ||
                generationUsage.cacheReadInputTokens > 0 ||
                generationUsage.cacheCreationInputTokens > 0 ||
                generationUsage.numTurns > 0 ||
                generationUsage.costUsd > 0)
        ) {
            AppGenerateService.emitDataAppAiUsage(
                payload,
                claudeModel,
                telemetry.claudeProvider ?? 'anthropic',
                telemetry.keyManagement ?? 'lightdash-managed',
                generationUsage,
            );
            await this.recordGenerationUsage(payload, generationUsage);
        }

        this.analytics.track({
            event: 'data_app.version.failed',
            userId: payload.userUuid,
            properties: {
                organizationId: payload.organizationUuid,
                projectId: payload.projectUuid,
                appUuid: payload.appUuid,
                version: payload.version,
                isIteration: payload.isIteration,
                isUpgrade: payload.isUpgrade ?? false,
                claudeModel,
                claudeProvider: telemetry.claudeProvider,
                schedulerWaitMs: telemetry.schedulerWaitMs,
                claudeEffort: AppGenerateService.resolveClaudeEffort(
                    payload.version,
                ),
                failureStage,
                errorMessage: AppGenerateService.truncateEnd(
                    getErrorMessage(error),
                    500,
                ),
                buildFixAttempts,
                buildFixGenerationMs: telemetry.buildFixGenerationMs,
                totalDurationMs:
                    overallStart !== null
                        ? AppGenerateService.elapsed(overallStart)
                        : 0,
                wasResumed: telemetry.wasResumed,
                sandboxMs: durations.sandboxMs,
                resumeMs: durations.resumeMs,
                restoreMs: durations.restoreMs,
                catalogMs: durations.catalogMs,
                generateMs: durations.generateMs,
                buildMs: durations.buildMs,
                metadataMs: durations.metadataMs,
                packageMs: durations.packageMs,
                uploadMs: durations.uploadMs,
                toolCallCount: telemetry.toolCallCount,
                inputTokens: generationUsage?.inputTokens,
                outputTokens: generationUsage?.outputTokens,
                cacheReadInputTokens: generationUsage?.cacheReadInputTokens,
                cacheCreationInputTokens:
                    generationUsage?.cacheCreationInputTokens,
                numTurns: generationUsage?.numTurns,
                durationApiMs: generationUsage?.durationApiMs,
                totalCostUsd: generationUsage?.costUsd,
                generationAttemptCount: telemetry.generationAttemptCount,
                timeToFirstTokenMs: telemetry.timeToFirstTokenMs,
                slowestTurnMs: telemetry.slowestTurnMs,
            },
        });
    }

    async markError(
        appUuid: string,
        version: number,
        error: unknown,
        userMessage: string,
    ): Promise<boolean> {
        try {
            const updated = await this.appModel.updateVersionStatusIfInProgress(
                appUuid,
                version,
                'error',
                AppGenerateService.truncateEnd(getErrorMessage(error), 4000),
                userMessage,
            );
            if (!updated) {
                this.logger.info(
                    `App ${appUuid}: skipped markError — version ${version} is no longer building (likely cancelled)`,
                );
            }
            return updated;
        } catch (dbError) {
            this.logger.error(
                `App ${appUuid}: failed to persist error status: ${getErrorMessage(dbError)}`,
            );
            return false;
        }
    }

    /**
     * @internal
     * Release graphile locks on appGeneratePipeline jobs whose corresponding
     * app_version hasn't advanced in STALE_THRESHOLD — the previous worker
     * is presumed dead. Released jobs are picked up on the next poll and
     * resumed from their last completed stage.
     *
     * Invoked only by the scheduler worker as a cron task; not exposed to
     * user requests, so no CASL permission check applies.
     *
     * Heartbeat: every status_message / status transition bumps
     * status_updated_at (see AppModel.updateStatusMessage etc.), including
     * Claude's per-tool-call progress updates.
     */
    async sweepStaleLocks(): Promise<void> {
        const STALE_THRESHOLD = '5 minutes';
        const rowCount = await this.appModel.releaseStaleLocks(
            APP_VERSION_TERMINAL_STATUSES,
            STALE_THRESHOLD,
        );
        if (rowCount > 0) {
            this.logger.info(
                `Released ${rowCount} stale appGeneratePipeline job(s) (no progress in ${STALE_THRESHOLD})`,
            );
        }
    }

    private async createSandbox(
        appUuid: string,
        organizationUuid: string,
        projectUuid: string,
        copilot: CopilotConfig,
        extraEgressHosts: string[] = [],
    ): Promise<{
        sandboxUuid: string;
        sandbox: SandboxHandle;
        durationMs: number;
    }> {
        const start = performance.now();
        const spec = this.buildSandboxSpec(copilot, extraEgressHosts);
        this.logger.info(
            `App ${appUuid}: launching sandbox from template ${spec.templateRef} (provider=${this.lightdashConfig.appRuntime.sandboxProvider})`,
        );
        const { sandboxUuid, handle } = await this.getSandboxManager().acquire({
            spec,
            organizationUuid,
            projectUuid,
            workspace: DATA_APP_WORKSPACE,
        });
        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: sandbox created (sandboxId=${handle.sandboxId}, sandboxUuid=${sandboxUuid}, ${durationMs}ms)`,
        );
        return { sandboxUuid, sandbox: handle, durationMs };
    }

    /**
     * End-of-turn suspend: snapshot the workspace and (on object-store
     * backends) destroy the container. Best-effort — a suspend failure is
     * logged but never fails the run.
     */
    private async suspendSandbox(
        sandboxUuid: string,
        sandbox: SandboxHandle,
        appUuid: string,
    ): Promise<void> {
        try {
            const start = performance.now();
            await this.getSandboxManager().suspend({
                sandboxUuid,
                handle: sandbox,
                workspace: DATA_APP_WORKSPACE,
            });
            const durationMs = AppGenerateService.elapsed(start);
            this.logger.info(
                `App ${appUuid}: sandbox suspended (sandboxId=${sandbox.sandboxId}, sandboxUuid=${sandboxUuid}, ${durationMs}ms)`,
            );
        } catch (error) {
            this.logger.warn(
                `App ${appUuid}: failed to suspend sandbox (sandboxId=${sandbox.sandboxId}, sandboxUuid=${sandboxUuid}): ${getErrorMessage(error)}`,
            );
        }
    }

    private async resumeSandbox(
        sandboxUuid: string,
        appUuid: string,
        copilot: CopilotConfig,
        extraEgressHosts: string[] = [],
    ): Promise<{ sandbox: SandboxHandle; durationMs: number }> {
        const start = performance.now();
        const sandbox = await this.getSandboxManager().resume({
            sandboxUuid,
            spec: this.buildSandboxSpec(copilot, extraEgressHosts),
        });
        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: sandbox resumed (sandboxId=${sandbox.sandboxId}, sandboxUuid=${sandboxUuid}, ${durationMs}ms)`,
        );
        return { sandbox, durationMs };
    }

    private async restoreSourceFromS3(
        sandbox: SandboxHandle,
        s3Client: S3Client,
        bucket: string,
        appUuid: string,
        version: number,
    ): Promise<number> {
        const start = performance.now();
        const s3Key = `apps/${appUuid}/versions/${version}/source.tar`;

        const response = await s3Client.send(
            new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
        );
        const stream = response.Body as Readable;
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const tarBuffer = Buffer.concat(chunks);

        await sandbox.files.write('/tmp/source.tar', tarBuffer);
        const result = await sandbox.commands.run(
            'tar -xf /tmp/source.tar -C /app',
            { timeoutMs: 60_000 },
        );
        if (result.exitCode !== 0) {
            throw new Error(
                `Failed to restore source (exit ${result.exitCode}): ${result.stderr}`,
            );
        }

        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: source restored from S3 (version=${version}, tarBytes=${tarBuffer.length}, ${durationMs}ms)`,
        );
        return durationMs;
    }

    /**
     * Restore the stored `package.json` + `pnpm-lock.yaml` from S3 into `/app`
     * and run `pnpm install --frozen-lockfile`. This enforces the "restore,
     * never modify" rule: the sandbox always builds with the dep set that was
     * stored at upload time, not whatever the Claude agent may have edited.
     *
     * Only called when `versionDeps` is non-null (custom dependency set).
     * Throws when install exits non-zero so the caller can surface the error.
     */
    private async restoreDepsToSandbox(
        sandbox: SandboxHandle,
        s3Client: S3Client,
        bucket: string,
        appUuid: string,
        version: number,
        versionDeps: AppVersionDependencies,
    ): Promise<number> {
        // Kill-switch: enforced at upload time too, but re-checked here so
        // flipping it off also stops installs of previously-approved dep sets
        // (iterations and rebuilds), not just new uploads.
        if (!this.lightdashConfig.appRuntime.customDependenciesEnabled) {
            throw new ParameterError(
                'Custom app dependencies are disabled on this instance (LIGHTDASH_APP_CUSTOM_DEPENDENCIES_ENABLED); this app version declares custom packages so it cannot be built.',
            );
        }
        const start = performance.now();
        const depsPrefix = `apps/${appUuid}/versions/${version}/deps/`;

        const [packageJsonBuf, lockfileBuf] = await Promise.all([
            readS3ObjectAsBuffer(s3Client, bucket, `${depsPrefix}package.json`),
            readS3ObjectAsBuffer(
                s3Client,
                bucket,
                `${depsPrefix}pnpm-lock.yaml`,
            ),
        ]);

        await Promise.all([
            sandbox.files.write('/app/package.json', packageJsonBuf),
            sandbox.files.write('/app/pnpm-lock.yaml', lockfileBuf),
        ]);

        const packageList = versionDeps.custom
            .map((d) => `${d.name}@${d.version}`)
            .join(', ');
        this.logger.info(
            `App ${appUuid}: installing custom dependencies (version=${version}, packages=${packageList})`,
        );

        let installResult: { exitCode: number; stdout: string; stderr: string };
        try {
            installResult = await sandbox.commands.run(
                'CI=true pnpm install --frozen-lockfile --ignore-scripts',
                {
                    cwd: '/app',
                    timeoutMs:
                        this.lightdashConfig.appRuntime
                            .dependencyInstallTimeoutMs,
                    onStderr: (chunk) => {
                        this.logger.debug(
                            `App ${appUuid}: install: ${chunk.trimEnd()}`,
                        );
                    },
                },
            );
        } catch (err) {
            if (!(err instanceof SandboxCommandError)) throw err;
            installResult = {
                exitCode: err.exitCode,
                stdout: err.stdout,
                stderr: err.stderr,
            };
        }

        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: dependency install completed (exit=${installResult.exitCode}, ${durationMs}ms)`,
        );

        if (installResult.exitCode !== 0) {
            // pnpm writes its error report to stdout; include both streams.
            const output = [installResult.stderr, installResult.stdout]
                .filter(Boolean)
                .join('\n')
                .slice(-2000);
            throw new Error(
                `Dependency install failed (exit ${installResult.exitCode}): ${output}`,
            );
        }

        return durationMs;
    }

    /**
     * Resume an existing sandbox or create a new one with source restored from S3.
     * Always returns a running sandbox handle (and its stable `sandbox_uuid`) or
     * throws. A resumed sandbox already has `/app/src` restored from its snapshot
     * (the workspace is self-contained); the S3 source restore only runs on the
     * create fallback, where there is no snapshot to restore from.
     */
    private async acquireSandbox(
        app: DbApp,
        appUuid: string,
        organizationUuid: string,
        projectUuid: string,
        s3Client: S3Client,
        bucket: string,
        copilot: CopilotConfig,
        extraEgressHosts: string[] = [],
    ): Promise<{
        sandbox: SandboxHandle;
        sandboxUuid: string;
        wasResumed: boolean;
        durations: Record<string, number>;
    }> {
        const durations: Record<string, number> = {};

        // Try to resume existing sandbox
        if (app.sandbox_id) {
            try {
                const result = await this.resumeSandbox(
                    app.sandbox_id,
                    appUuid,
                    copilot,
                    extraEgressHosts,
                );
                durations.resumeMs = result.durationMs;
                return {
                    sandbox: result.sandbox,
                    sandboxUuid: app.sandbox_id,
                    wasResumed: true,
                    durations,
                };
            } catch (error) {
                this.logger.warn(
                    `App ${appUuid}: sandbox resume failed, falling back to new sandbox: ${getErrorMessage(error)}`,
                );
            }
        }

        // Fallback: create new sandbox and restore source from latest ready version
        const createResult = await this.createSandbox(
            appUuid,
            organizationUuid,
            projectUuid,
            copilot,
            extraEgressHosts,
        );
        durations.sandboxMs = createResult.durationMs;
        await this.appModel.updateSandboxUuid(
            appUuid,
            createResult.sandboxUuid,
        );

        const latestReady = await this.appModel.getLatestReadyVersion(appUuid);
        if (latestReady) {
            durations.restoreMs = await this.restoreSourceFromS3(
                createResult.sandbox,
                s3Client,
                bucket,
                appUuid,
                latestReady.version,
            );
        }

        return {
            sandbox: createResult.sandbox,
            sandboxUuid: createResult.sandboxUuid,
            wasResumed: false,
            durations,
        };
    }

    private static readonly CLAUDE_SESSION_PATHS =
        'root/.claude root/.claude.json home/user/.claude home/user/.claude.json';

    /**
     * Upgrade pre-step: best-effort extract the Claude session state from the
     * old sandbox, then destroy it and clear `sandbox_id` so `acquireSandbox`
     * takes its cold-create path — a fresh box from the CURRENT template
     * image with the latest ready source restored from S3. Session carry and
     * destroy failures are logged, never fatal.
     */
    private async prepareUpgradeColdStart(
        appUuid: string,
        projectUuid: string,
        copilot: CopilotConfig,
        extraEgressHosts: string[],
    ): Promise<Buffer | null> {
        const app = await this.appModel.getApp(appUuid, projectUuid);
        if (!app.sandbox_id) return null;
        let sessionTar: Buffer | null = null;
        try {
            const { sandbox: oldSandbox } = await this.resumeSandbox(
                app.sandbox_id,
                appUuid,
                copilot,
                extraEgressHosts,
            );
            const result = await oldSandbox.commands.run(
                `tar -cf /tmp/claude-session.tar --ignore-failed-read -C / ${AppGenerateService.CLAUDE_SESSION_PATHS}`,
                { timeoutMs: 60_000 },
            );
            if (result.exitCode === 0) {
                sessionTar = Buffer.from(
                    await oldSandbox.files.readBytes('/tmp/claude-session.tar'),
                );
            }
        } catch (error) {
            this.logger.warn(
                `App ${appUuid}: could not carry the Claude session over the upgrade: ${getErrorMessage(error)}`,
            );
        }
        try {
            await this.getSandboxManager().destroy({
                sandboxUuid: app.sandbox_id,
            });
        } catch (error) {
            this.logger.warn(
                `App ${appUuid}: failed to destroy the old sandbox on upgrade: ${getErrorMessage(error)}`,
            );
        }
        await this.appModel.updateSandboxUuid(appUuid, null);
        this.logger.info(
            `App ${appUuid}: upgrade cold-start prepared (sessionCarried=${sessionTar !== null})`,
        );
        return sessionTar;
    }

    /** Best-effort restore of a carried Claude session into the new box. */
    private async restoreClaudeSession(
        sandbox: SandboxHandle,
        appUuid: string,
        sessionTar: Buffer,
    ): Promise<void> {
        try {
            await sandbox.files.write('/tmp/claude-session.tar', sessionTar);
            await sandbox.commands.run(
                'tar -xf /tmp/claude-session.tar -C / && rm -f /tmp/claude-session.tar',
                { timeoutMs: 60_000 },
            );
            this.logger.info(
                `App ${appUuid}: Claude session restored into the upgraded sandbox`,
            );
        } catch (error) {
            this.logger.warn(
                `App ${appUuid}: failed to restore the Claude session into the new sandbox: ${getErrorMessage(error)}`,
            );
        }
    }

    /**
     * Write resolved chart references as individual JSON files in the sandbox.
     * Returns a summary string to prepend to the prompt, or empty string if
     * no references were provided.
     */
    private async writeChartReferences(
        sandbox: SandboxHandle,
        appUuid: string,
        chartReferences: ChartReference[],
    ): Promise<string> {
        if (chartReferences.length === 0) return '';

        await sandbox.commands.run('mkdir -p /tmp/metric-queries', {
            timeoutMs: 10_000,
        });

        const slugCounts = new Map<string, number>();
        const fileEntries: string[] = [];
        let sampleCount = 0;

        for (const ref of chartReferences) {
            // Generate slug from chart name
            let slug = ref.chartName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            if (!slug) slug = 'chart';

            // Handle duplicate slugs
            const count = (slugCounts.get(slug) ?? 0) + 1;
            slugCounts.set(slug, count);
            const filename =
                count > 1 ? `${slug}-${count}.json` : `${slug}.json`;

            const json = JSON.stringify(ref, null, 2);
            // Each file write is independent — loop is fine here since writes
            // are small and sequential ordering doesn't matter for correctness.
            // eslint-disable-next-line no-await-in-loop
            await sandbox.files.write(`/tmp/metric-queries/${filename}`, json);

            // Surface sample-data status per file so Claude knows to look —
            // a "data sample" annotation on the listing is more discoverable
            // than expecting the model to spot the field inside each JSON.
            let sampleSuffix = '';
            if (ref.sampleData?.status === 'available') {
                const truncatedNote = ref.sampleData.truncated
                    ? ' (truncated)'
                    : '';
                sampleSuffix = ` — includes ${ref.sampleData.rows.length}-row data sample${truncatedNote}`;
                sampleCount += 1;
            } else if (ref.sampleData?.status === 'unavailable') {
                sampleSuffix = ` — sample data unavailable (${ref.sampleData.reason})`;
            }
            const modeSuffix = ref.linked
                ? ` — LINKED: render live with savedChart("${ref.chartUuid}") (do NOT inline the metricQuery)`
                : sampleSuffix;
            fileEntries.push(
                `- ${filename} ("${ref.chartName}", explore: ${ref.exploreName})${modeSuffix}`,
            );
        }

        this.logger.info(
            `App ${appUuid}: wrote ${chartReferences.length} chart reference(s) to /tmp/metric-queries/ (${sampleCount} with sample data)`,
        );

        const sampleHint =
            sampleCount > 0
                ? ` Some files include a "sampleData" field with up to ${AppGenerateService.SAMPLE_ROW_LIMIT} formatted rows from the actual query — useful when you need to know what real values look like (date ranges, category labels, magnitudes). Treat sample data as illustrative, not exhaustive.`
                : '';

        return (
            `[Referenced saved charts — metric queries available at /tmp/metric-queries/]${sampleHint}\n` +
            `${fileEntries.join('\n')}\n\n`
        );
    }

    /**
     * Write the attached dashboard's structural blueprint (tabs, tile layout,
     * filters) into the sandbox and return a prompt block framing it as the
     * layout spec. The blueprint complements the flattened chart references:
     * they carry the queries, this carries the design.
     */
    private async writeDashboardBlueprint(
        sandbox: SandboxHandle,
        appUuid: string,
        blueprint: DashboardBlueprint,
    ): Promise<string> {
        await sandbox.commands.run('mkdir -p /tmp/dashboard', {
            timeoutMs: 10_000,
        });
        await sandbox.files.write(
            DASHBOARD_BLUEPRINT_PATH,
            JSON.stringify(blueprint, null, 2),
        );
        this.logger.info(
            `App ${appUuid}: wrote dashboard blueprint for "${blueprint.name}" (${describeDashboardBlueprint(blueprint)}) to ${DASHBOARD_BLUEPRINT_PATH}`,
        );
        return dashboardBlueprintPromptBlock(blueprint);
    }

    /**
     * For each linked external connection, write a self-contained API-doc JSON
     * to /tmp/external-data/{alias}.json in the sandbox and return a prompt
     * block listing each file. Writes a file for every connection — the
     * contract (allowedMethods/allowedPathPrefixes) is useful even when no
     * samples have been saved. Returns '' only when there are zero linked
     * connections.
     */
    private async writeExternalConnectionSamples(
        sandbox: SandboxHandle,
        appUuid: string,
        docs: AppExternalConnectionDoc[],
    ): Promise<string> {
        if (docs.length === 0) return '';

        await sandbox.commands.run('mkdir -p /tmp/external-data', {
            timeoutMs: 10_000,
        });

        const fileEntries: string[] = [];
        for (const doc of docs) {
            const firstPrefix = doc.allowedPathPrefixes[0];
            const exampleMethod = doc.allowedMethods[0] ?? 'GET';
            // Prefer a real saved sample path; otherwise derive one from the first
            // allowed prefix. Either way it is the COMPLETE path from the origin.
            const examplePath =
                doc.samples[0]?.request.path ??
                `${firstPrefix ?? '/'}<resource>`;
            const instructions = doc.instructions?.trim();
            const fileContent = JSON.stringify(
                {
                    alias: doc.alias,
                    ...(instructions ? { instructions } : {}),
                    signature:
                        "externalFetch(alias: string, opts: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; query?: Record<string, string>; body?: unknown }): Promise<{ status: number; contentType: string; body: unknown; truncated: boolean }>",
                    origin: doc.origin,
                    // The single most-misread thing: `path` is the COMPLETE path from
                    // the origin, not relative to the prefix. Spell out origin + path.
                    requestUrl: `${doc.origin} + path  (your path is appended to the origin verbatim — the origin and path prefix are NEVER auto-prepended). Example full URL: ${doc.origin}${examplePath}`,
                    howToCall: `const result = await client.externalFetch('${doc.alias}', { method: '${exampleMethod}', path: '${examplePath}', query: { /* string values only */ } });\nconst data = result.body;`,
                    rules: [
                        "query is Record<string, string> — EVERY value must be a string. Write { latitude: '52.52' }, never { latitude: 52.52 }. Numbers and booleans are rejected with a 422.",
                        `path is the COMPLETE path appended to the origin (requestUrl = origin + path). Pass the full path starting from the origin — e.g. "${examplePath}" — and make sure it starts with one of allowedPathPrefixes. Do NOT shorten it to the trailing segment and do NOT assume the origin or prefix is auto-prepended.`,
                        'method must be one of allowedMethods.',
                        'Read the response from result.body. result.status is the upstream HTTP status; result.truncated is true if the response was capped.',
                        'Auth is injected by Lightdash — never include credentials, API keys, or headers.',
                    ],
                    allowedMethods: doc.allowedMethods,
                    allowedPathPrefixes: doc.allowedPathPrefixes,
                    samples: doc.samples.map((s) => ({
                        label: s.label,
                        request: s.request,
                        response: s.response,
                    })),
                },
                null,
                2,
            );
            // eslint-disable-next-line no-await-in-loop
            await sandbox.files.write(
                `/tmp/external-data/${doc.alias}.json`,
                fileContent,
            );
            fileEntries.push(
                `- /tmp/external-data/${doc.alias}.json — connection "${doc.alias}" (${doc.allowedMethods.join('/')}; ${doc.samples.length} example(s))`,
            );
        }

        this.logger.info(
            `App ${appUuid}: wrote ${docs.length} external connection doc(s) to /tmp/external-data/`,
        );

        return (
            `[Linked external connections — the app can call these external APIs via client.externalFetch(alias, opts). ` +
            `Each /tmp/external-data/{alias}.json documents one connection: its signature, origin, requestUrl, allowedMethods/allowedPathPrefixes, rules, and example request/response pairs. ` +
            `When a doc has an "instructions" field, it is admin-authored guidance on how to use that API (auth quirks, pagination, which endpoints matter, response caveats) — read and follow it. ` +
            `IMPORTANT: path is the COMPLETE path appended to the connection's origin (requestUrl = origin + path) — the origin and prefix are NOT auto-prepended. Always pass the full path from the doc's howToCall or a saved sample (e.g. "/repos/owner/repo/issues", never a shortened "/issues"). ` +
            `IMPORTANT: query is Record<string, string> — every query value must be a string (e.g. { latitude: '52.52' }, not 52.52); numbers are rejected with a 422. Read the response from result.body. ` +
            `Auth is handled by Lightdash — never send credentials. Treat sample values as illustrative of shape, not exhaustive.]\n` +
            `${fileEntries.join('\n')}\n\n`
        );
    }

    /**
     * Resolve the app's linked external connections to API-doc descriptors.
     * Fetches the contract from the connection and up to 5 saved samples.
     */
    private async resolveExternalConnectionSamples(
        appId: string,
    ): Promise<AppExternalConnectionDoc[]> {
        const links = await this.externalConnectionModel.listAppLinks(appId);
        return Promise.all(
            links.map(async (link) => ({
                alias: link.alias,
                origin: link.connection.origin,
                instructions: link.connection.instructions,
                allowedMethods: link.connection.allowedMethods,
                allowedPathPrefixes: link.connection.allowedPathPrefixes,
                // Cap at 5 samples — enough to illustrate the API shape without bloating the prompt
                samples:
                    await this.externalConnectionModel.getSamplesForPipeline(
                        link.connection.externalConnectionUuid,
                        5,
                    ),
            })),
        );
    }

    private async writeCatalogAndPrompt(
        sandbox: SandboxHandle,
        appUuid: string,
        projectUuid: string,
        prompt: string,
        fileIds: string[] | undefined,
        s3Client: S3Client,
        bucket: string,
        chartReferences: ChartReference[] | undefined,
        dashboardBlueprint: DashboardBlueprint | undefined,
        template: DataAppTemplate | undefined,
        isDataAppViz: boolean,
    ): Promise<{
        durationMs: number;
        tableCount: number;
        dimensionCount: number;
        metricCount: number;
        yamlBytes: number;
    }> {
        const start = performance.now();

        // Source the synthetic schema from the compiled explore cache (not the
        // flattened catalog summary) so it carries joins, real dimension/metric
        // types, and parameters. See exploresToModelFiles.
        const [exploresByUuid, chartUsageByTable] = await Promise.all([
            this.projectModel.getAllExploresFromCache(projectUuid),
            this.catalogModel.getChartUsageByTable(projectUuid),
        ]);
        const explores = Object.values(exploresByUuid).filter(
            (explore): explore is Explore => !isExploreError(explore),
        );
        const {
            files: modelFiles,
            tableCount,
            dimensionCount,
            metricCount,
            totalBytes,
        } = AppGenerateService.exploresToModelFiles(
            explores,
            chartUsageByTable,
        );

        // Project-level parameters are global (not attached to any one explore)
        // and live in lightdash.config.yml — the location skill.md already tells
        // the agent to look. Write them there so `.parameters()` is usable.
        const globalParameters =
            await this.projectParametersModel.find(projectUuid);
        const configYaml =
            AppGenerateService.projectParametersToConfigYaml(globalParameters);

        // Remove files that may have been created by a previous run with
        // different ownership (e.g. root-owned after Claude CLI execution),
        // which would cause a permission error on write.
        await sandbox.commands.run(
            'rm -rf /tmp/dbt-repo/models 2>/dev/null; rm -f /tmp/dbt-repo/lightdash.config.yml /tmp/prompt.txt 2>/dev/null; rm -rf /tmp/images /tmp/uploads /tmp/metric-queries /tmp/dashboard /tmp/external-data 2>/dev/null; true',
            { timeoutMs: 10_000 },
        );

        // One round trip per model file would cost minutes on a large project,
        // so ship the whole directory as a single archive and unpack in place.
        await sandbox.files.write(
            '/tmp/dbt-repo/models.tar',
            await AppGenerateService.packModelFiles(modelFiles),
        );
        await sandbox.commands.run(
            'mkdir -p /tmp/dbt-repo/models && tar -xf /tmp/dbt-repo/models.tar -C /tmp/dbt-repo/models && rm -f /tmp/dbt-repo/models.tar',
            { timeoutMs: 60_000 },
        );
        if (configYaml) {
            await sandbox.files.write(
                '/tmp/dbt-repo/lightdash.config.yml',
                configYaml,
            );
        }

        // Write chart reference files and prepend summary to prompt
        let finalPrompt = prompt;
        if (chartReferences && chartReferences.length > 0) {
            const referenceBlock = await this.writeChartReferences(
                sandbox,
                appUuid,
                chartReferences,
            );
            finalPrompt = referenceBlock + finalPrompt;
        }

        // Attached dashboard: write its structural blueprint and prepend the
        // layout-spec block. Prepended after the chart block so it lands above
        // it in the final prompt — structure first, then the queries.
        if (dashboardBlueprint) {
            const blueprintBlock = await this.writeDashboardBlueprint(
                sandbox,
                appUuid,
                dashboardBlueprint,
            );
            finalPrompt = blueprintBlock + finalPrompt;
        }

        // Linked external connections: write an API-doc file per connection into
        // the sandbox and prepend a listing to the prompt so Claude knows what
        // APIs the app can call.
        const externalLinks =
            await this.resolveExternalConnectionSamples(appUuid);
        if (externalLinks.length > 0) {
            const externalBlock = await this.writeExternalConnectionSamples(
                sandbox,
                appUuid,
                externalLinks,
            );
            if (externalBlock) {
                finalPrompt = externalBlock + finalPrompt;
            }
        }

        // Viz instructions come from the app's stored template (reliable on
        // iterate/retry, where payload.template is absent); starter-template
        // instructions seed only the initial generate. Both resolve through the
        // same exhaustive switch.
        const instructionsTemplate = isDataAppViz
            ? DATA_APP_VIZ_TEMPLATE
            : template;
        if (instructionsTemplate) {
            const templateInstructions =
                getTemplateInstructions(instructionsTemplate);
            if (templateInstructions) {
                finalPrompt = `${templateInstructions}\n\n${finalPrompt}`;
            }
        }

        // Resolve attachments from staging and write them into the sandbox
        if (fileIds && fileIds.length > 0) {
            const staged = await AppGenerateService.resolveStagedFiles(
                s3Client,
                bucket,
                appUuid,
                fileIds,
            );
            const named = AppGenerateService.assignSandboxFilenames(staged);
            const sandboxPaths = await Promise.all(
                named.map((file) =>
                    this.writeFileToSandbox(
                        sandbox,
                        appUuid,
                        file,
                        s3Client,
                        bucket,
                    ),
                ),
            );
            // Label screenshots distinctly so the agent treats them as
            // "current state of the built app" rather than design targets.
            let designIndex = 0;
            const referenceLines = named
                .map((file, i) => {
                    const p = sandboxPaths[i];
                    if (file.isScreenshot) {
                        return `[Screenshot of the current app at ${p} — use the Read tool to view it. This is what the user is looking at right now, not a design to reproduce.]`;
                    }
                    if (file.isImage) {
                        designIndex += 1;
                        return `[Design reference image ${designIndex} at ${p} — use the Read tool to view it]`;
                    }
                    return `[Attached file "${file.filename}" at ${p} — reference material from the user; use the Read tool to view it]`;
                })
                .join('\n');
            finalPrompt = `${referenceLines}\n\n${finalPrompt}`;
        }

        // Write only the latest prompt — Claude is stateless between runs, but
        // the sandbox filesystem preserves all code from previous iterations.
        // Claude can read existing files to understand what was built so far,
        // so replaying the full prompt history is unnecessary and makes
        // responses overly verbose.
        await sandbox.files.write('/tmp/prompt.txt', `${finalPrompt}\n`);

        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: model context written (tables=${tableCount}, dimensions=${dimensionCount}, metrics=${metricCount}, files=${modelFiles.length}, yamlBytes=${totalBytes}, ${durationMs}ms)`,
        );
        return {
            durationMs,
            tableCount,
            dimensionCount,
            metricCount,
            yamlBytes: totalBytes,
        };
    }

    private static packModelFiles(files: ModelFile[]): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            const packer = tarPack();
            const chunks: Buffer[] = [];
            packer.on('data', (chunk: Buffer) => chunks.push(chunk));
            packer.on('end', () => resolve(Buffer.concat(chunks)));
            packer.on('error', reject);

            const addNext = (index: number): void => {
                if (index >= files.length) {
                    packer.finalize();
                    return;
                }
                const file = files[index];
                packer.entry(
                    { name: file.filename },
                    Buffer.from(file.contents, 'utf-8'),
                    (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        addNext(index + 1);
                    },
                );
            };
            addNext(0);
        });
    }

    /**
     * HEAD each staged attachment to recover its ContentType, original
     * filename, and screenshot flag from upload-time metadata. Order is
     * preserved so callers can keep the user's attachment order.
     */
    private static async resolveStagedFiles(
        s3Client: S3Client,
        bucket: string,
        appUuid: string,
        fileIds: string[],
    ): Promise<StagedAppFile[]> {
        return Promise.all(
            fileIds.map(async (fileId) => {
                let response;
                try {
                    response = await s3Client.send(
                        new HeadObjectCommand({
                            Bucket: bucket,
                            Key: AppGenerateService.fileStagingKey(
                                appUuid,
                                fileId,
                            ),
                        }),
                    );
                } catch (error) {
                    if (
                        error instanceof S3ServiceException &&
                        error.$metadata.httpStatusCode === 404
                    ) {
                        throw new ParameterError(
                            `Attached file not found: ${fileId}`,
                        );
                    }
                    throw error;
                }
                const mimeType =
                    response.ContentType ?? 'application/octet-stream';
                const rawFilename = response.Metadata?.filename;
                let filename: string | null = null;
                if (rawFilename) {
                    try {
                        filename = AppGenerateService.sanitizeFilename(
                            decodeURIComponent(rawFilename),
                        );
                    } catch {
                        filename =
                            AppGenerateService.sanitizeFilename(rawFilename);
                    }
                }
                return {
                    fileId,
                    mimeType,
                    // Objects staged before filenames shipped (images only)
                    // carry no filename metadata — synthesize one.
                    filename:
                        filename ??
                        `file-${fileId.slice(0, 8)}.${AppGenerateService.mimeToExt(mimeType)}`,
                    isImage:
                        AppGenerateService.RASTER_IMAGE_TYPES.includes(
                            mimeType,
                        ),
                    isScreenshot: response.Metadata?.kind === 'screenshot',
                };
            }),
        );
    }

    /**
     * Unique sandbox filenames for an attachment batch: images keep the
     * uuid-based convention (`screenshot-` prefix tells the agent apart from
     * design references); other files use their original name so the agent
     * sees `sales.twb`, deduped with a numeric suffix on collision.
     */
    private static assignSandboxFilenames(
        files: StagedAppFile[],
    ): NamedStagedFile[] {
        const used = new Set<string>();
        return files.map((file) => {
            if (file.isImage) {
                const ext = AppGenerateService.mimeToExt(file.mimeType);
                const sandboxFilename = file.isScreenshot
                    ? `screenshot-${file.fileId}.${ext}`
                    : `${file.fileId}.${ext}`;
                return { ...file, sandboxFilename };
            }
            const dot = file.filename.lastIndexOf('.');
            const stem = dot > 0 ? file.filename.slice(0, dot) : file.filename;
            const ext = dot > 0 ? file.filename.slice(dot) : '';
            let candidate = file.filename;
            for (let n = 2; used.has(candidate); n += 1) {
                candidate = `${stem}-${n}${ext}`;
            }
            used.add(candidate);
            return { ...file, sandboxFilename: candidate };
        });
    }

    /**
     * Read a staged attachment from S3 and write it into the sandbox for
     * Claude to read. Returns the sandbox file path.
     *
     * Design-reference images are dual-written: once to `/tmp/images/`
     * (read-only inspection — picked up by the prompt prepend and the agent's
     * Read tool), and again to `/app/src/uploads/` so the agent can `import`
     * them as Vite assets when the image should ship inside the rendered app
     * (logo, hero illustration, etc). Screenshots are inspection-only and
     * never end up in the bundle — they describe current state, not target.
     *
     * Non-image attachments go to `/tmp/uploads/` only and are deliberately
     * NOT copied into the app source tree: they are reference material and
     * may embed secrets or connection details (e.g. Tableau workbooks), which
     * must not ship to app viewers unless the agent explicitly inlines
     * something at the user's request.
     */
    private async writeFileToSandbox(
        sandbox: SandboxHandle,
        appUuid: string,
        file: NamedStagedFile,
        s3Client: S3Client,
        bucket: string,
    ): Promise<string> {
        const stagingKey = AppGenerateService.fileStagingKey(
            appUuid,
            file.fileId,
        );

        this.logger.info(
            `App ${appUuid}: reading staged file (key=${stagingKey})`,
        );

        const response = await s3Client.send(
            new GetObjectCommand({
                Bucket: bucket,
                Key: stagingKey,
            }),
        );

        const dir = file.isImage ? '/tmp/images' : '/tmp/uploads';
        const sandboxPath = `${dir}/${file.sandboxFilename}`;

        const chunks: Uint8Array[] = [];
        const body = response.Body;
        if (body && typeof (body as NodeJS.ReadableStream).on === 'function') {
            for await (const chunk of body as AsyncIterable<Uint8Array>) {
                chunks.push(chunk);
            }
        } else {
            throw new Error('Unexpected S3 response body type');
        }
        const buffer = Buffer.concat(chunks);

        this.logger.info(
            `App ${appUuid}: writing file to sandbox (${file.mimeType}, ${buffer.length} bytes)`,
        );
        await sandbox.commands.run(`mkdir -p ${dir}`, {
            timeoutMs: 10_000,
        });
        await sandbox.files.write(sandboxPath, buffer);

        if (file.isImage && !file.isScreenshot) {
            await sandbox.commands.run('mkdir -p /app/src/uploads', {
                timeoutMs: 10_000,
            });
            await sandbox.files.write(
                `/app/src/uploads/${file.sandboxFilename}`,
                buffer,
            );
        }

        return sandboxPath;
    }

    private static readonly CODING_PHRASES = [
        'Shipping BI like we ship code',
        'Turning your metrics into pixels',
        'Claude is in the zone',
        'Wiring up your data',
        'Making your dashboards jealous',
        'Teaching your data new tricks',
        'Brewing some fresh analytics',
        '10x-ing your data app',
    ];

    private static randomCodingPhrase(): string {
        return AppGenerateService.CODING_PHRASES[
            Math.floor(Math.random() * AppGenerateService.CODING_PHRASES.length)
        ];
    }

    /**
     * Reject a theme that exceeds the asset-count/total-size guardrails before
     * it reaches the (expensive, timeout-prone) build pipeline. Themes are
     * normally capped at upload time, but a theme can predate the guardrails or
     * be an org default the caller didn't choose — so we re-check here and turn
     * it into a synchronous, actionable error instead of a silent build timeout.
     */
    private static assertThemeWithinLimits(
        design: ApiOrganizationDesign,
    ): void {
        const violation = checkThemeLimits(design.files);
        if (violation) {
            throw new ParameterError(themeLimitMessage(violation, design.name));
        }
    }

    private static buildThemeChangePrompt(themeName: string | null): string {
        const target = themeName
            ? `the active organization theme "${themeName}"`
            : 'the Lightdash default styling with no organization theme';

        return [
            `Restyle the current app to follow ${target}.`,
            'Preserve the app content exactly: do not change text, metrics, queries, filters, chart semantics, layout intent, or interactions.',
            'Only change visual styling needed for the theme: colors, typography, spacing, borders, shadows, chart palette, and appropriate theme asset usage.',
            'If a theme is active, read and use the files under /app/src/design/ and follow the organization theme instructions. Do not edit files under /app/src/design/.',
        ].join('\n');
    }

    /**
     * Convert an internal tool description (e.g. "Write /app/src/Dashboard.tsx")
     * into a user-friendly status message (e.g. "Creating Dashboard.tsx").
     */
    /** Human-readable status for a recognized tool; null for tools we have
     *  no meaningful description for (the caller shows a coding phrase as
     *  the live status instead, without recording it in the history). */
    private static toolDescriptionToStatusMessage(
        description: string,
    ): string | null {
        const parts = description.split(' ');
        const tool = parts[0];
        const filePath = parts.slice(1).join(' ');
        const fileName = filePath ? filePath.split('/').pop() : undefined;

        switch (tool) {
            case 'Write':
                return fileName ? `Creating ${fileName}` : 'Creating files';
            case 'Edit':
                return fileName ? `Editing ${fileName}` : 'Editing files';
            case 'Read':
                return fileName ? `Reading ${fileName}` : 'Reading files';
            case 'Glob':
            case 'Grep':
                return 'Searching codebase';
            case 'TodoWrite':
                return 'Updating TODOs';
            default:
                return null;
        }
    }

    private static readonly MAX_GENERATION_ATTEMPTS = 3;

    private static readonly GENERATION_RETRY_DELAY_MS = 5_000;

    /**
     * Effective system-prompt file passed to Claude via
     * `--append-system-prompt-file`. Always assembled fresh at the start of
     * every pipeline run by `assembleEffectiveSkill`, so the CLI flag can
     * point at a single stable path regardless of theme.
     */
    private static readonly EFFECTIVE_SKILL_PATH = '/app/effective-skill.md';

    /**
     * Build the effective system-prompt file Claude reads via
     * `--append-system-prompt-file`. When no theme is in effect the file is
     * byte-identical to the baseline `/app/skill.md` and the agent sees no
     * mention of themes. When a theme IS in effect we append an "active
     * theme" callout + the customer-supplied instruction markdown.
     *
     * We deliberately do NOT re-explain where theme files live or how to
     * use them here — `skill.md`'s `### Organization themes` section
     * already covers the directory layout, hard rules, and what to do
     * when the theme directory is empty. Duplicating that here would
     * dilute the customer instructions.
     */
    private async assembleEffectiveSkill(
        sandbox: SandboxHandle,
        designCopy: DesignSandboxCopyResult,
    ): Promise<void> {
        this.logger.debug(
            `Assembling effective skill (theme=${
                designCopy.designSnapshot?.name ?? 'none'
            }, instructionBytes=${designCopy.instructionMarkdown.length})`,
        );
        const baseSkill = (await sandbox.files.read('/app/skill.md')) as string;

        const sections: string[] = [];
        if (designCopy.designSnapshot) {
            const manifestLines = [
                ...designCopy.cssEntrypoints.map((path) => `- CSS: ${path}`),
                ...designCopy.fontPaths.map((path) => `- Font: ${path}`),
                ...designCopy.imagePaths.map((path) => `- Image: ${path}`),
            ];
            const manifest =
                manifestLines.length > 0
                    ? `\n\nAvailable theme files:\n${manifestLines.join('\n')}`
                    : '\n\nNo CSS, font, or image files were copied for this theme.';

            sections.push(
                `## Active organization theme: ${designCopy.designSnapshot.name}\n\n` +
                    `Theme assets are loaded in \`/app/src/design/\` (${designCopy.designSnapshot.fileCount} file(s)). Follow the rules under "Organization themes" in the main skill — they override your defaults for colors, typography, and chart palette where applicable.${manifest}\n\nBefore saying a theme asset is unavailable, inspect \`/app/src/design/\` with Glob or Read.`,
            );
        }
        if (designCopy.instructionMarkdown) {
            sections.push(
                `## Organization theme instructions\n\nThese rules are customer-supplied for the active theme. Treat them as product requirements that override defaults — including \`frontend-design\`'s direction and any conflicting guidance earlier in this prompt.\n\n${designCopy.instructionMarkdown}`,
            );
        }

        const effective =
            sections.length > 0
                ? `${baseSkill}\n\n---\n\n${sections.join('\n\n')}`
                : baseSkill;
        await sandbox.files.write(
            AppGenerateService.EFFECTIVE_SKILL_PATH,
            effective,
        );
    }

    private async runClaudeGeneration(
        sandbox: SandboxHandle,
        appUuid: string,
        version: number,
        continueSession: boolean,
        claudeCodeEnv: Record<string, string>,
        claudeModel: DataAppClaudeModel,
        // JSON Schema string for `--json-schema` structured output. When set,
        // the CLI validates the run's final output against it (retrying on
        // failure) and emits the parsed object on the result event. `null`
        // for runs that don't collect a structured schema (metadata, builds).
        structuredOutputSchema: string | null,
        onTelemetry?: (telemetry: ClaudeGenerationTelemetry) => void,
    ): Promise<{
        durationMs: number;
        responseText: string | null;
        structuredOutput: unknown;
        toolCallCount: number;
        usage: ClaudeGenerationUsage;
        timeToFirstTokenMs: number | null;
        turnDurationsMs: number[];
        generationAttemptCount: number;
    }> {
        const start = performance.now();
        let telemetry = ZERO_CLAUDE_GENERATION_TELEMETRY;

        if (structuredOutputSchema) {
            // A resumed sandbox may still hold a root-owned
            // /tmp/output-schema.json from the previous run's Claude execution,
            // which would make the write below fail with a permission error.
            // Remove it first (same pattern as the other /tmp scratch files).
            await sandbox.commands.run(
                'rm -f /tmp/output-schema.json 2>/dev/null; true',
                { timeoutMs: 10_000 },
            );
            await sandbox.files.write(
                '/tmp/output-schema.json',
                structuredOutputSchema,
            );
        }
        // `"$(cat …)"` splices the schema in as a single literal arg — robust
        // to the JSON's own quotes/braces, and a no-op when unset.
        const jsonSchemaFlag = structuredOutputSchema
            ? '--json-schema "$(cat /tmp/output-schema.json)" '
            : '';

        const effortFlag = `--effort ${AppGenerateService.resolveClaudeEffort(
            version,
        )} `;

        // When the sandbox was resumed from a previous iteration, use
        // --continue so Claude has the full conversation history of what
        // it built before. For fresh sandboxes, start a new session.
        // On retry we promote to --continue if the failed attempt
        // produced *any* stream event — that means a session exists on
        // disk and we want to resume rather than throw away the work
        // Claude already did. If no event ever arrived (CLI died on
        // startup) we keep the original flags, since --continue would
        // just fail with "no session to resume".
        const runAttempt = async (
            attempt: number,
            forceContinue: boolean,
        ): Promise<{
            durationMs: number;
            responseText: string | null;
            structuredOutput: unknown;
            toolCallCount: number;
            usage: ClaudeGenerationUsage;
            timeToFirstTokenMs: number | null;
            turnDurationsMs: number[];
            generationAttemptCount: number;
        }> => {
            // Bail before spawning claude when the version is no longer in
            // progress (typically cancelled). This gates the retry and
            // build-fix paths, which have no advanceStage check between
            // attempts — without it a cancel could be followed by another
            // full generation run of the cancelled prompt.
            const status = await this.appModel.getVersionStatus(
                appUuid,
                version,
            );
            if (!isAppVersionInProgress(status)) {
                throw new Error(
                    `Claude generation aborted — version ${version} is ${status} (likely cancelled)`,
                );
            }
            const attemptStartedAfterMs = AppGenerateService.elapsed(start);
            const sessionFlags =
                continueSession || forceContinue ? '--continue -p' : '-p';
            const processor = new ClaudeStreamProcessor();
            let responseText: string | null = null;
            let structuredOutput: unknown = null;
            let sessionEstablished = false;

            const result = await sandbox.commands
                .run(
                    `cat /tmp/prompt.txt | claude ${sessionFlags} ` +
                        `--model ${claudeModel} ${effortFlag}` +
                        `--thinking-display summarized ` +
                        `--verbose --output-format stream-json --include-partial-messages ` +
                        `--allowedTools "Read(//app/**),Read(//tmp/dbt-repo/**),Read(//tmp/images/**),Read(//tmp/uploads/**),Read(//tmp/metric-queries/**),Read(//tmp/dashboard/**),Read(//tmp/external-data/**),Write(//app/src/**),Edit(//app/src/**),Glob(//app/**),Glob(//tmp/dbt-repo/**),Glob(//tmp/uploads/**),Glob(//tmp/metric-queries/**),Glob(//tmp/dashboard/**),Glob(//tmp/external-data/**),Grep(//app/**),Grep(//tmp/dbt-repo/**),Grep(//tmp/uploads/**),Grep(//tmp/external-data/**)" ` +
                        `${jsonSchemaFlag}--append-system-prompt-file ${AppGenerateService.EFFECTIVE_SKILL_PATH}`,
                    {
                        cwd: '/app',
                        timeoutMs: 55 * 60 * 1000,
                        envs: claudeCodeEnv,
                        onStdout: (chunk) => {
                            for (const event of processor.feedChunk(chunk)) {
                                sessionEstablished = true;
                                switch (event.kind) {
                                    case 'thinking_started':
                                        this.logger.info(
                                            `App ${appUuid}: claude turn #${event.turn}: thinking`,
                                        );
                                        // Live-status placeholder only — not
                                        // worth keeping in the transcript.
                                        this.updateAppStatus(
                                            appUuid,
                                            version,
                                            'Thinking',
                                            null,
                                        );
                                        break;
                                    case 'thinking_snippet':
                                        this.updateAppStatus(
                                            appUuid,
                                            version,
                                            event.snippet,
                                            'thinking',
                                        );
                                        break;
                                    case 'tool_use': {
                                        this.logger.info(
                                            `App ${appUuid}: claude tool #${event.index}: ${event.description}`,
                                        );
                                        // description can be comma-separated
                                        // (e.g. "Write foo.tsx, Read bar.tsx") —
                                        // use only the first tool for the status.
                                        const firstTool =
                                            event.description.split(', ')[0];
                                        const toolStatus =
                                            AppGenerateService.toolDescriptionToStatusMessage(
                                                firstTool,
                                            );
                                        // Unknown tools get a fun live status
                                        // but stay out of the transcript.
                                        this.updateAppStatus(
                                            appUuid,
                                            version,
                                            toolStatus ??
                                                AppGenerateService.randomCodingPhrase(),
                                            toolStatus ? 'tool' : null,
                                        );
                                        break;
                                    }
                                    case 'result':
                                        if (event.text) {
                                            responseText = event.text;
                                        }
                                        structuredOutput =
                                            event.structuredOutput;
                                        break;
                                    default:
                                        assertUnreachable(
                                            event,
                                            'Unhandled Claude stream event',
                                        );
                                }
                            }
                        },
                        onStderr: (chunk) => {
                            this.logger.debug(
                                `App ${appUuid}: claude stderr: ${chunk.trimEnd()}`,
                            );
                        },
                    },
                )
                .catch((err: unknown) => {
                    // The sandbox `commands.run` throws `SandboxCommandError` on a
                    // non-zero exit, so convert it to a result here — mirroring the
                    // build path. Otherwise a failed claude run propagates as an
                    // opaque "exit status 1" with the real error swallowed, and the
                    // stderr-logging + retry below never run.
                    if (!(err instanceof SandboxCommandError)) {
                        throw err;
                    }
                    return {
                        exitCode: err.exitCode,
                        stdout: err.stdout,
                        stderr: err.stderr,
                    };
                });
            const toolCallCount = processor.totalToolCalls;
            const usage = processor.lastUsage;
            const { timeToFirstTokenMs, turnDurationsMs } = processor;
            telemetry = addClaudeGenerationAttempt(
                telemetry,
                {
                    usage,
                    toolCallCount,
                    timeToFirstTokenMs,
                    turnDurationsMs,
                },
                attemptStartedAfterMs,
            );
            onTelemetry?.(telemetry);
            const durationMs = AppGenerateService.elapsed(start);
            this.logger.info(
                `App ${appUuid}: Claude code generation completed (model=${claudeModel}, effort=${AppGenerateService.resolveClaudeEffort(
                    version,
                )}, exit=${result.exitCode}, toolCalls=${toolCallCount}, turns=${usage?.numTurns ?? 0}, outputTokens=${usage?.outputTokens ?? 0}, cacheReadTokens=${usage?.cacheReadInputTokens ?? 0}, ${durationMs}ms, attempt ${attempt}/${AppGenerateService.MAX_GENERATION_ATTEMPTS})`,
            );
            this.logger.info(
                `App ${appUuid}: claude turn timeline (ttft=${timeToFirstTokenMs ?? 'n/a'}ms, turnsMs=[${turnDurationsMs.join(', ')}])`,
            );

            if (result.exitCode === 0) {
                if (attempt > 1) {
                    this.logger.info(
                        `App ${appUuid}: Claude generation recovered after ${attempt - 1} retry(ies)`,
                    );
                }
                return {
                    durationMs,
                    responseText,
                    structuredOutput,
                    toolCallCount: telemetry.toolCallCount,
                    usage: telemetry.usage,
                    timeToFirstTokenMs: telemetry.timeToFirstTokenMs,
                    turnDurationsMs: telemetry.turnDurationsMs,
                    generationAttemptCount: telemetry.attemptCount,
                };
            }

            const stderrTail = AppGenerateService.truncateEnd(
                result.stderr,
                4000,
            );
            const stdoutTail = AppGenerateService.truncateEnd(
                result.stdout,
                4000,
            );

            const classification = classifyClaudeCliFailure(
                result.stderr,
                result.stdout,
            );
            if (
                attempt >= AppGenerateService.MAX_GENERATION_ATTEMPTS ||
                !classification.retryable
            ) {
                // On final failure, promote stderr+stdout to info so the
                // upstream API error (often emitted to stdout in
                // stream-json mode) is captured in production logs.
                this.logger.info(
                    `App ${appUuid}: Claude failure (category=${classification.category}, retryable=${classification.retryable}, exit=${result.exitCode}, attempt=${attempt})`,
                );
                this.logger.info(
                    `App ${appUuid}: Claude stderr (tail): ${stderrTail}`,
                );
                this.logger.info(
                    `App ${appUuid}: Claude stdout (tail): ${stdoutTail}`,
                );
                // Prefer the CLI's human-readable error over stderr, which is
                // usually empty in stream-json mode.
                const message = `Claude generation failed (exit ${result.exitCode}): ${
                    classification.providerDetail ?? result.stderr
                }`;
                throw new ClaudeGenerationError({
                    message,
                    userMessage: classification.userMessage,
                    category: classification.category,
                    providerDetail: classification.providerDetail,
                });
            }

            this.logger.debug(
                `App ${appUuid}: Claude stderr (tail): ${stderrTail}`,
            );
            this.logger.debug(
                `App ${appUuid}: Claude stdout (tail): ${stdoutTail}`,
            );

            this.logger.warn(
                `App ${appUuid}: Claude generation failed (exit ${result.exitCode}), retrying (attempt ${attempt}/${AppGenerateService.MAX_GENERATION_ATTEMPTS})`,
            );
            this.updateAppStatus(appUuid, version, 'Hit a snag, retrying');
            await new Promise<void>((resolve) => {
                setTimeout(
                    resolve,
                    AppGenerateService.GENERATION_RETRY_DELAY_MS,
                );
            });
            return runAttempt(attempt + 1, forceContinue || sessionEstablished);
        };

        return runAttempt(1, false);
    }

    /**
     * Fire-and-forget app status message update. Logs (but does not propagate)
     * failures so transient DB errors during a long generation don't kill the
     * pipeline. `kind` tags the entry in the narration history; `null` shows
     * the message as the live status without recording it.
     */
    private updateAppStatus(
        appUuid: string,
        version: number,
        message: string,
        kind: AppVersionStatusHistoryEntryKind | null = 'stage',
    ): void {
        void this.appModel
            .recordBuildNarration(appUuid, version, message, kind)
            .catch((e) => {
                this.logger.warn(
                    `App ${appUuid}: failed to update status message: ${getErrorMessage(e)}`,
                );
            });
    }

    /**
     * Generates the app's display name/description from the user's prompt via
     * a fast backend LLM call — no sandbox involvement, so it can run
     * concurrently with the build instead of gating `ready`. Config resolution
     * mirrors the clarify flow (org-resolved copilot config, BYO-key-aware
     * fast model). Returns a null name when no provider is configured or the
     * response is unusable — the app keeps its "Untitled" fallback.
     */
    private async generateAppMetadataFromPrompt(
        appUuid: string,
        prompt: string,
        organizationUuid: string,
        projectUuid: string,
        userUuid: string,
    ): Promise<{ name: string | null; description: string }> {
        const copilot =
            await this.orgAiCopilotConfigResolver.getCopilotConfig(
                organizationUuid,
            );
        let modelOptions;
        try {
            modelOptions =
                await this.orgAiCopilotConfigResolver.resolveFastModel(
                    copilot,
                    { enableReasoning: false },
                );
        } catch (err) {
            this.logger.info(
                `App ${appUuid}: skipping auto-name — no LLM provider configured (${getErrorMessage(err)})`,
            );
            return { name: null, description: '' };
        }

        const metadataSchema = z.object({
            name: z
                .string()
                .describe(
                    'Short display name for the app: 3-6 words, title case, no quotes',
                ),
            description: z
                .string()
                .describe('One-sentence description of what the app shows'),
        });

        const METADATA_TIMEOUT_MS = 15_000;
        const telemetry = getAiCallTelemetry({
            functionId: 'nameApp',
            feature: 'data-app',
            organizationUuid,
            projectUuid,
            userUuid,
            ...getLanguageModelAttribution(modelOptions.model),
            keyManagement: modelOptions.keyManagement,
        });
        const result = await generateObject({
            model: modelOptions.model,
            ...modelOptions.callOptions,
            providerOptions: modelOptions.providerOptions,
            experimental_telemetry: telemetry,
            schema: metadataSchema,
            abortSignal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
            messages: [
                {
                    role: 'system',
                    content:
                        'You write display metadata for a data app that is being generated from the prompt the user provides. Respond with a short name (3-6 words, title case) and a one-sentence description of the app.',
                },
                { role: 'user', content: prompt },
            ],
        });

        const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').trim();
        const name = stripHtml(result.object.name).slice(0, 255);
        const description = stripHtml(result.object.description).slice(0, 1024);
        if (!name) {
            this.logger.warn(
                `App ${appUuid}: auto-name returned an empty name`,
            );
            return { name: null, description };
        }
        return { name, description };
    }

    private async runBuild(
        sandbox: SandboxHandle,
        appUuid: string,
    ): Promise<{
        durationMs: number;
        exitCode: number;
        stdout: string;
        stderr: string;
    }> {
        const start = performance.now();
        // The sandbox `commands.run` throws `SandboxCommandError` on a non-zero
        // exit code, so we have to catch it ourselves and surface the result —
        // otherwise `runBuildWithAutoFix` would never see a failed build and
        // could not retry.
        let result: {
            exitCode: number;
            stdout: string;
            stderr: string;
        };
        try {
            result = await sandbox.commands.run('pnpm build', {
                cwd: '/app',
                timeoutMs: 60 * 1000,
                onStdout: (chunk) => {
                    this.logger.debug(
                        `App ${appUuid}: build stdout: ${chunk.trimEnd()}`,
                    );
                },
                onStderr: (chunk) => {
                    this.logger.info(
                        `App ${appUuid}: build: ${chunk.trimEnd()}`,
                    );
                },
            });
        } catch (err) {
            if (!(err instanceof SandboxCommandError)) {
                throw err;
            }
            result = {
                exitCode: err.exitCode,
                stdout: err.stdout,
                stderr: err.stderr,
            };
        }
        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: Vite build completed (exit=${result.exitCode}, ${durationMs}ms)`,
        );

        return {
            durationMs,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
        };
    }

    private static readonly MAX_BUILD_FIX_ATTEMPTS = 2;

    /**
     * Run `pnpm build` and feed any failure back to Claude to fix. A failure is
     * either a non-zero compile (the build output is fed back) or a clean
     * compile that still renders the placeholder (see {@link detectBlankApp}) —
     * both are silent ways to ship a broken app, so both drive the fix loop.
     * Retries up to MAX_BUILD_FIX_ATTEMPTS times before giving up and throwing.
     */
    private async runBuildWithAutoFix(
        sandbox: SandboxHandle,
        appUuid: string,
        version: number,
        claudeCodeEnv: Record<string, string>,
        claudeModel: DataAppClaudeModel,
        onTelemetry?: (telemetry: DataAppBuildFixTelemetry) => void,
    ): Promise<{
        buildMs: number;
        fixAttempts: number;
        fixGenerationMs: number;
        fixUsage: ClaudeGenerationUsage;
    }> {
        let buildMs = 0;
        let fixGenerationMs = 0;
        let fixAttempts = 0;
        let fixUsage: ClaudeGenerationUsage = ZERO_CLAUDE_USAGE;

        let lastResult = await this.runBuild(sandbox, appUuid);
        buildMs += lastResult.durationMs;

        // A clean compile isn't enough: an app that builds but renders only the
        // placeholder (e.g. the entry component was never authored) is a silent
        // blank-page failure. Treat it like a build error and feed it back into
        // the same fix loop.
        let blankAppProblem =
            lastResult.exitCode === 0
                ? await this.detectBlankApp(sandbox, appUuid)
                : null;

        while (
            (lastResult.exitCode !== 0 || blankAppProblem !== null) &&
            fixAttempts < AppGenerateService.MAX_BUILD_FIX_ATTEMPTS
        ) {
            // Each iteration depends on the previous one: Claude's fix must
            // complete before the next build, and we need the build outcome
            // to decide whether to keep retrying.
            /* eslint-disable no-await-in-loop */
            fixAttempts += 1;
            onTelemetry?.({
                usage: fixUsage,
                buildMs,
                fixAttempts,
                fixGenerationMs,
            });

            const isBuildError = lastResult.exitCode !== 0;

            this.logger.info(
                `App ${appUuid}: ${
                    isBuildError
                        ? `build failed (exit ${lastResult.exitCode})`
                        : 'app renders the placeholder'
                }, asking Claude to fix (attempt ${fixAttempts}/${AppGenerateService.MAX_BUILD_FIX_ATTEMPTS})`,
            );

            try {
                await this.appModel.recordBuildNarration(
                    appUuid,
                    version,
                    isBuildError ? 'Fixing build errors' : 'Fixing blank app',
                    'stage',
                );
            } catch (e) {
                this.logger.warn(
                    `App ${appUuid}: failed to update status message: ${getErrorMessage(e)}`,
                );
            }

            let fixPrompt: string;
            if (isBuildError) {
                const errorOutput = AppGenerateService.truncateEnd(
                    `${lastResult.stderr}\n${lastResult.stdout}`.trim(),
                    8000,
                );
                fixPrompt =
                    `The code you just produced failed to build with \`pnpm build\`. ` +
                    `Analyze the build output below, identify the compilation errors, ` +
                    `and fix the code so it builds cleanly. Do not ask questions — ` +
                    `apply the fix directly.\n\n` +
                    `Build output:\n${errorOutput}`;
            } else {
                fixPrompt =
                    `The code you just produced compiles, but it ships a blank page. ` +
                    `${blankAppProblem ?? ''} ` +
                    `Do not ask questions — apply the fix directly.`;
            }
            // Remove the previous prompt file first — after the Claude CLI
            // ran, it may be owned by a different user and writing would
            // fail with EPERM. Same reason as in writeCatalogAndPrompt.
            await sandbox.commands.run(
                'rm -f /tmp/prompt.txt 2>/dev/null; true',
                { timeoutMs: 10_000 },
            );
            await sandbox.files.write('/tmp/prompt.txt', `${fixPrompt}\n`);

            const fixStart = performance.now();
            const fixUsageBeforeAttempt = fixUsage;
            const buildMsBeforeAttempt = buildMs;
            const currentFixAttempt = fixAttempts;
            const fixGenerationMsBeforeAttempt = fixGenerationMs;
            const generation = await this.runClaudeGeneration(
                sandbox,
                appUuid,
                version,
                true, // --continue: keep conversation context from generation
                claudeCodeEnv,
                claudeModel,
                null, // build-fix run collects no structured schema
                (telemetry) => {
                    onTelemetry?.({
                        usage: addClaudeUsage(
                            fixUsageBeforeAttempt,
                            telemetry.usage,
                        ),
                        buildMs: buildMsBeforeAttempt,
                        fixAttempts: currentFixAttempt,
                        fixGenerationMs:
                            fixGenerationMsBeforeAttempt +
                            AppGenerateService.elapsed(fixStart),
                    });
                },
            );
            fixGenerationMs += generation.durationMs;
            fixUsage = addClaudeUsage(fixUsage, generation.usage);

            try {
                await this.appModel.recordBuildNarration(
                    appUuid,
                    version,
                    'Rebuilding',
                    'stage',
                );
            } catch (e) {
                this.logger.warn(
                    `App ${appUuid}: failed to update status message: ${getErrorMessage(e)}`,
                );
            }

            lastResult = await this.runBuild(sandbox, appUuid);
            buildMs += lastResult.durationMs;
            onTelemetry?.({
                usage: fixUsage,
                buildMs,
                fixAttempts,
                fixGenerationMs,
            });
            blankAppProblem =
                lastResult.exitCode === 0
                    ? await this.detectBlankApp(sandbox, appUuid)
                    : null;
            /* eslint-enable no-await-in-loop */
        }

        if (lastResult.exitCode !== 0) {
            throw new Error(
                `Build failed after ${fixAttempts} auto-fix attempt(s) (exit ${lastResult.exitCode}): ${lastResult.stderr}`,
            );
        }

        if (blankAppProblem !== null) {
            throw new Error(
                `App still renders the placeholder after ${fixAttempts} auto-fix attempt(s): ${blankAppProblem}`,
            );
        }

        if (fixAttempts > 0) {
            this.logger.info(
                `App ${appUuid}: build recovered after ${fixAttempts} auto-fix attempt(s)`,
            );
        }

        return { buildMs, fixAttempts, fixGenerationMs, fixUsage };
    }

    // Heading text rendered by the shipped src/App.jsx stub. The blank-app
    // guard greps the built bundle for it — keep in sync with the template
    // stub. The "Placeholder" suffix makes a coincidental match in a real
    // generated app effectively impossible.
    private static readonly PLACEHOLDER_MARKER =
        'Lightdash Data App Placeholder';

    /**
     * Detect an app that compiled cleanly but still renders the shipped
     * placeholder — a silent blank-page failure the build exit code can't
     * catch (e.g. Claude wrote its app into src/App.tsx but `main.jsx` still
     * resolves `./App` to the untouched src/App.jsx stub). Returns a
     * human-readable problem description (fed back to Claude as a fix prompt)
     * or null when the app looks authored.
     *
     * The signal is the built bundle: if `dist/assets` still contains the
     * placeholder marker text, the stub was rendered, so the entry was never
     * replaced. The marker is the stub heading compiled into JS (not the static
     * `dist/index.html`), and its "Placeholder" suffix makes a real generated
     * app effectively impossible to match. This fires for any blank caused by
     * the stub surviving — orphaned entry, unwired component — regardless of
     * which files Claude touched.
     *
     * Never throws: a guard that can't run must not block an otherwise-good
     * build, so any error resolves to null (treat as authored).
     */
    private async detectBlankApp(
        sandbox: SandboxHandle,
        appUuid: string,
    ): Promise<string | null> {
        try {
            const grepResult = await sandbox.commands.run(
                `grep -rl '${AppGenerateService.PLACEHOLDER_MARKER}' /app/dist/assets 2>/dev/null || true`,
                { timeoutMs: 10_000 },
            );
            if (grepResult.stdout.trim().length === 0) {
                return null;
            }

            return (
                `\`main.jsx\` renders the default export of \`src/App\` (the shipped ` +
                `\`src/App.jsx\`), and that file still renders the placeholder. Make it ` +
                `show your app — put your UI directly in \`src/App.jsx\`, or re-export your ` +
                `root from there (e.g. \`export { default } from './App.tsx';\`). You can't ` +
                `delete files, so wiring src/App.jsx to your work is the fix.`
            );
        } catch (e) {
            this.logger.warn(
                `App ${appUuid}: blank-app guard failed to run, skipping: ${getErrorMessage(e)}`,
            );
            return null;
        }
    }

    private async packageArtifacts(
        sandbox: SandboxHandle,
        appUuid: string,
    ): Promise<{ distTar: Buffer; sourceTar: Buffer; durationMs: number }> {
        const start = performance.now();

        await Promise.all([
            sandbox.commands.run('tar -cf /tmp/dist.tar -C /app dist', {
                timeoutMs: 20_000,
            }),
            sandbox.commands.run('tar -cf /tmp/source.tar -C /app src', {
                timeoutMs: 60_000,
            }),
        ]);

        const [distBytes, sourceBytes] = await Promise.all([
            sandbox.files.readBytes('/tmp/dist.tar'),
            sandbox.files.readBytes('/tmp/source.tar'),
        ]);
        const distTar = Buffer.from(distBytes);
        const sourceTar = Buffer.from(sourceBytes);

        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: packaging completed (distTar=${distTar.length}B, sourceTar=${sourceTar.length}B, ${durationMs}ms)`,
        );
        return { distTar, sourceTar, durationMs };
    }

    private async uploadToS3(
        s3Client: S3Client,
        bucket: string,
        appUuid: string,
        version: number,
        distTar: Buffer,
        sourceTar: Buffer,
    ): Promise<number> {
        const start = performance.now();
        const s3Prefix = `apps/${appUuid}/versions/${version}`;

        const [distResult] = await Promise.all([
            AppGenerateService.extractAndUploadToS3(
                distTar,
                s3Client,
                bucket,
                s3Prefix,
            ),
            s3Client
                .send(
                    new PutObjectCommand({
                        Bucket: bucket,
                        Key: `${s3Prefix}/source.tar`,
                        Body: sourceTar,
                        ContentType: 'application/x-tar',
                    }),
                )
                .then(() => {
                    this.logger.debug(
                        `App ${appUuid}: uploaded ${s3Prefix}/source.tar`,
                    );
                }),
        ]);

        const durationMs = AppGenerateService.elapsed(start);
        const totalBytes = distResult.totalBytes + sourceTar.length;
        this.logger.info(
            `App ${appUuid}: S3 upload completed (files=${distResult.fileCount + 1}, totalBytes=${totalBytes}, ${durationMs}ms)`,
        );
        return durationMs;
    }

    private static shouldRunStage(
        currentStatus: AppVersionStatus,
        stage: AppVersionStatus,
    ): boolean {
        const order = APP_VERSION_STAGE_ORDER as readonly AppVersionStatus[];
        return order.indexOf(currentStatus) <= order.indexOf(stage);
    }

    /**
     * Advance the version to the next stage, but only if it is still
     * in-progress. Returns false when the version has already been moved to a
     * terminal state (typically by `cancelVersion`) — callers must bail out
     * without continuing the pipeline, otherwise an unconditional status
     * write here would resurrect a cancelled version and let a subsequent
     * stage failure overwrite "Cancelled by user" with a generic error.
     */
    private async advanceStage(
        appUuid: string,
        version: number,
        stage: AppVersionStatus,
        statusMessage: string,
    ): Promise<boolean> {
        const updated = await this.appModel.updateVersionStatusIfInProgress(
            appUuid,
            version,
            stage,
            null,
            statusMessage,
        );
        if (!updated) {
            this.logger.info(
                `App ${appUuid}: pipeline halting before stage ${stage} — version ${version} is no longer in progress (likely cancelled)`,
            );
        }
        return updated;
    }

    /**
     * Main pipeline entry point — called by the Graphile Worker task handler.
     * On retry after pod death, reads current status from DB and skips
     * completed stages. `claude --continue` resumes the conversation.
     */
    async runPipeline(
        payload: AppGeneratePipelineJobPayload,
        schedulerWaitMs: number,
    ): Promise<void> {
        const { appUuid, version, projectUuid, isIteration, chartReferences } =
            payload;
        // Jobs enqueued before the fileIds rename still carry imageIds.
        const fileIds = payload.fileIds ?? payload.imageIds;

        // Check if version was cancelled while we were dead
        const currentStatus = await this.appModel.getVersionStatus(
            appUuid,
            version,
        );
        if (!isAppVersionInProgress(currentStatus)) {
            this.logger.info(
                `App ${appUuid}: pipeline skipped — version ${version} is ${currentStatus}`,
            );
            return;
        }

        let claudeCodeEnv: Record<string, string>;
        let copilot: ResolvedCopilotConfig;
        let s3Client: S3Client;
        let bucket: string;
        try {
            copilot = await this.orgAiCopilotConfigResolver.getClaudeCodeConfig(
                payload.organizationUuid,
            );
            claudeCodeEnv = AppGenerateService.getClaudeCodeEnv(copilot);
            ({ client: s3Client, bucket } = this.getS3Client());
        } catch (error) {
            // Config errors (missing/incomplete provider, E2B, or S3 setup) carry
            // a clear, actionable message — surface it so operators can see what's
            // misconfigured instead of a generic "something went wrong". Other
            // errors stay generic.
            const userMessage =
                error instanceof MissingConfigError
                    ? error.message
                    : 'Something went wrong. Please try again.';
            const marked = await this.markError(
                appUuid,
                version,
                error,
                userMessage,
            );
            if (marked) {
                await this.trackVersionFailed(
                    payload,
                    'config',
                    error,
                    {},
                    null,
                    0,
                    {
                        schedulerWaitMs,
                    },
                );
            }
            return;
        }

        const overallStart = performance.now();
        const durations: Record<string, number> = {};

        // Look up the version's custom dependency set once. Null means the
        // version builds with the template set only — no install step, no
        // extra egress hosts added to the sandbox spec.
        const versionRow = await this.appModel.getVersion(appUuid, version);
        const versionDeps = versionRow?.dependencies ?? null;
        const registryHosts =
            versionDeps !== null
                ? this.lightdashConfig.appRuntime.dependencyRegistryHosts
                : [];

        this.logger.info(
            `App ${appUuid}: pipeline started (version=${version}, status=${currentStatus}, isIteration=${isIteration}, model=${
                payload.claudeModel ?? DEFAULT_DATA_APP_CLAUDE_MODEL
            }, designUuid=${payload.designUuid ?? 'none'}, llm=${describeClaudeCodeEnv(claudeCodeEnv)})`,
        );

        // --- Stage: sandbox ---
        let sandbox: SandboxHandle;
        let sandboxUuid: string;
        let wasResumed = false;
        if (AppGenerateService.shouldRunStage(currentStatus, 'sandbox')) {
            const advanced = await this.advanceStage(
                appUuid,
                version,
                'sandbox',
                'Setting up build environment',
            );
            if (!advanced) {
                return;
            }
            try {
                // Upgrade: drop the old sandbox first (carrying the Claude
                // session best-effort) so the iteration path below cold-starts
                // on the current template image.
                let upgradeSessionTar: Buffer | null = null;
                if (payload.isUpgrade) {
                    upgradeSessionTar = await this.prepareUpgradeColdStart(
                        appUuid,
                        projectUuid,
                        copilot,
                        registryHosts,
                    );
                }
                if (isIteration) {
                    const app = await this.appModel.getApp(
                        appUuid,
                        projectUuid,
                    );
                    const acquired = await this.acquireSandbox(
                        app,
                        appUuid,
                        payload.organizationUuid,
                        projectUuid,
                        s3Client,
                        bucket,
                        copilot,
                        registryHosts,
                    );
                    sandbox = acquired.sandbox;
                    sandboxUuid = acquired.sandboxUuid;
                    wasResumed = acquired.wasResumed;
                    Object.assign(durations, acquired.durations);
                } else {
                    const result = await this.createSandbox(
                        appUuid,
                        payload.organizationUuid,
                        projectUuid,
                        copilot,
                        registryHosts,
                    );
                    sandbox = result.sandbox;
                    sandboxUuid = result.sandboxUuid;
                    durations.sandboxMs = result.durationMs;
                    await this.appModel.updateSandboxUuid(appUuid, sandboxUuid);
                }
                if (upgradeSessionTar) {
                    await this.restoreClaudeSession(
                        sandbox,
                        appUuid,
                        upgradeSessionTar,
                    );
                }
            } catch (error) {
                const marked = await this.markError(
                    appUuid,
                    version,
                    error,
                    'Failed to set up build environment. Please try again.',
                );
                if (marked) {
                    await this.trackVersionFailed(
                        payload,
                        'sandbox',
                        error,
                        durations,
                        overallStart,
                        0,
                        { schedulerWaitMs },
                    );
                }
                return;
            }
        } else {
            // Resuming past sandbox stage — reconnect
            const app = await this.appModel.getApp(appUuid, projectUuid);
            if (!app.sandbox_id) {
                const missingSandboxError = new Error(
                    'No sandbox_uuid found for resume',
                );
                const marked = await this.markError(
                    appUuid,
                    version,
                    missingSandboxError,
                    'Failed to resume build environment. Please try again.',
                );
                if (marked) {
                    await this.trackVersionFailed(
                        payload,
                        'sandbox',
                        missingSandboxError,
                        durations,
                        overallStart,
                        0,
                        { schedulerWaitMs },
                    );
                }
                return;
            }
            try {
                const result = await this.resumeSandbox(
                    app.sandbox_id,
                    appUuid,
                    copilot,
                    registryHosts,
                );
                sandbox = result.sandbox;
                sandboxUuid = app.sandbox_id;
                wasResumed = true;
                durations.resumeMs = result.durationMs;
            } catch (error) {
                const marked = await this.markError(
                    appUuid,
                    version,
                    error,
                    'Failed to resume build environment. Please try again.',
                );
                if (marked) {
                    await this.trackVersionFailed(
                        payload,
                        'sandbox',
                        error,
                        durations,
                        overallStart,
                        0,
                        { schedulerWaitMs },
                    );
                }
                return;
            }
        }

        // Wall-clock heartbeat: bumps status_updated_at every minute so a
        // long-running stage (e.g. Claude composing one big Write tool call)
        // doesn't trip sweepStaleLocks and get force-released to a duplicate
        // executor while we're still alive.
        const heartbeat = setInterval(() => {
            void this.appModel
                .touchVersionIfInProgress(appUuid, version)
                .catch((e) => {
                    this.logger.warn(
                        `App ${appUuid}: heartbeat failed: ${getErrorMessage(e)}`,
                    );
                });
        }, HEARTBEAT_INTERVAL_MS);

        try {
            // Parent span for the whole build: the sandbox's Claude Code spans
            // (one per LLM request / tool call) nest under it via the injected
            // TRACEPARENT, forming a single per-build waterfall. The OTEL export
            // env is resolved inside the span so TRACEPARENT reflects this
            // parent, and freshly per execution so a resumed sandbox always
            // exports with a non-expired auth token.
            await runWithOtelSpanContext(
                {
                    name: 'DataApp.generate',
                    attributes: {
                        'app.uuid': appUuid,
                        'app.version': version,
                        'project.uuid': projectUuid,
                        'organization.uuid': payload.organizationUuid,
                        'user.uuid': payload.userUuid,
                        'app.is_iteration': isIteration,
                        'app.scheduler_wait_ms': schedulerWaitMs,
                        'app.claude_model':
                            payload.claudeModel ??
                            DEFAULT_DATA_APP_CLAUDE_MODEL,
                        'app.claude_provider':
                            claudeCodeEnv.CLAUDE_CODE_USE_BEDROCK === '1'
                                ? 'bedrock'
                                : 'anthropic',
                        ...(process.env.LIGHTDASH_INSTALL_ID
                            ? { installId: process.env.LIGHTDASH_INSTALL_ID }
                            : {}),
                    },
                },
                async () => {
                    const otelEnv = await this.resolveSandboxOtelEnv(
                        appUuid,
                        getOtelTraceHeaders().traceparent,
                    );
                    await this.runPipelineStages(
                        sandbox,
                        payload,
                        s3Client,
                        bucket,
                        durations,
                        overallStart,
                        currentStatus,
                        wasResumed,
                        { ...claudeCodeEnv, ...otelEnv },
                        copilot,
                        fileIds,
                        chartReferences,
                        versionDeps,
                        schedulerWaitMs,
                    );
                },
            );
        } finally {
            clearInterval(heartbeat);
            await this.suspendSandbox(sandboxUuid, sandbox, appUuid);
        }
    }

    private async runPipelineStages(
        sandbox: SandboxHandle,
        payload: AppGeneratePipelineJobPayload,
        s3Client: S3Client,
        bucket: string,
        extraDurations: Record<string, number>,
        overallStart: number,
        currentStatus: AppVersionStatus,
        wasResumed: boolean,
        claudeCodeEnv: Record<string, string>,
        copilot: ResolvedCopilotConfig,
        fileIds: string[] | undefined,
        chartReferences: ChartReference[] | undefined,
        versionDeps: AppVersionDependencies | null,
        schedulerWaitMs: number,
    ): Promise<void> {
        const { appUuid, version, projectUuid, prompt, template } = payload;
        // Drives the data-app-viz prompt instructions + schema collection.
        // Derived from the app's own template (the source of truth) rather than
        // a payload flag, so it is correct on every path — initial generate,
        // iteration, and retry — not just the ones that remembered to set it.
        const pipelineApp = await this.appModel.getApp(appUuid, projectUuid);
        const isDataAppViz = pipelineApp.template === DATA_APP_VIZ_TEMPLATE;
        // Resolve the model once per pipeline run. Jobs enqueued before the
        // picker shipped (or any future caller that omits the field) fall back
        // to the default so we never run with `--model undefined`.
        const claudeModel: DataAppClaudeModel =
            payload.claudeModel ?? DEFAULT_DATA_APP_CLAUDE_MODEL;
        const claudeProvider: 'anthropic' | 'bedrock' =
            claudeCodeEnv.CLAUDE_CODE_USE_BEDROCK === '1'
                ? 'bedrock'
                : 'anthropic';
        const claudeKeyManagement = resolveKeyManagement(
            copilot,
            claudeProvider,
        );
        const durations: Record<string, number> = { ...extraDurations };
        const shouldRun = (stage: AppVersionStatus) =>
            AppGenerateService.shouldRunStage(currentStatus, stage);

        // Auto-name (first version only): a fast prompt-based LLM call that
        // runs concurrently with the build so it never gates `ready`. The
        // write is race-safe (setMetadataIfUnset) and the status poller picks
        // the name up mid-build. Resolves to its duration; never rejects.
        let metadataPromise: Promise<number> | null = null;
        if (version === 1) {
            const metadataStart = performance.now();
            metadataPromise = this.generateAppMetadataFromPrompt(
                appUuid,
                prompt,
                payload.organizationUuid,
                projectUuid,
                payload.userUuid,
            )
                .then(async (metadata) => {
                    if (metadata.name) {
                        // Only fills fields the user hasn't already set — the
                        // build is async, so the user may have renamed the app
                        // while it was building.
                        await this.appModel.setMetadataIfUnset(
                            appUuid,
                            projectUuid,
                            {
                                name: metadata.name,
                                description: metadata.description,
                            },
                        );
                        this.logger.info(
                            `App ${appUuid}: auto-named "${metadata.name}"`,
                        );
                    }
                    return AppGenerateService.elapsed(metadataStart);
                })
                .catch((error) => {
                    // Non-fatal — the app works fine without a name
                    this.logger.warn(
                        `App ${appUuid}: failed to auto-generate name: ${getErrorMessage(error)}`,
                    );
                    return AppGenerateService.elapsed(metadataStart);
                });
        }

        // Theme (org design) copy + system-prompt assembly. Runs
        // unconditionally on every pipeline execution — including
        // resumed/iterated runs — so a new sandbox or a switched theme
        // always lands clean. When `payload.designUuid` is absent/null
        // the helper short-circuits and `effective-skill.md` is
        // byte-identical to the baseline `/app/skill.md`.
        // Backstop for the upload-time and enqueue-time guardrails: a theme can
        // grow between enqueue and worker pickup (or a job may predate the
        // guardrails). Fail fast with the specific limit message instead of
        // copying everything into the sandbox and running the build to timeout.
        if (payload.designUuid) {
            const design =
                await this.organizationDesignModel.findInOrganization(
                    payload.organizationUuid,
                    payload.designUuid,
                );
            const violation = design ? checkThemeLimits(design.files) : null;
            if (design && violation) {
                const message = themeLimitMessage(violation, design.name);
                this.logger.warn(
                    `App ${appUuid}: theme ${payload.designUuid} exceeds the size cap at build time (${violation.bytes} > ${violation.limit} bytes); failing fast — ${message}`,
                );
                const themeError = new Error(message);
                const marked = await this.markError(
                    appUuid,
                    version,
                    themeError,
                    message,
                );
                if (marked) {
                    await this.trackVersionFailed(
                        payload,
                        'config',
                        themeError,
                        durations,
                        overallStart,
                        0,
                        { wasResumed, claudeProvider, schedulerWaitMs },
                    );
                }
                return;
            }
        }

        const designCopy = await copyDesignIntoSandbox({
            sandbox,
            s3Client,
            bucket,
            organizationDesignModel: this.organizationDesignModel,
            organizationUuid: payload.organizationUuid,
            designUuid: payload.designUuid ?? null,
            logger: this.logger,
        });
        await this.assembleEffectiveSkill(sandbox, designCopy);

        let catalogStats = {
            tableCount: 0,
            dimensionCount: 0,
            metricCount: 0,
            yamlBytes: 0,
        };
        let toolCallCount = 0;
        let buildFixAttempts = 0;
        let buildFixGenerationMs = 0;
        let distBytes = 0;
        let sourceBytes = 0;
        // Token/turn/cost usage summed across every `claude` invocation in the
        // build (main generation + build-fix re-runs + metadata). Reported on
        // the completion analytics event to decompose `generateMs`.
        let generationUsage: ClaudeGenerationUsage = ZERO_CLAUDE_USAGE;
        // Time-to-first-token and slowest single turn, captured from the main
        // generation call only (a per-call latency shape; not meaningful to
        // sum across the build-fix and metadata calls).
        let timeToFirstTokenMs: number | null = null;
        let slowestTurnMs = 0;
        let generationAttemptCount = 0;
        const captureMainGenerationTelemetry = (
            telemetry: ClaudeGenerationTelemetry,
        ) => {
            generationUsage = telemetry.usage;
            toolCallCount = telemetry.toolCallCount;
            timeToFirstTokenMs = telemetry.timeToFirstTokenMs;
            slowestTurnMs = telemetry.turnDurationsMs.length
                ? Math.max(...telemetry.turnDurationsMs)
                : 0;
            generationAttemptCount = telemetry.attemptCount;
        };
        const failureTelemetry = (): DataAppVersionFailureTelemetry => ({
            wasResumed,
            claudeProvider,
            keyManagement: claudeKeyManagement,
            schedulerWaitMs,
            buildFixGenerationMs,
            ...(generationAttemptCount > 0
                ? {
                      generationUsage,
                      generationAttemptCount,
                      toolCallCount,
                      timeToFirstTokenMs,
                      slowestTurnMs,
                  }
                : {}),
        });

        // --- Stage: catalog ---
        if (shouldRun('catalog')) {
            try {
                const advanced = await this.advanceStage(
                    appUuid,
                    version,
                    'catalog',
                    'Loading your data models',
                );
                if (!advanced) {
                    return;
                }
                // A resumed sandbox's Claude session may still end with a
                // prompt the user cancelled mid-run — disavow it so Claude
                // doesn't treat it as outstanding work. Fresh sandboxes get
                // a new session (no --continue), so no notice is needed.
                const previousPromptCancelled =
                    wasResumed &&
                    (await this.appModel.hasCancelledVersionSinceLastReady(
                        appUuid,
                        version,
                    ));
                if (previousPromptCancelled) {
                    this.logger.info(
                        `App ${appUuid}: prepending cancelled-prompt notice (a version since the last ready one was cancelled)`,
                    );
                }
                const catalogResult = await this.writeCatalogAndPrompt(
                    sandbox,
                    appUuid,
                    projectUuid,
                    previousPromptCancelled
                        ? `${CANCELLED_PROMPT_NOTICE}\n\n${prompt}`
                        : prompt,
                    fileIds,
                    s3Client,
                    bucket,
                    chartReferences,
                    payload.dashboardBlueprint,
                    template,
                    isDataAppViz,
                );
                durations.catalogMs = catalogResult.durationMs;
                catalogStats = {
                    tableCount: catalogResult.tableCount,
                    dimensionCount: catalogResult.dimensionCount,
                    metricCount: catalogResult.metricCount,
                    yamlBytes: catalogResult.yamlBytes,
                };
            } catch (error) {
                const totalMs = AppGenerateService.elapsed(overallStart);
                this.logger.error(
                    `App ${appUuid}: catalog failed after ${totalMs}ms: ${getErrorMessage(error)}`,
                );
                const marked = await this.markError(
                    appUuid,
                    version,
                    error,
                    'Failed to load your data models. Please try again.',
                );
                if (marked) {
                    await this.trackVersionFailed(
                        payload,
                        'catalog',
                        error,
                        durations,
                        overallStart,
                        buildFixAttempts,
                        failureTelemetry(),
                    );
                }
                return;
            }
        }

        // --- Stage: generating ---
        let responseText: string | null = null;
        // The data app viz schema, collected as the generation run's
        // `--json-schema` structured output (null for non-viz apps or when the
        // generating stage is skipped on a resumed build).
        let vizStructuredOutput: unknown = null;
        if (shouldRun('generating')) {
            const generationStart = performance.now();
            try {
                const advanced = await this.advanceStage(
                    appUuid,
                    version,
                    'generating',
                    AppGenerateService.randomCodingPhrase(),
                );
                if (!advanced) {
                    return;
                }
                // On retry (currentStatus === 'generating') or iteration
                // with resumed sandbox, use --continue so Claude picks up
                // the conversation where it left off.
                const continueSession =
                    currentStatus === 'generating' || wasResumed;
                const generation = await this.runClaudeGeneration(
                    sandbox,
                    appUuid,
                    version,
                    continueSession,
                    claudeCodeEnv,
                    claudeModel,
                    // Data app vizs collect a validated schema as the run's
                    // structured output; other apps don't declare one.
                    isDataAppViz ? JSON.stringify(dataAppVizJsonSchema) : null,
                    captureMainGenerationTelemetry,
                );
                durations.generateMs = generation.durationMs;
                responseText = generation.responseText;
                vizStructuredOutput = generation.structuredOutput;
                toolCallCount = generation.toolCallCount;
                generationUsage = generation.usage;
                timeToFirstTokenMs = generation.timeToFirstTokenMs;
                slowestTurnMs = generation.turnDurationsMs.length
                    ? Math.max(...generation.turnDurationsMs)
                    : 0;
                generationAttemptCount = generation.generationAttemptCount;
            } catch (error) {
                durations.generateMs =
                    durations.generateMs ??
                    AppGenerateService.elapsed(generationStart);
                const totalMs = AppGenerateService.elapsed(overallStart);
                this.logger.error(
                    `App ${appUuid}: generation failed after ${totalMs}ms: ${getErrorMessage(error)}`,
                );
                // Prefer a classified upstream-API message (quota / spend
                // limit / rate-limit / auth / overloaded). For unclassified
                // provider errors, show the provider's own message — it's
                // already human-readable (e.g. "API Error: 400 ..."). Then:
                // Bedrock failures are often the model not being enabled in
                // the configured region — point operators at that. The last
                // resort is honest about not knowing the cause rather than
                // blaming the user's request — infra failures (connection
                // loss, sandbox death) land here too.
                let userMessage: string;
                if (
                    error instanceof ClaudeGenerationError &&
                    error.userMessage
                ) {
                    userMessage = error.userMessage;
                } else if (
                    error instanceof ClaudeGenerationError &&
                    error.providerDetail
                ) {
                    userMessage = `Couldn't generate the app — the AI provider returned an error: ${AppGenerateService.truncateEnd(
                        error.providerDetail,
                        500,
                    )}`;
                } else if (claudeCodeEnv.CLAUDE_CODE_USE_BEDROCK === '1') {
                    userMessage =
                        'Failed to generate the app. If this keeps happening, check that the selected model is enabled in your AWS Bedrock region (see server logs).';
                } else {
                    userMessage =
                        'Something unexpected went wrong while generating your app. Please try again.';
                }
                const marked = await this.markError(
                    appUuid,
                    version,
                    error,
                    userMessage,
                );
                if (marked) {
                    await this.trackVersionFailed(
                        payload,
                        'generating',
                        error,
                        durations,
                        overallStart,
                        buildFixAttempts,
                        failureTelemetry(),
                    );
                }
                return;
            }
        }

        // --- Stage: building ---
        if (shouldRun('building')) {
            try {
                const advanced = await this.advanceStage(
                    appUuid,
                    version,
                    'building',
                    'Packaging your app',
                );
                if (!advanced) {
                    return;
                }

                // Restore custom dep files from S3 and run pnpm install before
                // the Vite build. Skipped for template-only versions.
                if (versionDeps !== null) {
                    try {
                        await this.appModel.recordBuildNarration(
                            appUuid,
                            version,
                            'Installing dependencies',
                            'stage',
                        );
                    } catch (e) {
                        this.logger.warn(
                            `App ${appUuid}: failed to update status message: ${getErrorMessage(e)}`,
                        );
                    }
                    try {
                        await this.restoreDepsToSandbox(
                            sandbox,
                            s3Client,
                            bucket,
                            appUuid,
                            version,
                            versionDeps,
                        );
                    } catch (installError) {
                        const totalMs =
                            AppGenerateService.elapsed(overallStart);
                        // Full pnpm output goes to the version error (author-
                        // facing) and debug logs; keep operator logs summary-only.
                        this.logger.error(
                            `App ${appUuid}: dep install failed after ${totalMs}ms`,
                        );
                        this.logger.debug(
                            `App ${appUuid}: dep install failure detail: ${getErrorMessage(installError)}`,
                        );
                        const marked = await this.markError(
                            appUuid,
                            version,
                            installError,
                            'Installing dependencies',
                        );
                        if (marked) {
                            await this.trackVersionFailed(
                                payload,
                                'building',
                                installError,
                                durations,
                                overallStart,
                                buildFixAttempts,
                                failureTelemetry(),
                            );
                        }
                        return;
                    }
                    try {
                        await this.appModel.recordBuildNarration(
                            appUuid,
                            version,
                            'Packaging your app',
                            'stage',
                        );
                    } catch (e) {
                        this.logger.warn(
                            `App ${appUuid}: failed to update status message: ${getErrorMessage(e)}`,
                        );
                    }
                }

                const usageBeforeBuildFix = generationUsage;
                const buildResult = await this.runBuildWithAutoFix(
                    sandbox,
                    appUuid,
                    version,
                    claudeCodeEnv,
                    claudeModel,
                    (telemetry) => {
                        durations.buildMs = telemetry.buildMs;
                        buildFixAttempts = telemetry.fixAttempts;
                        buildFixGenerationMs = telemetry.fixGenerationMs;
                        generationUsage = addClaudeUsage(
                            usageBeforeBuildFix,
                            telemetry.usage,
                        );
                    },
                );
                durations.buildMs = buildResult.buildMs;
                buildFixAttempts = buildResult.fixAttempts;
                buildFixGenerationMs = buildResult.fixGenerationMs;
                generationUsage = addClaudeUsage(
                    usageBeforeBuildFix,
                    buildResult.fixUsage,
                );
                if (buildResult.fixAttempts > 0) {
                    durations.buildFixMs = buildResult.fixGenerationMs;
                    durations.buildFixAttempts = buildResult.fixAttempts;
                }
            } catch (error) {
                const totalMs = AppGenerateService.elapsed(overallStart);
                this.logger.error(
                    `App ${appUuid}: build failed after ${totalMs}ms: ${getErrorMessage(error)}`,
                );
                // Auto-fix runs Claude too — a classified upstream failure
                // there (quota, spend limit, auth) is not a compile problem.
                const marked = await this.markError(
                    appUuid,
                    version,
                    error,
                    error instanceof ClaudeGenerationError && error.userMessage
                        ? error.userMessage
                        : "The generated code couldn't be compiled. Try again or simplify your request.",
                );
                if (marked) {
                    await this.trackVersionFailed(
                        payload,
                        'building',
                        error,
                        durations,
                        overallStart,
                        buildFixAttempts,
                        failureTelemetry(),
                    );
                }
                return;
            }
        }

        // --- Stage: packaging ---
        if (shouldRun('packaging')) {
            try {
                const advanced = await this.advanceStage(
                    appUuid,
                    version,
                    'packaging',
                    'Deploying your app',
                );
                if (!advanced) {
                    return;
                }
                const artifacts = await this.packageArtifacts(sandbox, appUuid);
                durations.packageMs = artifacts.durationMs;
                distBytes = artifacts.distTar.length;
                sourceBytes = artifacts.sourceTar.length;

                durations.uploadMs = await this.uploadToS3(
                    s3Client,
                    bucket,
                    appUuid,
                    version,
                    artifacts.distTar,
                    artifacts.sourceTar,
                );
            } catch (error) {
                const totalMs = AppGenerateService.elapsed(overallStart);
                this.logger.error(
                    `App ${appUuid}: deploy failed after ${totalMs}ms: ${getErrorMessage(error)}`,
                );
                const marked = await this.markError(
                    appUuid,
                    version,
                    error,
                    'Failed to deploy your app. Please try again.',
                );
                if (marked) {
                    await this.trackVersionFailed(
                        payload,
                        'packaging',
                        error,
                        durations,
                        overallStart,
                        buildFixAttempts,
                        failureTelemetry(),
                    );
                }
                return;
            }
        }

        // Data app viz: persist the schema the generator declared as the run's
        // structured output.
        if (isDataAppViz) {
            await this.persistSchema(vizStructuredOutput, appUuid, version);
        }

        try {
            const dbStart = performance.now();
            const updated = await this.appModel.updateVersionStatusIfInProgress(
                appUuid,
                version,
                'ready',
                null,
                isDataAppViz ? 'Visualization ready' : responseText,
            );
            durations.dbMs = AppGenerateService.elapsed(dbStart);
            if (!updated) {
                this.logger.info(
                    `App ${appUuid}: skipped marking ready — version ${version} is no longer building (likely cancelled)`,
                );
                return;
            }
        } catch (error) {
            this.logger.error(
                `App ${appUuid}: failed to mark version as ready: ${getErrorMessage(error)}`,
            );
            const marked = await this.markError(
                appUuid,
                version,
                error,
                'Something went wrong. Please try again.',
            );
            if (marked) {
                await this.trackVersionFailed(
                    payload,
                    'db',
                    error,
                    durations,
                    overallStart,
                    buildFixAttempts,
                    failureTelemetry(),
                );
            }
            return;
        }

        const totalMs = AppGenerateService.elapsed(overallStart);
        // Normally resolved long before `ready` — awaited only so the
        // completed event records its duration.
        if (metadataPromise) {
            durations.metadataMs = await metadataPromise;
        }
        this.logger.info(
            `App ${appUuid}: generation completed successfully in ${totalMs}ms (model=${claudeModel}, ${Object.entries(
                durations,
            )
                .map(([k, v]) => `${k}=${v}ms`)
                .join(
                    ', ',
                )}, generationAttempts=${generationAttemptCount}, numTurns=${generationUsage.numTurns}, inputTokens=${generationUsage.inputTokens}, outputTokens=${generationUsage.outputTokens}, cacheReadTokens=${generationUsage.cacheReadInputTokens}, cacheCreationTokens=${generationUsage.cacheCreationInputTokens}, costUsd=${generationUsage.costUsd})`,
        );

        // Aggregated across every `claude` CLI invocation in the pipeline. The
        // helper normalizes CLI input-token semantics to the cache-inclusive AI
        // usage stream and stamps the app/version onto the accompanying span.
        AppGenerateService.emitDataAppAiUsage(
            payload,
            claudeModel,
            claudeProvider,
            claudeKeyManagement,
            generationUsage,
        );
        await this.recordGenerationUsage(payload, generationUsage);

        this.analytics.track({
            event: 'data_app.version.completed',
            userId: payload.userUuid,
            properties: {
                organizationId: payload.organizationUuid,
                projectId: projectUuid,
                appUuid,
                version,
                isIteration: payload.isIteration,
                isUpgrade: payload.isUpgrade ?? false,
                claudeModel,
                claudeProvider,
                schedulerWaitMs,
                claudeEffort: AppGenerateService.resolveClaudeEffort(version),
                wasResumed,
                totalDurationMs: totalMs,
                sandboxMs: durations.sandboxMs,
                resumeMs: durations.resumeMs,
                restoreMs: durations.restoreMs,
                catalogMs: durations.catalogMs,
                generateMs: durations.generateMs,
                buildMs: durations.buildMs,
                metadataMs: durations.metadataMs,
                packageMs: durations.packageMs,
                uploadMs: durations.uploadMs,
                buildFixAttempts,
                buildFixGenerationMs,
                toolCallCount,
                inputTokens: generationUsage.inputTokens,
                outputTokens: generationUsage.outputTokens,
                cacheReadInputTokens: generationUsage.cacheReadInputTokens,
                cacheCreationInputTokens:
                    generationUsage.cacheCreationInputTokens,
                numTurns: generationUsage.numTurns,
                durationApiMs: generationUsage.durationApiMs,
                totalCostUsd: generationUsage.costUsd,
                generationAttemptCount,
                timeToFirstTokenMs,
                slowestTurnMs,
                catalogTableCount: catalogStats.tableCount,
                catalogDimensionCount: catalogStats.dimensionCount,
                catalogMetricCount: catalogStats.metricCount,
                catalogYamlBytes: catalogStats.yamlBytes,
                distBytes,
                sourceBytes,
            },
        });
    }

    /**
     * Resolve an attached dashboard (permission-checked) into the chart uuids
     * of its saved-chart tiles plus a structural blueprint of the dashboard
     * itself — tabs, tile layout, filters.
     */
    private async resolveDashboardReference(
        dashboardUuidOrSlug: string,
        user: SessionUser,
        projectUuid: string,
    ): Promise<{
        chartUuids: string[];
        dashboardName: string;
        blueprint: DashboardBlueprint;
    }> {
        const dashboard = await this.dashboardService.getByIdOrSlug(
            user,
            dashboardUuidOrSlug,
            { projectUuid },
        );
        const chartUuids = dashboard.tiles
            .filter(isDashboardChartTileType)
            .map((tile) => tile.properties.savedChartUuid)
            .filter((uuid): uuid is string => uuid !== null);
        return {
            chartUuids: [...new Set(chartUuids)],
            dashboardName: dashboard.name,
            blueprint: buildDashboardBlueprint(dashboard),
        };
    }

    /**
     * Merge explicit chart picks with charts inherited from a dashboard
     * tile. The dashboard's `includeSampleData` flag applies to every chart
     * it contributes; if a chart appears in both lists, the explicit and
     * inherited flags are OR'd so the user gets every sample they opted
     * into, no matter which chip they toggled.
     */
    private async collectChartReferences(
        charts: AppChartReference[] | undefined,
        dashboard: AppDashboardReference | undefined,
        user: SessionUser,
        projectUuid: string,
    ): Promise<{
        refs: AppChartReference[];
        dashboardName: string | null;
        dashboardBlueprint: DashboardBlueprint | null;
    }> {
        const flagByUuid = new Map<
            string,
            { sample: boolean; link: boolean }
        >();
        for (const c of charts ?? []) {
            const prev = flagByUuid.get(c.uuid) ?? {
                sample: false,
                link: false,
            };
            flagByUuid.set(c.uuid, {
                sample: prev.sample || c.includeSampleData,
                link: prev.link || (c.linkLive ?? false),
            });
        }
        let dashboardName: string | null = null;
        let dashboardBlueprint: DashboardBlueprint | null = null;
        if (dashboard) {
            const result = await this.resolveDashboardReference(
                dashboard.uuid,
                user,
                projectUuid,
            );
            dashboardName = result.dashboardName;
            dashboardBlueprint = result.blueprint;
            for (const uuid of result.chartUuids) {
                const prev = flagByUuid.get(uuid) ?? {
                    sample: false,
                    link: false,
                };
                flagByUuid.set(uuid, {
                    sample: prev.sample || dashboard.includeSampleData,
                    link: prev.link,
                });
            }
        }
        const refs: AppChartReference[] = [...flagByUuid.entries()].map(
            ([uuid, { sample, link }]) => ({
                uuid,
                includeSampleData: sample,
                linkLive: link,
            }),
        );
        return { refs, dashboardName, dashboardBlueprint };
    }

    /**
     * Hard cap on rows returned per chart sample. Sample data is opt-in but
     * still potentially sensitive — keeping this small bounds both the
     * exposure surface and the prompt token cost.
     */
    private static readonly SAMPLE_ROW_LIMIT = 10;

    /**
     * Run a saved chart's metric query and return at most SAMPLE_ROW_LIMIT
     * formatted rows. Returns `unavailable` (with a short reason string) on
     * any failure — sample data is best-effort by design.
     */
    private async fetchChartSample(
        chartUuid: string,
        user: SessionUser,
    ): Promise<ChartSampleData> {
        const account = fromSession(user);
        try {
            const result = await this.projectService.runViewChartQuery({
                account,
                chartUuid,
                context: QueryExecutionContext.DATA_APP_SAMPLE,
            });
            const truncated =
                result.rows.length > AppGenerateService.SAMPLE_ROW_LIMIT;
            const rows = result.rows
                .slice(0, AppGenerateService.SAMPLE_ROW_LIMIT)
                .map((row) => {
                    const flat: Record<string, string> = {};
                    for (const [field, cell] of Object.entries(row)) {
                        flat[field] = cell.value.formatted;
                    }
                    return flat;
                });
            return { status: 'available', rows, truncated };
        } catch (error) {
            this.logger.warn(
                `Sample query failed for chart ${chartUuid}: ${getErrorMessage(error)}`,
            );
            return {
                status: 'unavailable',
                reason: 'Sample query failed.',
            };
        }
    }

    /**
     * Resolve a list of (uuid, includeSampleData) refs into ChartReferences.
     * Charts the user can't view, can't load, or that are deleted are
     * skipped silently — same forgiving behavior as before.
     *
     * When `includeSampleData` is set on a ref, the chart's metric query is
     * executed and a small row sample is attached to the reference. Sample
     * fetches are concurrent with chart loads so they don't serialise.
     */
    private async resolveChartReferences(
        chartRefs: AppChartReference[],
        user: SessionUser,
        projectUuid: string,
    ): Promise<{
        references: ChartReference[];
        chartResources: AppVersionChartResource[];
        sampleStats: { requested: number; available: number };
    }> {
        // Dedupe by uuid; if any duplicate asks for sample data or link mode,
        // the union wins so the user gets the data they opted into.
        const { sampleDataEnabled } = this.lightdashConfig.appRuntime;
        const dedup = new Map<string, { sample: boolean; link: boolean }>();
        for (const ref of chartRefs) {
            const prev = dedup.get(ref.uuid) ?? { sample: false, link: false };
            dedup.set(ref.uuid, {
                sample:
                    sampleDataEnabled && (prev.sample || ref.includeSampleData),
                link: prev.link || (ref.linkLive ?? false),
            });
        }
        if (dedup.size === 0) {
            return {
                references: [],
                chartResources: [],
                sampleStats: { requested: 0, available: 0 },
            };
        }

        const uuids = [...dedup.keys()];
        const account = fromSession(user);

        const chartResults = await Promise.allSettled(
            uuids.map((uuid) =>
                this.savedChartService.get(uuid, account, { projectUuid }),
            ),
        );

        // Kick off sample fetches in parallel, only for charts that resolved
        // and were opted-in. Track which uuids actually requested a sample
        // so we can attach the result back to the right reference.
        const sampleUuids: string[] = [];
        chartResults.forEach((result, i) => {
            const flags = dedup.get(uuids[i]);
            if (
                result.status === 'fulfilled' &&
                flags?.sample &&
                !flags?.link
            ) {
                sampleUuids.push(uuids[i]);
            }
        });
        const sampleResults = await Promise.all(
            sampleUuids.map((uuid) => this.fetchChartSample(uuid, user)),
        );
        const sampleByUuid = new Map<string, ChartSampleData>();
        sampleUuids.forEach((uuid, i) => {
            sampleByUuid.set(uuid, sampleResults[i]);
        });

        const references: ChartReference[] = [];
        const chartResources: AppVersionChartResource[] = [];
        chartResults.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                const chart = result.value;
                references.push(
                    buildChartReference(
                        chart,
                        uuids[i],
                        dedup.get(uuids[i])!.link,
                        sampleByUuid.get(uuids[i]) ?? null,
                    ),
                );
                chartResources.push({
                    chartUuid: uuids[i],
                    chartName: chart.name,
                    chartKind: null,
                    linkLive: dedup.get(uuids[i])!.link,
                });
            }
            // Rejected = not a chart UUID, no access, or deleted — skip silently
        });

        const availableSamples = [...sampleByUuid.values()].filter(
            (s) => s.status === 'available',
        ).length;
        if (references.length > 0) {
            this.logger.info(
                `Resolved ${references.length} chart reference(s) from ${uuids.length} UUID(s); ` +
                    `${availableSamples}/${sampleUuids.length} sample(s) attached`,
            );
        }

        return {
            references,
            chartResources,
            sampleStats: {
                requested: sampleUuids.length,
                available: availableSamples,
            },
        };
    }

    /**
     * Pre-build clarifying questions. Run as a separate step before
     * `generateApp` so the user can pin down ambiguous intent in 1–3s
     * (a direct LLM call) instead of waiting for an E2B sandbox spin-up
     * just to ask. Stateless: nothing is persisted; the answers are sent
     * back inside the eventual `generateApp` request as `clarifications`.
     *
     * Always resolves with 200 + `{ questions }` rather than throwing on
     * LLM errors — the build flow should proceed without clarification
     * rather than fail. Returns an empty array when:
     * - the prompt is already specific enough (model judgment),
     * - neither Anthropic nor Bedrock is configured,
     * - the LLM call times out or errors.
     *
     * Routes through Bedrock when `AI_DEFAULT_PROVIDER=bedrock`, otherwise
     * Anthropic — mirroring the data-apps sandbox provider switch in
     * `claudeCodeEnv.ts` so the clarifier and code generation use the same
     * provider.
     *
     * Branches on template: a data app viz gets a component-scoped prompt and
     * no catalog context, because it never runs a query. Everything else shares
     * the cap, timeout and fall-through behaviour. See `clarifierPrompts.ts`.
     */
    async clarifyApp(
        user: SessionUser,
        projectUuid: string,
        prompt: string,
        template?: DataAppTemplate,
        charts?: AppChartReference[],
        dashboard?: AppDashboardReference,
        fileIds?: string[],
    ): Promise<{ questions: string[] }> {
        await this.assertDataAppsEnabled(user);
        const organizationUuid = await this.getProjectOrgUuid(projectUuid);
        this.assertDataAppAbility(
            user,
            'create',
            organizationUuid,
            projectUuid,
            'Insufficient permissions to create data apps',
        );

        const trimmed = prompt.trim();
        if (!trimmed) {
            throw new ParameterError('Prompt is required');
        }

        const copilot =
            await this.orgAiCopilotConfigResolver.getCopilotConfig(
                organizationUuid,
            );
        const llmProvider: 'anthropic' | 'bedrock' =
            copilot.defaultProvider === 'bedrock' ? 'bedrock' : 'anthropic';

        let modelOptions;
        try {
            modelOptions = getModel(copilot, {
                provider: llmProvider,
                modelName: 'claude-sonnet-4-5',
                enableReasoning: false,
            });
        } catch (err) {
            this.logger.info(
                `Skipping app clarification: ${llmProvider} not configured (${getErrorMessage(err)})`,
            );
            return { questions: [] };
        }

        // A data app viz never runs a query — it renders whatever rows the host
        // explore hands it — so catalog context would only invite questions
        // about explores, dimensions and time ranges that nobody can answer at
        // build time. Skip the summary entirely (and its catalog read).
        const isVizTemplate = template === DATA_APP_VIZ_TEMPLATE;

        const [catalogSummary, attachedResources] = await Promise.all([
            isVizTemplate
                ? Promise.resolve(null)
                : this.buildCatalogSummaryForClarifier(projectUuid),
            this.buildAttachedResourcesForClarifier(
                charts,
                dashboard,
                user,
                projectUuid,
            ),
        ]);
        const fileCount = fileIds?.length ?? 0;

        // No `.max()` on the array — Anthropic's structured-output mode
        // rejects `maxItems` in the schema. The prompt already pins the
        // 1–4 cap and we slice client-side after the response.
        const clarifySchema = z.object({
            questions: z.array(z.string()).describe(
                // Deliberately says "what gets built", not "the app" — this
                // description reaches the model alongside a system prompt
                // that may be insisting it is building a viz, not an app.
                '0–4 short clarifying questions, each a single sentence (5–15 words). Default to empty — only include questions whose answers would materially change what gets built.',
            ),
        });

        // Cap the LLM call so a stalled provider can't pin the chat input
        // open indefinitely. The frontend disables the input while clarify
        // is in flight; on timeout we fall through to a no-questions build.
        const CLARIFY_TIMEOUT_MS = 15_000;

        const start = performance.now();
        const telemetry = getAiCallTelemetry({
            functionId: 'clarifyApp',
            feature: 'data-app',
            organizationUuid,
            projectUuid,
            userUuid: user.userUuid,
            ...getLanguageModelAttribution(modelOptions.model),
            keyManagement: modelOptions.keyManagement,
            // Which prompt variant ran — the two ask for very different things,
            // so spend and question counts are only comparable within a variant.
            extra: { template: template ?? 'custom' },
        });
        let result;
        try {
            result = await generateObject({
                model: modelOptions.model,
                ...modelOptions.callOptions,
                providerOptions: modelOptions.providerOptions,
                experimental_telemetry: telemetry,
                schema: clarifySchema,
                abortSignal: AbortSignal.timeout(CLARIFY_TIMEOUT_MS),
                messages: [
                    {
                        role: 'system',
                        content: isVizTemplate
                            ? CLARIFY_VIZ_SYSTEM_PROMPT
                            : CLARIFY_APP_SYSTEM_PROMPT,
                    },
                    {
                        role: 'user',
                        content: [
                            // The viz system prompt already fixes the kind, and
                            // there is no catalog to describe.
                            ...(isVizTemplate
                                ? []
                                : [`App kind: ${template ?? 'custom'}`]),
                            `\nUser prompt:\n${trimmed}`,
                            `\nResources the user attached:\n${
                                AppGenerateService.formatAttachedResourcesForClarifier(
                                    attachedResources,
                                    fileCount,
                                ) || '(none)'
                            }`,
                            ...(isVizTemplate
                                ? []
                                : [
                                      `\nAvailable tables and key fields:\n${
                                          catalogSummary ||
                                          '(no catalog available)'
                                      }`,
                                  ]),
                        ].join('\n'),
                    },
                ],
            });
        } catch (err) {
            this.logger.warn(
                `App clarify failed after ${AppGenerateService.elapsed(start)}ms (project=${projectUuid}, template=${template ?? 'custom'}, llm=${llmProvider}): ${getErrorMessage(err)}`,
            );
            return { questions: [] };
        }
        emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));
        const elapsedMs = AppGenerateService.elapsed(start);

        const questions = result.object.questions
            .map((q) => q.trim())
            .filter((q) => q.length > 0)
            .slice(0, 4);

        this.logger.info(
            `App clarify: ${questions.length} question(s) in ${elapsedMs}ms (project=${projectUuid}, template=${template ?? 'custom'}, llm=${llmProvider})`,
        );

        return { questions };
    }

    /**
     * Light resolution of attached resources for `clarifyApp`. Returns chart
     * names + explore names and the dashboard name, but does NOT run sample
     * queries or read any image bytes — sample rows and pixel content don't
     * change *whether* a clarifying question is worth asking, and the clarify
     * call has a 15s budget. Charts the user can't view, that don't exist, or
     * that fail to load are skipped silently (same forgiving behavior as the
     * generate path).
     */
    private async buildAttachedResourcesForClarifier(
        charts: AppChartReference[] | undefined,
        dashboard: AppDashboardReference | undefined,
        user: SessionUser,
        projectUuid: string,
    ): Promise<{
        charts: { name: string; exploreName: string }[];
        dashboard: { name: string; structureSummary: string } | null;
    }> {
        const uuids = new Set<string>();
        for (const c of charts ?? []) uuids.add(c.uuid);
        let resolvedDashboard: {
            name: string;
            structureSummary: string;
        } | null = null;
        if (dashboard) {
            try {
                const result = await this.resolveDashboardReference(
                    dashboard.uuid,
                    user,
                    projectUuid,
                );
                resolvedDashboard = {
                    name: result.dashboardName,
                    structureSummary: describeDashboardBlueprint(
                        result.blueprint,
                    ),
                };
                for (const uuid of result.chartUuids) uuids.add(uuid);
            } catch (error) {
                this.logger.warn(
                    `Clarifier: dashboard ${dashboard.uuid} could not be resolved: ${getErrorMessage(error)}`,
                );
            }
        }
        if (uuids.size === 0) {
            return { charts: [], dashboard: resolvedDashboard };
        }
        const account = fromSession(user);
        const chartResults = await Promise.allSettled(
            [...uuids].map((uuid) =>
                this.savedChartService.get(uuid, account, { projectUuid }),
            ),
        );
        const resolvedCharts: { name: string; exploreName: string }[] = [];
        for (const result of chartResults) {
            if (result.status === 'fulfilled') {
                resolvedCharts.push({
                    name: result.value.name,
                    exploreName: result.value.tableName,
                });
            }
        }
        return { charts: resolvedCharts, dashboard: resolvedDashboard };
    }

    /**
     * Render the resolved attached-resources context as a short bullet list
     * for the clarifier's user message. Empty string when nothing was
     * attached — the caller handles the "(none)" fallback.
     */
    private static formatAttachedResourcesForClarifier(
        attached: {
            charts: { name: string; exploreName: string }[];
            dashboard: { name: string; structureSummary: string } | null;
        },
        fileCount: number,
    ): string {
        const lines: string[] = [];
        if (attached.dashboard) {
            // Surface that the layout is already known so the clarifier does
            // not ask structural questions the blueprint answers.
            lines.push(
                `- Dashboard: "${attached.dashboard.name}" (structure attached: ${attached.dashboard.structureSummary})`,
            );
        }
        for (const chart of attached.charts) {
            lines.push(
                `- Chart: "${chart.name}" (explore: ${chart.exploreName})`,
            );
        }
        if (fileCount > 0) {
            // The clarifier only sees ids — file types live on the staged S3
            // objects — so keep the wording type-agnostic.
            lines.push(
                `- ${fileCount} file${fileCount === 1 ? '' : 's'} attached (design references or documents)`,
            );
        }
        return lines.join('\n');
    }

    /**
     * Compact, model-readable summary of the project catalog used by
     * `clarifyApp`. Lists tables with up to 5 dimensions and 5 metrics
     * each, capped at 30 tables. Aim is to ground the LLM in what data
     * exists without sending the full schema YAML — keeps the call fast.
     */
    private async buildCatalogSummaryForClarifier(
        projectUuid: string,
    ): Promise<string> {
        const items =
            await this.catalogModel.getCatalogItemsSummary(projectUuid);
        const byTable = new Map<
            string,
            { dimensions: string[]; metrics: string[] }
        >();
        for (const item of items) {
            if (item.type === 'field') {
                let entry = byTable.get(item.tableName);
                if (!entry) {
                    entry = { dimensions: [], metrics: [] };
                    byTable.set(item.tableName, entry);
                }
                if (item.fieldType === 'metric') {
                    entry.metrics.push(item.name);
                } else {
                    entry.dimensions.push(item.name);
                }
            }
        }

        const MAX_TABLES = 30;
        const MAX_FIELDS = 5;
        const lines: string[] = [];
        let i = 0;
        for (const [tableName, fields] of byTable) {
            if (i >= MAX_TABLES) break;
            i += 1;
            const fmt = (label: string, list: string[]) => {
                if (list.length === 0) return `${label}: —`;
                const head = list.slice(0, MAX_FIELDS).join(', ');
                const extra = list.length > MAX_FIELDS;
                return extra
                    ? `${label}: ${head} (+${list.length - MAX_FIELDS} more)`
                    : `${label}: ${head}`;
            };
            lines.push(
                `- ${tableName} | ${fmt('dims', fields.dimensions)} | ${fmt(
                    'metrics',
                    fields.metrics,
                )}`,
            );
        }
        if (byTable.size > MAX_TABLES) {
            lines.push(
                `(... ${byTable.size - MAX_TABLES} more tables not shown)`,
            );
        }
        return lines.join('\n');
    }

    async generateApp(
        user: SessionUser,
        projectUuid: string,
        prompt: string,
        fileIds: string[],
        preGeneratedAppUuid?: string,
        charts?: AppChartReference[],
        dashboard?: AppDashboardReference,
        template?: DataAppTemplate,
        clarifications?: AppClarification[],
        spaceUuid?: string,
        claudeModelInput?: DataAppClaudeModel,
        options: GenerateAppOptions = {},
    ): Promise<GenerateAppResult> {
        const { designUuidInput, externalConnections } = options;
        await this.assertDataAppsEnabled(user);
        const organizationUuid = await this.getProjectOrgUuid(projectUuid);
        this.assertDataAppAbility(
            user,
            'create',
            organizationUuid,
            projectUuid,
            'Insufficient permissions to create data apps',
        );
        const claudeModel = await this.resolveClaudeModel(
            organizationUuid,
            claudeModelInput,
        );

        // When the caller wants the app to live in a space directly, also
        // require manage rights on that space — same gate space EDITOR/ADMIN
        // (or project admin) already pass through `manage:DataApp@space`.
        if (spaceUuid) {
            const spaceContext =
                await this.spacePermissionService.getSpaceAccessContext(
                    user.userUuid,
                    spaceUuid,
                );
            this.assertDataAppAbility(
                user,
                'manage',
                organizationUuid,
                projectUuid,
                'Insufficient permissions to create a data app in this space',
                spaceContext,
            );
        }

        AppGenerateService.validateFileIds(fileIds);

        const appUuid = preGeneratedAppUuid ?? uuidv4();
        const version = 1;

        // Resolve attachment types/filenames from the staged S3 objects so the
        // version resources can split image chips from file chips in the chat.
        let stagedFiles: StagedAppFile[] = [];
        if (fileIds.length > 0) {
            const { client: s3Client, bucket } = this.getS3Client();
            stagedFiles = await AppGenerateService.resolveStagedFiles(
                s3Client,
                bucket,
                appUuid,
                fileIds,
            );
        }

        // The pipeline gets the augmented prompt so Claude in the sandbox
        // sees the resolved intent. The version row keeps the original
        // prompt — clarifications travel separately on `resources` so the
        // chat can render the Q&A as a structured card.
        const pipelinePrompt = formatPromptWithClarifications(
            prompt,
            clarifications,
        );

        this.logger.info(
            `App ${appUuid}: generation started (model=${claudeModel}, promptLength=${prompt.length}, clarifications=${
                clarifications?.length ?? 0
            })`,
        );

        const { refs, dashboardName, dashboardBlueprint } =
            await this.collectChartReferences(
                charts,
                dashboard,
                user,
                projectUuid,
            );
        const {
            references: chartReferences,
            chartResources,
            sampleStats,
        } = await this.resolveChartReferences(refs, user, projectUuid);
        const externalConnectionResources =
            await this.resolveExternalConnectionResources(
                user,
                projectUuid,
                appUuid,
                externalConnections,
            );

        // Resolve theme: explicit pick wins, else fall back to org default.
        // `null` from the caller means "explicitly no theme" — don't fall
        // back. `undefined` means "honor the org default" (the picker sends
        // the design uuid for a non-default selection, null for the
        // "Lightdash default" / no theme choice, or omits the field
        // entirely on older clients).
        let resolvedDesignUuid: string | null = null;
        let designSnapshot: AppVersionResources['design'] = null;
        if (designUuidInput === undefined) {
            const orgDefault =
                await this.organizationDesignModel.getDefault(organizationUuid);
            if (orgDefault) {
                AppGenerateService.assertThemeWithinLimits(orgDefault);
                resolvedDesignUuid = orgDefault.designUuid;
                designSnapshot = {
                    designUuid: orgDefault.designUuid,
                    name: orgDefault.name,
                    fileCount: orgDefault.files.length,
                };
            }
        } else if (designUuidInput !== null) {
            const picked =
                await this.organizationDesignModel.findInOrganization(
                    organizationUuid,
                    designUuidInput,
                );
            if (!picked) {
                throw new ParameterError(`Theme not found: ${designUuidInput}`);
            }
            AppGenerateService.assertThemeWithinLimits(picked);
            resolvedDesignUuid = picked.designUuid;
            designSnapshot = {
                designUuid: picked.designUuid,
                name: picked.name,
                fileCount: picked.files.length,
            };
        }

        // Build resources metadata to persist with the version
        const resources: AppVersionResources = {
            ...AppGenerateService.toAttachmentResources(stagedFiles),
            charts: chartResources,
            externalConnections: externalConnectionResources,
            dashboardName,
            dashboardUuid: dashboardBlueprint?.dashboardUuid ?? null,
            clarifications: clarifications ?? [],
            claudeModel,
            design: designSnapshot,
        };

        // Persist app record so we can track status immediately. 'custom' is
        // stored as null - it's the absence of a template, not a template itself.
        const persistedTemplate =
            template && template !== 'custom' ? template : null;
        try {
            await this.appModel.createWithVersion(
                {
                    app_id: appUuid,
                    project_uuid: projectUuid,
                    created_by_user_uuid: user.userUuid,
                    template: persistedTemplate,
                    space_uuid: spaceUuid ?? null,
                    design_uuid: resolvedDesignUuid,
                },
                { version, prompt },
                'pending',
                resources,
            );
        } catch (error) {
            this.logger.error(
                `App ${appUuid}: failed to create app record: ${getErrorMessage(error)}`,
            );
            throw error;
        }

        await this.linkResolvedExternalConnections(
            appUuid,
            externalConnectionResources,
        );

        this.analytics.track({
            event: 'data_app.created',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                appUuid,
                version,
                promptLength: prompt.length,
                imageCount: stagedFiles.filter((f) => f.isImage).length,
                fileCount: stagedFiles.filter((f) => !f.isImage).length,
                template: template ?? null,
                claudeModel,
                claudeEffort: AppGenerateService.resolveClaudeEffort(version),
                samplesRequested: sampleStats.requested,
                samplesAvailable: sampleStats.available,
                clarificationCount: clarifications?.length ?? 0,
            },
        });

        await this.schedulerClient.appGeneratePipeline({
            appUuid,
            version,
            projectUuid,
            organizationUuid: user.organizationUuid!,
            userUuid: user.userUuid,
            prompt: pipelinePrompt,
            template,
            fileIds: fileIds.length > 0 ? fileIds : undefined,
            isIteration: false,
            chartReferences:
                chartReferences.length > 0 ? chartReferences : undefined,
            dashboardBlueprint: dashboardBlueprint ?? undefined,
            claudeModel,
            designUuid: resolvedDesignUuid,
        });

        return { appUuid, version };
    }

    async iterateApp(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        prompt: string,
        fileIds: string[],
        charts?: AppChartReference[],
        dashboard?: AppDashboardReference,
        claudeModelInput?: DataAppClaudeModel,
        options: GenerateAppOptions = {},
    ): Promise<GenerateAppResult> {
        const { designUuidInput, externalConnections } = options;
        await this.assertDataAppsEnabled(user);

        AppGenerateService.validateFileIds(fileIds);

        const app = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanManageApp(
            user,
            app,
            'Insufficient permissions to modify data apps',
        );

        // Resolve attachment types/filenames from the staged S3 objects so the
        // version resources can split image chips from file chips in the chat.
        let stagedFiles: StagedAppFile[] = [];
        if (fileIds.length > 0) {
            const { client: s3Client, bucket } = this.getS3Client();
            stagedFiles = await AppGenerateService.resolveStagedFiles(
                s3Client,
                bucket,
                appUuid,
                fileIds,
            );
        }

        // Resolved after the permission check so an unauthorized caller gets a
        // 403 rather than a model-visibility error. Scoped to the project's
        // organization (not the caller's) to match generateApp.
        const claudeModel = await this.resolveClaudeModel(
            await this.getProjectOrgUuid(projectUuid),
            claudeModelInput,
        );

        const externalConnectionResources = await this.linkExternalConnections(
            user,
            projectUuid,
            appUuid,
            externalConnections,
        );

        const latestVersion = await this.appModel.getLatestVersion(appUuid);
        if (
            latestVersion?.status &&
            isAppVersionInProgress(latestVersion.status)
        ) {
            throw new ParameterError(
                'A version is already building for this app',
            );
        }

        const newVersion = (latestVersion?.version ?? 0) + 1;

        this.logger.info(
            `App ${appUuid}: iteration started (version=${newVersion}, model=${claudeModel}, promptLength=${prompt.length}, designUuidInput=${
                designUuidInput === undefined
                    ? 'inherit'
                    : (designUuidInput ?? 'none')
            })`,
        );

        const { refs, dashboardName, dashboardBlueprint } =
            await this.collectChartReferences(
                charts,
                dashboard,
                user,
                projectUuid,
            );
        const {
            references: chartReferences,
            chartResources,
            sampleStats,
        } = await this.resolveChartReferences(refs, user, projectUuid);

        // Omitted designUuid means a normal content iteration that inherits
        // the app's current theme. Explicit string/null means "change the
        // app theme and run a style-only iteration".
        const isThemeChange = designUuidInput !== undefined;
        let effectiveDesignUuid: string | null = isThemeChange
            ? designUuidInput
            : app.design_uuid;
        let designSnapshot: AppVersionResources['design'] = null;
        if (effectiveDesignUuid) {
            const design =
                await this.organizationDesignModel.findInOrganization(
                    app.organization_uuid,
                    effectiveDesignUuid,
                );
            if (design) {
                // Inherited themes are copied into the sandbox on every
                // iteration too, so enforce the guardrails regardless of
                // whether this iteration is an explicit theme change.
                AppGenerateService.assertThemeWithinLimits(design);
                designSnapshot = {
                    designUuid: design.designUuid,
                    name: design.name,
                    fileCount: design.files.length,
                };
            } else if (isThemeChange) {
                throw new ParameterError(
                    `Theme not found: ${effectiveDesignUuid}`,
                );
            } else {
                // Defensive: app.design_uuid points at a missing row. Should
                // never happen given the FK is ON DELETE SET NULL, but if it
                // does, treat inherited theme as absent rather than fail.
                effectiveDesignUuid = null;
            }
        }

        const pipelinePrompt = isThemeChange
            ? AppGenerateService.buildThemeChangePrompt(
                  designSnapshot?.name ?? null,
              )
            : prompt;

        const resources: AppVersionResources = {
            ...AppGenerateService.toAttachmentResources(stagedFiles),
            charts: chartResources,
            externalConnections: externalConnectionResources,
            dashboardName,
            dashboardUuid: dashboardBlueprint?.dashboardUuid ?? null,
            clarifications: [],
            claudeModel,
            design: designSnapshot,
        };

        const carriedDependencies = await this.carryDependenciesForward(
            appUuid,
            newVersion,
            latestVersion?.dependencies,
        );

        await this.appModel.createVersion(
            appUuid,
            { version: newVersion, prompt },
            'pending',
            user.userUuid,
            resources,
            carriedDependencies,
        );

        if (isThemeChange) {
            await this.appModel.updateDesignUuid(
                appUuid,
                projectUuid,
                effectiveDesignUuid,
            );
        }

        this.analytics.track({
            event: 'data_app.iterated',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                appUuid,
                version: newVersion,
                iterationNumber: newVersion - 1,
                promptLength: prompt.length,
                imageCount: stagedFiles.filter((f) => f.isImage).length,
                fileCount: stagedFiles.filter((f) => !f.isImage).length,
                claudeModel,
                claudeEffort:
                    AppGenerateService.resolveClaudeEffort(newVersion),
                themeChanged: isThemeChange,
                designUuid: effectiveDesignUuid,
                previousVersionStatus: latestVersion?.status ?? null,
                msSinceLastVersion: latestVersion?.created_at
                    ? Date.now() - latestVersion.created_at.getTime()
                    : null,
                samplesRequested: sampleStats.requested,
                samplesAvailable: sampleStats.available,
            },
        });

        await this.schedulerClient.appGeneratePipeline({
            appUuid,
            version: newVersion,
            projectUuid,
            organizationUuid: user.organizationUuid!,
            userUuid: user.userUuid,
            prompt: pipelinePrompt,
            fileIds: fileIds.length > 0 ? fileIds : undefined,
            isIteration: true,
            chartReferences:
                chartReferences.length > 0 ? chartReferences : undefined,
            dashboardBlueprint: dashboardBlueprint ?? undefined,
            claudeModel,
            designUuid: effectiveDesignUuid,
        });

        return { appUuid, version: newVersion };
    }

    /**
     * Carry the latest version's custom dependency set forward. The dep
     * FILES must be copied under the new version's S3 prefix BEFORE the
     * row is created so a copy failure can't orphan a pending version.
     * An errored version can hold a summary without files, so walk back
     * to the newest version whose files actually exist.
     */
    private async carryDependenciesForward(
        appUuid: string,
        newVersion: number,
        latestDependencies: AppVersionDependencies | null | undefined,
    ): Promise<AppVersionDependencies | undefined> {
        if (!latestDependencies) return undefined;
        // Kill-switch: iterations restore the stored dep set, so they must
        // stop too when custom dependencies are disabled instance-wide.
        if (!this.lightdashConfig.appRuntime.customDependenciesEnabled) {
            throw new ParameterError(
                'Custom app dependencies are disabled on this instance (LIGHTDASH_APP_CUSTOM_DEPENDENCIES_ENABLED). This app declares custom packages, so it cannot be iterated until they are re-enabled.',
            );
        }
        const { client, bucket } = this.getS3Client();
        const toPrefix = versionPrefix(appUuid, newVersion);
        const candidates =
            await this.appModel.getVersionsWithDependencies(appUuid);
        let copied = false;
        for (const candidate of candidates) {
            const fromPrefix = versionPrefix(appUuid, candidate.version);
            try {
                // eslint-disable-next-line no-await-in-loop
                await Promise.all(
                    ['deps/package.json', 'deps/pnpm-lock.yaml'].map((key) =>
                        client.send(
                            new CopyObjectCommand({
                                Bucket: bucket,
                                CopySource: `${bucket}/${fromPrefix}${key}`,
                                Key: `${toPrefix}${key}`,
                            }),
                        ),
                    ),
                );
                copied = true;
                break;
            } catch (err) {
                this.logger.warn(
                    `App ${appUuid}: dependency files missing for version ${candidate.version}, trying an earlier version (${getErrorMessage(err)})`,
                );
            }
        }
        if (!copied) {
            throw new ParameterError(
                "Could not carry this app's custom dependencies forward: no stored dependency files found. Re-upload the app with 'lightdash upload --apps' to restore them.",
            );
        }
        return latestDependencies;
    }

    static readonly UPGRADE_PROMPT_LABEL = 'Upgrade to the latest app template';

    /**
     * The stored row prompt stays the short label (what chat history shows);
     * this composed instruction is what the pipeline actually sends —
     * mirrors the theme-change prompt pattern.
     */
    private static buildUpgradePrompt(body: UpgradeAppRequestBody): string {
        const candidates = (body.candidateFeatures ?? []).slice(0, 20);
        const featureStep =
            candidates.length > 0
                ? [
                      '2. These SDK features may be new to this app:',
                      ...candidates.map(
                          (f) =>
                              `   - ${f.key}: ${f.label} — ${f.description}${
                                  f.wiring
                                      ? ` [wiring needed: ${f.wiring}]`
                                      : ''
                              }`,
                      ),
                      '   Keep only the ones that BOTH exist in the SDK installed in this workspace (verify in node_modules/@lightdash/query-sdk, e.g. dist/features.js) AND would be genuinely useful for what this app does. Silently discard the rest.',
                      '   A feature marked [wiring needed] still counts as available — if it fits the app, OFFER it (the wiring happens later, only if the user asks). Remember its wiring note: it is how you implement the feature when they do.',
                      '   A candidate that is ALREADY working after this rebuild (it activates automatically on the new SDK, or the app already contains its wiring) belongs in the "Now active" section of your final message, not the ask-list.',
                  ].join('\n')
                : '2. Read SDK_FEATURES from node_modules/@lightdash/query-sdk/dist/features.js to see what is available. If that file does not exist, the installed SDK predates feature reporting — there is nothing to offer; skip the feature list entirely.';
        return [
            'This app has just been moved to the latest app template (new SDK, components, and skills).',
            'Do the following, in order:',
            '1. You cannot run shell commands — the pipeline builds the app after your turn and returns any build errors to you. Check compatibility by reading the app source against the installed SDK, and fix any breakage minimally in the source. Do not change features, content, or visual design.',
            featureStep,
            'Never infer or invent "new features" from export lists, type definitions, or guesswork — if a feature is not declared in the installed SDK feature registry, do not mention it.',
            '3. Your ENTIRE final message must be this template and nothing else — no text before it, between its parts, or after it:',
            '',
            '   The app was upgraded to the latest template successfully. [or, on failure, one plain sentence saying what broke]',
            '',
            '   Now active:',
            '   - **<feature label>** — one short phrase on what it does. [one bullet per candidate you VERIFIED is already working after the rebuild]',
            '',
            '   Newly available — ask me to add any of these:',
            '   - **<feature label>** — one short sentence on what it would do for this app.',
            '',
            '   Omit the "Now active" and/or "Newly available" sections when empty.',
            '   It is for a non-technical app owner: never describe what you checked or how, never mention files, code, or APIs, and do not discuss features outside the bullet list.',
            '   Do not implement any of the features now.',
        ].join('\n');
    }

    /**
     * Upgrade-as-iteration: rebuilds the app on the current template image.
     * The `isUpgrade` flag makes the pipeline destroy the app's sandbox
     * (carrying the Claude session best-effort) so the run cold-starts on the
     * current image with the latest source restored. Nothing is persisted
     * about freshness — the running bundle self-reports via the SDK manifest.
     */
    async upgradeApp(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        body: UpgradeAppRequestBody = {},
    ): Promise<GenerateAppResult> {
        await this.assertDataAppsEnabled(user);

        const app = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanManageApp(
            user,
            app,
            'Insufficient permissions to upgrade this data app',
        );

        const latestVersion = await this.appModel.getLatestVersion(appUuid);
        if (
            latestVersion?.status &&
            isAppVersionInProgress(latestVersion.status)
        ) {
            throw new ParameterError(
                'A version is already building for this app',
            );
        }
        const latestReady = await this.appModel.getLatestReadyVersion(appUuid);
        if (!latestReady) {
            throw new ParameterError(
                'This app has no ready version to upgrade',
            );
        }

        const newVersion = (latestVersion?.version ?? 0) + 1;
        this.logger.info(
            `App ${appUuid}: upgrade started (version=${newVersion}, reportedSdkVersion=${
                body.reportedSdkVersion ?? 'unknown'
            })`,
        );

        const carriedDependencies = await this.carryDependenciesForward(
            appUuid,
            newVersion,
            latestVersion?.dependencies,
        );

        await this.appModel.createVersion(
            appUuid,
            {
                version: newVersion,
                prompt: AppGenerateService.UPGRADE_PROMPT_LABEL,
            },
            'pending',
            user.userUuid,
            undefined,
            carriedDependencies,
        );

        this.analytics.track({
            event: 'data_app.upgrade_requested',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                appUuid,
                version: newVersion,
                reportedSdkVersion: body.reportedSdkVersion ?? null,
                reportedFeatureCount: body.reportedFeatures?.length ?? null,
                candidateFeatureKeys:
                    body.candidateFeatures?.map((f) => f.key) ?? null,
            },
        });

        await this.schedulerClient.appGeneratePipeline({
            appUuid,
            version: newVersion,
            projectUuid,
            organizationUuid: user.organizationUuid!,
            userUuid: user.userUuid,
            prompt: AppGenerateService.buildUpgradePrompt(body),
            isIteration: true,
            isUpgrade: true,
            designUuid: app.design_uuid,
        });

        return { appUuid, version: newVersion };
    }

    /**
     * Rollback action — promote an earlier ready version to a brand-new
     * ready version on top of the timeline.
     *
     * Performed end-to-end at restore time so the next iteration can resume
     * the existing sandbox without any special-case logic:
     *   1. Server-side copy every S3 object under the source version's
     *      prefix (source.tar AND every extracted dist/* asset) into the
     *      new version's prefix. The preview iframe reads the dist assets
     *      directly, so source.tar alone leaves the preview blank.
     *   2. Resume the existing sandbox (if any), wipe `/app/src`, and
     *      extract the source tarball into it. We keep the same sandbox
     *      deliberately — killing it would lose installed deps and
     *      implicitly upgrade the E2B SDK on the next start.
     *   3. Insert the new app_version row as `ready`.
     */
    async restoreVersion(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        sourceVersion: number,
    ): Promise<{ appUuid: string; version: number }> {
        await this.assertDataAppsEnabled(user);

        const app = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanManageApp(
            user,
            app,
            'Insufficient permissions to modify data apps',
        );

        const latestVersion = await this.appModel.getLatestVersion(appUuid);
        if (
            latestVersion?.status &&
            isAppVersionInProgress(latestVersion.status)
        ) {
            // An in-flight generation would publish on top of the restore
            // and silently win the version race. Refuse early.
            throw new ParameterError(
                'A version is already building for this app',
            );
        }
        if (latestVersion && latestVersion.version === sourceVersion) {
            throw new ParameterError(
                `Version ${sourceVersion} is already the latest version`,
            );
        }

        const source = await this.appModel.getVersion(appUuid, sourceVersion);
        if (!source) {
            throw new NotFoundError(
                `Version ${sourceVersion} not found for app ${appUuid}`,
            );
        }
        if (source.status !== 'ready') {
            throw new ParameterError(
                `Cannot restore version ${sourceVersion}: status is ${source.status}, expected ready`,
            );
        }

        const newVersion = (latestVersion?.version ?? 0) + 1;
        const { client: s3Client, bucket } = this.getS3Client();

        // 1. Copy every S3 object under the source version's prefix.
        const copiedKeys = await AppGenerateService.copyVersionS3Prefix(
            s3Client,
            bucket,
            { appUuid, version: sourceVersion },
            { appUuid, version: newVersion },
        );

        // 2. Resync the running sandbox so the next iteration sees the
        // restored working tree. Skipped when no sandbox exists yet — the
        // standard cold-start path will extract source.tar from S3 on its
        // own.
        if (app.sandbox_id) {
            let sandbox: SandboxHandle | null = null;
            try {
                const copilot =
                    await this.orgAiCopilotConfigResolver.getClaudeCodeConfig(
                        app.organization_uuid,
                    );
                const resumed = await this.resumeSandbox(
                    app.sandbox_id,
                    appUuid,
                    copilot,
                );
                sandbox = resumed.sandbox;
                await this.resyncSandboxFromS3(
                    sandbox,
                    s3Client,
                    bucket,
                    appUuid,
                    sourceVersion,
                );
                // Best-effort: leave a breadcrumb in the persistent Claude
                // session so the next iteration's `--continue` sees that
                // the working tree was reset and doesn't try to diff
                // against code we've undone. Failures here don't fail the
                // restore — worst case the next reply is mildly confused.
                await this.notifyClaudeOfRestore(
                    sandbox,
                    appUuid,
                    sourceVersion,
                    copilot,
                );
            } catch (error) {
                // A half-synced sandbox would corrupt the next iteration —
                // surface the failure and roll back the S3 copy.
                await this.cleanupRestoredS3Keys(
                    s3Client,
                    bucket,
                    appUuid,
                    copiedKeys,
                );
                throw error;
            } finally {
                if (sandbox) {
                    await this.suspendSandbox(app.sandbox_id, sandbox, appUuid);
                }
            }
        }

        // 3. Insert the new version
        await this.appModel.createVersion(
            appUuid,
            {
                version: newVersion,
                prompt: `Restore version ${sourceVersion}`,
            },
            'ready',
            user.userUuid,
            source.resources ?? undefined,
            source.dependencies ?? undefined,
            // A data app viz is only listed while its latest ready version
            // declares a schema, so dropping it here delists the viz and
            // strips the contract from every chart bound to it.
            source.viz_schema ?? undefined,
        );
        await this.appModel.updateStatusMessage(
            appUuid,
            newVersion,
            `Restored from version ${sourceVersion}`,
        );

        this.analytics.track({
            event: 'data_app.version.restored',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                appUuid,
                version: newVersion,
                restoredFromVersion: sourceVersion,
            },
        });

        this.logger.info(
            `App ${appUuid}: restored version ${sourceVersion} as ${newVersion} (user=${user.userUuid}, copied ${copiedKeys.length} S3 object(s))`,
        );

        return { appUuid, version: newVersion };
    }

    /**
     * Server-side copy every object under the source version's S3 prefix
     * into the target version's S3 prefix. Supports both same-app (restore)
     * and cross-app (duplicate) copies. Returns the list of destination keys
     * so the caller can roll back on later failure.
     */
    private static async copyVersionS3Prefix(
        s3Client: S3Client,
        bucket: string,
        source: { appUuid: string; version: number },
        target: { appUuid: string; version: number },
    ): Promise<string[]> {
        const sourcePrefix = `apps/${source.appUuid}/versions/${source.version}/`;
        const destinationPrefix = `apps/${target.appUuid}/versions/${target.version}/`;
        const copiedKeys: string[] = [];

        let continuationToken: string | undefined;
        /* eslint-disable no-await-in-loop */
        do {
            const listResponse = await s3Client.send(
                new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: sourcePrefix,
                    ContinuationToken: continuationToken,
                }),
            );

            const sourceKeys = (listResponse.Contents ?? [])
                .map((obj) => obj.Key)
                .filter((key): key is string => typeof key === 'string');

            const pageCopies = await Promise.all(
                sourceKeys.map(async (sourceKey) => {
                    const relativePath = sourceKey.slice(sourcePrefix.length);
                    const destinationKey = `${destinationPrefix}${relativePath}`;
                    await s3Client.send(
                        new CopyObjectCommand({
                            Bucket: bucket,
                            CopySource: `/${bucket}/${sourceKey}`,
                            Key: destinationKey,
                        }),
                    );
                    return destinationKey;
                }),
            );
            copiedKeys.push(...pageCopies);

            continuationToken = listResponse.IsTruncated
                ? listResponse.NextContinuationToken
                : undefined;
        } while (continuationToken);
        /* eslint-enable no-await-in-loop */

        return copiedKeys;
    }

    /**
     * Force the sandbox's `/app/src/**` to exactly match the source
     * tarball stored for `version`. Used at restore time so the running
     * sandbox reflects the restored working tree before the next
     * iteration starts.
     */
    private async resyncSandboxFromS3(
        sandbox: SandboxHandle,
        s3Client: S3Client,
        bucket: string,
        appUuid: string,
        version: number,
    ): Promise<void> {
        // -mindepth 1 keeps the directory itself; the source.tar expects
        // `src/` to already exist as the extraction root.
        const wipe = await sandbox.commands.run(
            'find /app/src -mindepth 1 -delete',
            { timeoutMs: 30_000 },
        );
        if (wipe.exitCode !== 0) {
            throw new Error(
                `Failed to wipe /app/src before restore (exit ${wipe.exitCode}): ${wipe.stderr}`,
            );
        }

        const sourceKey = `apps/${appUuid}/versions/${version}/source.tar`;
        const response = await s3Client.send(
            new GetObjectCommand({ Bucket: bucket, Key: sourceKey }),
        );
        const stream = response.Body as Readable;
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const tarBuffer = Buffer.concat(chunks);

        // The original packaging step writes /tmp/source.tar inside the
        // sandbox during build, owned by the build user with strict perms.
        // files.write to the same path then fails with EACCES. Stage to a
        // restore-scoped path instead so we never collide with build state.
        const stagedPath = `/tmp/source-restore-${version}.tar`;
        const cleanup = await sandbox.commands.run(`rm -f ${stagedPath}`, {
            timeoutMs: 5_000,
        });
        if (cleanup.exitCode !== 0) {
            throw new Error(
                `Failed to clear staged tarball path ${stagedPath} (exit ${cleanup.exitCode}): ${cleanup.stderr}`,
            );
        }
        await sandbox.files.write(stagedPath, tarBuffer);
        const extractResult = await sandbox.commands.run(
            `tar -xf ${stagedPath} -C /app && rm -f ${stagedPath}`,
            { timeoutMs: 60_000 },
        );
        if (extractResult.exitCode !== 0) {
            throw new Error(
                `Failed to extract restore tarball (exit ${extractResult.exitCode}): ${extractResult.stderr}`,
            );
        }

        this.logger.info(
            `App ${appUuid}: sandbox /app/src resynced to version ${version} (tarBytes=${tarBuffer.length})`,
        );
    }

    /**
     * Append a short "version X was restored" notice to the persistent
     * Claude session via `--continue -p`. Costs one round-trip to the
     * model and leaves Claude with a coherent picture of why its working
     * tree changed under it.
     *
     * Failures (missing API key, no session yet, model error) are logged
     * and swallowed — the restore is still well-formed without the FYI;
     * the user's next prompt will simply not benefit from the heads-up.
     */
    private async notifyClaudeOfRestore(
        sandbox: SandboxHandle,
        appUuid: string,
        sourceVersion: number,
        copilot: CopilotConfig,
    ): Promise<void> {
        let claudeCodeEnv: Record<string, string>;
        try {
            claudeCodeEnv = AppGenerateService.getClaudeCodeEnv(copilot);
        } catch (error) {
            this.logger.warn(
                `App ${appUuid}: skipping restore FYI — ${getErrorMessage(error)}`,
            );
            return;
        }

        const noticePath = `/tmp/restore-notice-${sourceVersion}.txt`;
        const notice =
            `[System notice] The user just restored an older version of this app (version ${sourceVersion}). ` +
            `The working tree in /app/src has been reset to match that version, ` +
            `so the code now on disk may differ from what you remember writing. ` +
            `This is informational only — no action required. ` +
            `Reply with a brief acknowledgment.`;

        try {
            await sandbox.commands.run(`rm -f ${noticePath}`, {
                timeoutMs: 5_000,
            });
            await sandbox.files.write(noticePath, notice);
            const result = await sandbox.commands.run(
                `cat ${noticePath} | claude --continue -p --model sonnet; rm -f ${noticePath}`,
                {
                    cwd: '/app',
                    timeoutMs: 60_000,
                    envs: claudeCodeEnv,
                },
            );
            if (result.exitCode !== 0) {
                // `--continue` fails when no session exists yet (e.g.
                // sandbox hasn't generated anything before this restore).
                // Best-effort: log and move on.
                this.logger.warn(
                    `App ${appUuid}: restore FYI to Claude failed (exit ${result.exitCode}): ${AppGenerateService.truncateEnd(result.stderr, 500)}`,
                );
                return;
            }
            this.logger.info(
                `App ${appUuid}: notified Claude session of restore (sourceVersion=${sourceVersion})`,
            );
        } catch (error) {
            this.logger.warn(
                `App ${appUuid}: restore FYI to Claude errored: ${getErrorMessage(error)}`,
            );
        }
    }

    /**
     * Best-effort delete of objects copied during a failed restore. The
     * original error is what the caller surfaces — leftover S3 objects are
     * harmless, so cleanup failures are logged and swallowed.
     */
    private async cleanupRestoredS3Keys(
        s3Client: S3Client,
        bucket: string,
        appUuid: string,
        keys: string[],
    ): Promise<void> {
        if (keys.length === 0) return;
        try {
            // DeleteObjects caps at 1000 keys per call. The current dist
            // payload is well under that — chunking is defensive against
            // future templates that inflate the asset count. The chunks
            // are independent so we fire them in parallel.
            const chunks: { Key: string }[][] = [];
            for (let i = 0; i < keys.length; i += 1000) {
                chunks.push(keys.slice(i, i + 1000).map((Key) => ({ Key })));
            }
            await Promise.all(
                chunks.map((chunk) =>
                    s3Client.send(
                        new DeleteObjectsCommand({
                            Bucket: bucket,
                            Delete: { Objects: chunk, Quiet: true },
                        }),
                    ),
                ),
            );
        } catch (cleanupError) {
            this.logger.warn(
                `App ${appUuid}: failed to clean up ${keys.length} orphaned restore object(s): ${getErrorMessage(cleanupError)}`,
            );
        }
    }

    /**
     * Build the `resources` for a copied version (duplicate or promotion).
     * Carries the chart/dashboard refs and Claude model from the source, but
     * drops images and clarifications — both are scoped to the source app and
     * don't survive the copy. The visual result is preserved because bundled
     * images live in the copied dist assets, not in `resources.images`.
     */
    private static buildCopiedResources(
        sourceResources: AppVersionResources | null,
    ): AppVersionResources {
        return {
            images: [],
            charts: sourceResources?.charts ?? [],
            externalConnections: sourceResources?.externalConnections ?? [],
            dashboardName: sourceResources?.dashboardName ?? null,
            dashboardUuid: sourceResources?.dashboardUuid ?? null,
            clarifications: [],
            ...(sourceResources?.claudeModel
                ? { claudeModel: sourceResources.claudeModel }
                : {}),
        };
    }

    /**
     * Resolve the upstream (production) project a preview app can be promoted
     * into, throwing when the app's project is not a preview linked to an
     * upstream. Returns the upstream project's uuid, name and org uuid.
     */
    private async getUpstreamProjectForPromotion(projectUuid: string): Promise<{
        upstreamProjectUuid: string;
        upstreamProjectName: string;
        upstreamOrganizationUuid: string;
    }> {
        const project = await this.projectModel.getSummary(projectUuid);
        if (!project.upstreamProjectUuid) {
            throw new ParameterError(
                'Data apps can only be promoted from a preview project linked to an upstream project',
            );
        }
        const upstreamProject = await this.projectModel.getSummary(
            project.upstreamProjectUuid,
        );
        return {
            upstreamProjectUuid: upstreamProject.projectUuid,
            upstreamProjectName: upstreamProject.name,
            upstreamOrganizationUuid: upstreamProject.organizationUuid,
        };
    }

    /**
     * Find the live production app a preview app is currently linked to, or
     * undefined when there is none (never promoted, or the production app was
     * deleted). The link lives on the preview row as `upstream_app_uuid`; we
     * additionally guard that it still points into the expected upstream
     * project so a stale link can never resolve to the wrong app.
     */
    private async findLinkedUpstreamApp(
        previewApp: Pick<DbApp, 'upstream_app_uuid'>,
        upstreamProjectUuid: string,
    ): Promise<(DbApp & { organization_uuid: string }) | undefined> {
        if (!previewApp.upstream_app_uuid) {
            return undefined;
        }
        const upstreamApp = await this.appModel.findAppByUuid(
            previewApp.upstream_app_uuid,
        );
        if (!upstreamApp || upstreamApp.project_uuid !== upstreamProjectUuid) {
            return undefined;
        }
        return upstreamApp;
    }

    /**
     * Preview what promoting a data app into its upstream project will do —
     * whether it creates a new production app or updates an existing one, and
     * which space it will land in. Read-only; drives the confirmation dialog.
     */
    async getPromoteAppDiff(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
    ): Promise<PromoteAppDiff> {
        await this.assertDataAppsEnabled(user);
        const sourceApp = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanManageApp(
            user,
            sourceApp,
            'Insufficient permissions to promote this data app',
        );

        const { upstreamProjectUuid, upstreamProjectName } =
            await this.getUpstreamProjectForPromotion(projectUuid);

        const upstreamApp = await this.findLinkedUpstreamApp(
            sourceApp,
            upstreamProjectUuid,
        );

        const space = sourceApp.space_uuid
            ? await this.spaceModel.getSpaceSummary(sourceApp.space_uuid)
            : null;

        return {
            action: upstreamApp ? 'update' : 'create',
            upstreamProjectUuid,
            upstreamProjectName,
            upstreamAppUuid: upstreamApp?.app_id ?? null,
            space: space ? { name: space.name, path: space.path } : null,
        };
    }

    /**
     * Promote a data app from a preview project into its upstream (production)
     * project. The latest ready version is snapshotted as a single new version
     * in production: a fresh app on first promotion, or an appended version on
     * the linked production app on follow-up promotions. Built S3 artifacts are
     * server-side copied into the production app's prefix; the source app is
     * never modified beyond recording the upstream link.
     *
     * Out of scope (v1): chart references in `resources.charts` keep their
     * preview uuids — the app renders (artifacts are self-contained) but
     * re-iterating in production won't resolve them.
     */
    async promoteApp(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
    ): Promise<{
        appUuid: string;
        projectUuid: string;
        version: number;
        action: PromoteAppAction;
    }> {
        await this.assertDataAppsEnabled(user);

        const sourceApp = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanManageApp(
            user,
            sourceApp,
            'Insufficient permissions to promote this data app',
        );

        const {
            upstreamProjectUuid,
            upstreamProjectName,
            upstreamOrganizationUuid,
        } = await this.getUpstreamProjectForPromotion(projectUuid);

        // Authoring rights on the upstream project itself — viewers of the
        // preview must not be able to write into production.
        this.assertDataAppAbility(
            user,
            'create',
            upstreamOrganizationUuid,
            upstreamProjectUuid,
            'Insufficient permissions to promote into the upstream project',
        );

        const sourceVersion = await this.appModel.getLatestReadyVersion(
            sourceApp.app_id,
        );
        if (!sourceVersion) {
            throw new ParameterError(
                'Cannot promote an app that has no successful version',
            );
        }

        // Resolve the upstream space (creating it + ancestors if missing) so
        // the production app mirrors the preview app's placement. Spaceless
        // apps land at the project root.
        const targetSpaceUuid = sourceApp.space_uuid
            ? await this.promoteService.getOrCreateUpstreamSpace(
                  user,
                  sourceApp.space_uuid,
                  upstreamProjectUuid,
              )
            : null;

        // Designs are org-scoped and the preview shares the upstream org, so
        // the design carries over — but guard against a since-deleted design.
        const targetDesignUuid =
            sourceApp.design_uuid &&
            (await this.organizationDesignModel.findInOrganization(
                upstreamOrganizationUuid,
                sourceApp.design_uuid,
            ))
                ? sourceApp.design_uuid
                : null;

        const resources = AppGenerateService.buildCopiedResources(
            sourceVersion.resources ?? null,
        );
        // Frame the production version's chat bubble like a duplicate's: the
        // verb "Promote" plus a markdown link (rendered as an anchor by
        // ChatMessageContent) back to the preview version it came from, for
        // provenance.
        const sourceDisplayName = sourceApp.name || 'untitled app';
        const sourcePreviewPath = `/projects/${projectUuid}/apps/${sourceApp.app_id}/versions/${sourceVersion.version}/view`;
        const prompt = `Promote [${sourceDisplayName}](${sourcePreviewPath})`;
        const { client: s3Client, bucket } = this.getS3Client();

        // Re-read the link immediately before branching to narrow (not fully
        // close) the window where two concurrent first-promotions could both
        // create a production app. A duplicate is a rare, recoverable outcome.
        const upstreamApp = await this.findLinkedUpstreamApp(
            sourceApp,
            upstreamProjectUuid,
        );

        const metadata = {
            name: sourceApp.name,
            description: sourceApp.description,
            space_uuid: targetSpaceUuid,
            design_uuid: targetDesignUuid,
        };

        const action: PromoteAppAction = upstreamApp ? 'update' : 'create';
        const targetAppUuid = upstreamApp?.app_id ?? uuidv4();
        const targetVersion = upstreamApp
            ? ((await this.appModel.getLatestVersion(targetAppUuid))?.version ??
                  0) + 1
            : 1;

        const copiedKeys = await AppGenerateService.copyVersionS3Prefix(
            s3Client,
            bucket,
            { appUuid: sourceApp.app_id, version: sourceVersion.version },
            { appUuid: targetAppUuid, version: targetVersion },
        );

        try {
            if (upstreamApp) {
                await this.appModel.createVersion(
                    targetAppUuid,
                    { version: targetVersion, prompt },
                    'ready',
                    user.userUuid,
                    resources,
                    undefined,
                    sourceVersion.viz_schema ?? undefined,
                );
                await this.appModel.syncPromotedApp(targetAppUuid, metadata);
            } else {
                await this.appModel.createWithVersion(
                    {
                        app_id: targetAppUuid,
                        project_uuid: upstreamProjectUuid,
                        created_by_user_uuid: user.userUuid,
                        template: sourceApp.template,
                        ...metadata,
                    },
                    { version: targetVersion, prompt },
                    'ready',
                    resources,
                    undefined,
                    sourceVersion.viz_schema ?? undefined,
                );
                await this.appModel.setUpstreamAppUuid(
                    sourceApp.app_id,
                    targetAppUuid,
                );
            }
            await this.appModel.updateStatusMessage(
                targetAppUuid,
                targetVersion,
                `Promoted to ${upstreamProjectName}`,
            );
        } catch (error) {
            // DB write failed — drop the orphaned S3 copy. On the update path
            // the copy targets a new (unreferenced) version prefix, so it is
            // always safe to delete. Cleanup failures are logged and swallowed.
            await this.cleanupRestoredS3Keys(
                s3Client,
                bucket,
                targetAppUuid,
                copiedKeys,
            );
            throw error;
        }

        // Re-establish external-connection links on the production app by
        // slug: preview connections are clones that keep the upstream slug,
        // so each source link maps back to the same-slug upstream connection.
        // Links to connections that exist only in the preview are skipped —
        // there is nothing in production to point them at.
        const sourceLinks = await this.externalConnectionModel.listAppLinks(
            sourceApp.app_id,
        );
        const upstreamLinks: AppExternalConnectionReference[] = [];
        for (const link of sourceLinks) {
            const upstreamConnection =
                // eslint-disable-next-line no-await-in-loop
                await this.externalConnectionModel.findBySlug(
                    upstreamProjectUuid,
                    upstreamOrganizationUuid,
                    link.connection.slug,
                );
            if (!upstreamConnection) {
                this.logger.warn(
                    `App ${targetAppUuid}: skipping external connection link "${link.alias}" — no connection with slug "${link.connection.slug}" in upstream project ${upstreamProjectUuid}`,
                );
                // eslint-disable-next-line no-continue
                continue;
            }
            upstreamLinks.push({
                externalConnectionUuid:
                    upstreamConnection.externalConnectionUuid,
                alias: link.alias,
            });
        }
        await this.externalConnectionModel.replaceAppLinks(
            targetAppUuid,
            upstreamLinks,
        );

        this.analytics.track({
            event: 'data_app.promoted',
            userId: user.userUuid,
            properties: {
                organizationId: upstreamOrganizationUuid,
                projectId: upstreamProjectUuid,
                appUuid: targetAppUuid,
                version: targetVersion,
                action,
                promotedFromAppUuid: sourceApp.app_id,
                promotedFromProjectId: projectUuid,
            },
        });

        this.logger.info(
            `App ${sourceApp.app_id} v${sourceVersion.version}: promoted (${action}) to app ${targetAppUuid} v${targetVersion} in project ${upstreamProjectUuid} (user=${user.userUuid}, copied ${copiedKeys.length} S3 object(s))`,
        );

        return {
            appUuid: targetAppUuid,
            projectUuid: upstreamProjectUuid,
            version: targetVersion,
            action,
        };
    }

    /**
     * Promote every data app referenced by a dashboard's `DATA_APP` tiles into
     * the dashboard's upstream project, returning a source→upstream uuid map so
     * the caller can remap the tiles. Each app is promoted with the same
     * single-app `promoteApp` flow (S3 copy, version, upstream link).
     *
     * Soft-deleted apps (a tile can still reference one — it renders as a
     * "no longer exists" placeholder) are skipped rather than failing the whole
     * dashboard promotion; their tiles keep their original reference.
     *
     * Apps are promoted SEQUENTIALLY, not in parallel: each `promoteApp`
     * resolves and lazily creates the app's upstream space via
     * `getOrCreateUpstreamSpace`, whose check-then-create is not atomic and is
     * not backed by a slug/path unique constraint. Two apps sharing an
     * un-promoted space (or ancestor) run in parallel would both create it,
     * producing duplicate upstream spaces. Serializing means the second app
     * sees the space the first one created. Promotion is a cold, user-initiated
     * path and app counts are small, so the lost parallelism is irrelevant.
     *
     * Used by `PromoteService.upsertDataApps` during dashboard promotion.
     */
    async promoteAppsForDashboard(
        user: SessionUser,
        projectUuid: string,
        appUuids: string[],
    ): Promise<{ sourceAppUuid: string; upstreamAppUuid: string }[]> {
        if (appUuids.length === 0) {
            return [];
        }
        await this.assertDataAppsEnabled(user);

        const results: { sourceAppUuid: string; upstreamAppUuid: string }[] =
            [];
        /* eslint-disable no-await-in-loop */
        for (const appUuid of appUuids) {
            const sourceApp = await this.appModel.findApp(appUuid, projectUuid);
            if (sourceApp) {
                const { appUuid: upstreamAppUuid } = await this.promoteApp(
                    user,
                    projectUuid,
                    appUuid,
                );
                results.push({ sourceAppUuid: appUuid, upstreamAppUuid });
            }
        }
        /* eslint-enable no-await-in-loop */

        return results;
    }

    /**
     * Read-only counterpart to `promoteAppsForDashboard`: resolve, per referenced
     * app, whether promotion would create a new production app or update the
     * linked one (plus its name) so the dashboard promote diff can list apps
     * alongside charts. Soft-deleted apps are skipped — there is nothing to
     * promote for a placeholder tile.
     */
    async getDataAppPromoteChanges(
        user: SessionUser,
        projectUuid: string,
        appUuids: string[],
    ): Promise<{ uuid: string; name: string; action: PromoteAppAction }[]> {
        if (appUuids.length === 0) {
            return [];
        }
        await this.assertDataAppsEnabled(user);

        const { upstreamProjectUuid } =
            await this.getUpstreamProjectForPromotion(projectUuid);

        const changes = await Promise.all(
            appUuids.map(async (appUuid) => {
                const sourceApp = await this.appModel.findApp(
                    appUuid,
                    projectUuid,
                );
                if (!sourceApp) {
                    return null;
                }
                await this.assertCanManageApp(
                    user,
                    sourceApp,
                    'Insufficient permissions to promote this data app',
                );
                const upstreamApp = await this.findLinkedUpstreamApp(
                    sourceApp,
                    upstreamProjectUuid,
                );
                return {
                    uuid: sourceApp.app_id,
                    name: sourceApp.name,
                    action: (upstreamApp
                        ? 'update'
                        : 'create') as PromoteAppAction,
                };
            }),
        );

        return changes.filter(
            (change): change is NonNullable<typeof change> => change !== null,
        );
    }

    /**
     * Duplicate an existing app the user can view into a new personal app
     * owned by the requester. The new app starts at v1 with the source's
     * latest ready version's S3 artifacts (dist.tar + source.tar + any
     * extracted assets) server-side copied into the new prefix. No sandbox
     * is created — a fresh one spins up lazily on the first iteration via
     * the standard restore-from-tarball path.
     *
     * Carried over: template, chart/dashboard resource refs (UUIDs only),
     * claudeModel, prompt (source's latest ready version's text), and the
     * description verbatim. Dropped: images, prior version history, prior
     * clarifications, sandbox, pin state.
     */
    async duplicateApp(
        user: SessionUser,
        projectUuid: string,
        sourceAppUuid: string,
    ): Promise<GenerateAppResult> {
        await this.assertDataAppsEnabled(user);

        const sourceApp = await this.appModel.getApp(
            sourceAppUuid,
            projectUuid,
        );
        await this.assertCanViewApp(user, sourceApp);

        // The duplicate lands as a personal app in the same project. We need
        // `create:DataApp` on the project itself — viewers who can read a
        // shared app but can't author new ones must not be able to fork it.
        this.assertDataAppAbility(
            user,
            'create',
            sourceApp.organization_uuid,
            projectUuid,
            'Insufficient permissions to duplicate this data app',
        );

        const sourceVersion = await this.appModel.getLatestReadyVersion(
            sourceApp.app_id,
        );
        if (!sourceVersion) {
            throw new ParameterError(
                'Cannot duplicate an app that has no successful version',
            );
        }

        const sourceLinks = await this.externalConnectionModel.listAppLinks(
            sourceApp.app_id,
        );
        const externalConnectionResources: AppVersionExternalConnectionResource[] =
            sourceLinks.map((link) => ({
                externalConnectionUuid: link.connection.externalConnectionUuid,
                name: link.connection.name,
                alias: link.alias,
            }));

        const resources: AppVersionResources = {
            ...AppGenerateService.buildCopiedResources(
                sourceVersion.resources ?? null,
            ),
            externalConnections: externalConnectionResources,
        };

        const newAppUuid = uuidv4();
        const newVersion = 1;
        const { client: s3Client, bucket } = this.getS3Client();

        const copiedKeys = await AppGenerateService.copyVersionS3Prefix(
            s3Client,
            bucket,
            { appUuid: sourceApp.app_id, version: sourceVersion.version },
            { appUuid: newAppUuid, version: newVersion },
        );

        // The user-facing chat collapses everything before the duplicate
        // into a single v1 bubble. The original prompt would imply we're
        // about to re-execute it; instead, frame the bubble as "copy this
        // app" with a markdown link to the source's preview at the version
        // we forked from, and a static assistant reply confirming success.
        const sourceDisplayName = sourceApp.name || 'untitled app';
        const sourcePreviewPath = `/projects/${projectUuid}/apps/${sourceApp.app_id}/versions/${sourceVersion.version}/view`;
        const duplicatePrompt = `Duplicate [${sourceDisplayName}](${sourcePreviewPath})`;

        try {
            await this.appModel.createWithVersion(
                {
                    app_id: newAppUuid,
                    project_uuid: projectUuid,
                    created_by_user_uuid: user.userUuid,
                    name: `Duplicate of ${sourceDisplayName}`,
                    description: sourceApp.description,
                    template: sourceApp.template,
                    space_uuid: null,
                },
                { version: newVersion, prompt: duplicatePrompt },
                'ready',
                resources,
                undefined,
                sourceVersion.viz_schema ?? undefined,
            );
            await this.linkResolvedExternalConnections(
                newAppUuid,
                externalConnectionResources,
            );
            await this.appModel.updateStatusMessage(
                newAppUuid,
                newVersion,
                'Duplicate ready!',
            );
        } catch (error) {
            // The new app row failed to insert; drop the orphaned S3 copy so
            // we don't leak storage. Cleanup failures are swallowed (logged
            // by the helper) — orphans are harmless.
            await this.cleanupRestoredS3Keys(
                s3Client,
                bucket,
                newAppUuid,
                copiedKeys,
            );
            throw error;
        }

        this.analytics.track({
            event: 'data_app.duplicated',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                appUuid: newAppUuid,
                duplicatedFromAppUuid: sourceApp.app_id,
                duplicatedFromVersion: sourceVersion.version,
            },
        });

        this.logger.info(
            `App ${newAppUuid}: duplicated from app ${sourceApp.app_id} v${sourceVersion.version} (user=${user.userUuid}, copied ${copiedKeys.length} S3 object(s))`,
        );

        return { appUuid: newAppUuid, version: newVersion };
    }

    /**
     * Duplicate every data app from an upstream project into a freshly created
     * preview project, then repoint the preview's data-app dashboard tiles onto
     * the duplicated apps. Called once, system-initiated, during preview
     * creation (`ProjectService.copyContentOnPreview`) right after the rest of
     * the project content has been copied.
     *
     * Each app is copied like a standalone duplicate (latest ready version's S3
     * artifacts server-side copied into a new v1, no sandbox) with two
     * differences:
     *  - it lands in the preview's mirror of the source app's space (or as a
     *    personal app for spaceless source apps), using the source→preview
     *    space map produced by `ProjectModel.duplicateContent`; and
     *  - its `upstream_app_uuid` is set back to the source app, so iterating in
     *    the preview and then promoting *updates* the original upstream app
     *    rather than creating a duplicate — the round trip that pairs with
     *    `promoteApp`.
     *
     * Best-effort and non-fatal: a per-app failure is logged and skipped so it
     * cannot block preview creation; tiles for a skipped app keep their
     * original upstream reference (rendered read-through, as before this
     * feature). No per-app permission checks — this is a privileged copy of the
     * whole project, exactly like `ProjectModel.duplicateContent`.
     */
    async duplicateAppsForPreview(
        sourceProjectUuid: string,
        previewProjectUuid: string,
        spaceMapping: { sourceSpaceUuid: string; previewSpaceUuid: string }[],
    ): Promise<void> {
        const sourceApps =
            await this.appModel.listAppsByProject(sourceProjectUuid);
        if (sourceApps.length === 0) {
            return;
        }

        const previewProject =
            await this.projectModel.getSummary(previewProjectUuid);
        const previewSpaceBySource = new Map(
            spaceMapping.map((s) => [s.sourceSpaceUuid, s.previewSpaceUuid]),
        );
        const { client: s3Client, bucket } = this.getS3Client();

        let connectionUuidMap = new Map<string, string>();
        try {
            connectionUuidMap =
                await this.externalConnectionModel.copyConnectionsToProject(
                    sourceProjectUuid,
                    previewProjectUuid,
                );
        } catch (error) {
            this.logger.error(
                `Preview duplication: failed to copy external connections from ${sourceProjectUuid} into preview ${previewProjectUuid}: ${getErrorMessage(
                    error,
                )}`,
            );
        }

        const mappings: { sourceAppUuid: string; previewAppUuid: string }[] =
            [];

        /* eslint-disable no-await-in-loop */
        for (const sourceApp of sourceApps) {
            const previewAppUuid = await this.copyAppForPreview(
                sourceApp,
                sourceProjectUuid,
                previewProjectUuid,
                previewProject.organizationUuid,
                previewSpaceBySource,
                connectionUuidMap,
                s3Client,
                bucket,
            );
            if (previewAppUuid) {
                mappings.push({
                    sourceAppUuid: sourceApp.app_id,
                    previewAppUuid,
                });
            }
        }
        /* eslint-enable no-await-in-loop */

        // Repoint the preview's dashboard tiles (copied still pointing at the
        // upstream apps) onto the duplicated apps.
        await this.appModel.remapPreviewDashboardTileApps(
            previewProjectUuid,
            mappings,
        );

        this.logger.info(
            `Preview duplication: copied ${mappings.length}/${sourceApps.length} data app(s) from project ${sourceProjectUuid} into preview ${previewProjectUuid}`,
        );
    }

    /**
     * Copy a single upstream app into the preview project, returning the new
     * app's uuid — or null when there is nothing to copy (no ready version) or
     * the copy failed (logged, S3 cleaned up). Failures are non-fatal so one
     * bad app can't abort the whole preview duplication.
     */
    private async copyAppForPreview(
        sourceApp: DbApp,
        sourceProjectUuid: string,
        previewProjectUuid: string,
        previewOrganizationUuid: string,
        previewSpaceBySource: Map<string, string>,
        connectionUuidMap: Map<string, string>,
        s3Client: S3Client,
        bucket: string,
    ): Promise<string | null> {
        const sourceVersion = await this.appModel.getLatestReadyVersion(
            sourceApp.app_id,
        );
        if (!sourceVersion) {
            // No successful build to copy — nothing to render in the preview.
            // The tile (if any) keeps its read-through reference.
            return null;
        }

        const sourceLinks = await this.externalConnectionModel.listAppLinks(
            sourceApp.app_id,
        );
        const externalConnectionResources: AppVersionExternalConnectionResource[] =
            sourceLinks.flatMap((link) => {
                const previewConnectionUuid = connectionUuidMap.get(
                    link.connection.externalConnectionUuid,
                );
                return previewConnectionUuid
                    ? [
                          {
                              externalConnectionUuid: previewConnectionUuid,
                              name: link.connection.name,
                              alias: link.alias,
                          },
                      ]
                    : [];
            });

        // Place the copy in the preview's mirror of the source space. Spaceless
        // (personal) apps stay personal. A source space missing from the map
        // shouldn't happen (all spaces are copied first) but falls back to a
        // personal app rather than failing the copy.
        const previewSpaceUuid = sourceApp.space_uuid
            ? (previewSpaceBySource.get(sourceApp.space_uuid) ?? null)
            : null;
        if (sourceApp.space_uuid && !previewSpaceUuid) {
            this.logger.warn(
                `Preview duplication: source space ${sourceApp.space_uuid} for app ${sourceApp.app_id} not found in preview ${previewProjectUuid}; copying as a personal app`,
            );
        }

        // Designs are org-scoped and the preview shares the source org, so the
        // design carries over — but guard against a since-deleted one.
        const targetDesignUuid =
            sourceApp.design_uuid &&
            (await this.organizationDesignModel.findInOrganization(
                previewOrganizationUuid,
                sourceApp.design_uuid,
            ))
                ? sourceApp.design_uuid
                : null;

        const resources: AppVersionResources = {
            ...AppGenerateService.buildCopiedResources(
                sourceVersion.resources ?? null,
            ),
            externalConnections: externalConnectionResources,
        };

        const newAppUuid = uuidv4();
        const newVersion = 1;

        const sourceDisplayName = sourceApp.name || 'untitled app';
        const sourcePreviewPath = `/projects/${sourceProjectUuid}/apps/${sourceApp.app_id}/versions/${sourceVersion.version}/view`;
        const prompt = `Duplicate [${sourceDisplayName}](${sourcePreviewPath})`;

        // Keep the S3 copy inside the try so an S3 failure is per-app (logged
        // and skipped, like a DB failure) instead of throwing out of the loop
        // and aborting the remaining apps and the tile remap.
        let copiedKeys: string[] = [];

        try {
            copiedKeys = await AppGenerateService.copyVersionS3Prefix(
                s3Client,
                bucket,
                { appUuid: sourceApp.app_id, version: sourceVersion.version },
                { appUuid: newAppUuid, version: newVersion },
            );
            await this.appModel.createWithVersion(
                {
                    app_id: newAppUuid,
                    project_uuid: previewProjectUuid,
                    // Preserve the original author so personal apps stay owned
                    // by their creator inside the preview.
                    created_by_user_uuid: sourceApp.created_by_user_uuid,
                    name: sourceApp.name,
                    slug: sourceApp.slug,
                    description: sourceApp.description,
                    template: sourceApp.template,
                    space_uuid: previewSpaceUuid,
                    design_uuid: targetDesignUuid,
                },
                { version: newVersion, prompt },
                'ready',
                resources,
                undefined,
                sourceVersion.viz_schema ?? undefined,
            );
            // Link back to the upstream app so a later promote updates it
            // instead of creating a duplicate.
            await this.appModel.setUpstreamAppUuid(
                newAppUuid,
                sourceApp.app_id,
            );
            await this.linkResolvedExternalConnections(
                newAppUuid,
                externalConnectionResources,
            );
            await this.appModel.updateStatusMessage(
                newAppUuid,
                newVersion,
                'Copied from upstream project',
            );
        } catch (error) {
            // Drop the orphaned S3 copy and skip this app — a single failure
            // must not abort the rest of the preview copy.
            await this.cleanupRestoredS3Keys(
                s3Client,
                bucket,
                newAppUuid,
                copiedKeys,
            );
            this.logger.error(
                `Preview duplication: failed to copy app ${sourceApp.app_id} into preview ${previewProjectUuid}: ${getErrorMessage(
                    error,
                )}`,
            );
            return null;
        }

        return newAppUuid;
    }

    async cancelVersion(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        version: number,
    ): Promise<void> {
        await this.assertDataAppsEnabled(user);
        const app = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanManageApp(
            user,
            app,
            'Insufficient permissions to cancel app generation',
        );

        // Read the version before updating it so we can capture the stage
        // it was at when the cancel hit.
        const versionRow = await this.appModel.getVersion(appUuid, version);

        // Atomically mark the version as cancelled (only if still building)
        const updated = await this.appModel.updateVersionStatusIfInProgress(
            appUuid,
            version,
            'error',
            APP_VERSION_CANCELLED_BY_USER,
            APP_VERSION_CANCELLED_BY_USER,
        );
        if (!updated) {
            throw new ParameterError('This version is not currently building');
        }

        this.logger.info(
            `App ${appUuid}: version ${version} cancelled by user ${user.userUuid}`,
        );

        if (versionRow) {
            this.analytics.track({
                event: 'data_app.version.cancelled',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid!,
                    projectId: projectUuid,
                    appUuid,
                    version,
                    stageAtCancellation: versionRow.status,
                    msElapsedBeforeCancel:
                        Date.now() - versionRow.created_at.getTime(),
                },
            });
        }

        // Kill the in-flight claude process, then suspend the sandbox while
        // keeping it resumable for the next iteration (snapshot + destroy on
        // object-store backends, preserving state). The kill must happen
        // before the pause: on native-pause backends a frozen claude process
        // would otherwise resume executing the cancelled instruction when the
        // next iteration resumes the sandbox.
        // The pipeline will catch the resulting error, but markError is now
        // a no-op since the version is already in 'error' state — and
        // pipeline catches gate `trackVersionFailed` on the markError result,
        // so no spurious failed analytics event fires on top of the cancel.
        if (app.sandbox_id) {
            try {
                await this.getSandboxManager().suspendByUuid(app.sandbox_id, {
                    beforeSuspend: async (handle) => {
                        try {
                            await handle.commands.run(
                                INTERRUPT_CLAUDE_COMMAND,
                                {
                                    timeoutMs: 15_000,
                                },
                            );
                            this.logger.info(
                                `App ${appUuid}: interrupted in-flight claude before suspend`,
                            );
                        } catch (error) {
                            // Best-effort — the suspend must still happen.
                            this.logger.warn(
                                `App ${appUuid}: failed to interrupt claude before suspend: ${getErrorMessage(error)}`,
                            );
                        }
                    },
                });
                this.logger.info(
                    `App ${appUuid}: sandbox suspended after cancel (sandboxUuid=${app.sandbox_id})`,
                );
            } catch (error) {
                // Sandbox may already be dead/suspended — that's fine
                this.logger.warn(
                    `App ${appUuid}: failed to suspend sandbox after cancel: ${getErrorMessage(error)}`,
                );
            }
        }
    }

    /**
     * Narration entries as served to the chat UI. Stage labels are always
     * dropped (transient progress the live status line already showed). On
     * terminal versions, reasoning entries restated in the final completion
     * message are dropped too — the snippet stream can't tell Claude's
     * closing response apart from mid-run narration, so its sentences also
     * land in the history. Snippets are verbatim extracts, so a normalized
     * substring check identifies them exactly.
     */
    private static filterStatusHistoryForApi(
        history: AppVersionStatusHistoryEntry[] | null,
        status: AppVersionStatus,
        statusMessage: string | null,
    ): AppVersionStatusHistoryEntry[] {
        const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
        const finalText =
            !isAppVersionInProgress(status) && statusMessage
                ? normalize(statusMessage)
                : null;
        return (history ?? []).filter((entry) => {
            if (entry.kind === 'stage') return false;
            if (
                finalText &&
                entry.kind === 'thinking' &&
                finalText.includes(normalize(entry.message))
            ) {
                return false;
            }
            return true;
        });
    }

    async getAppVersions(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        opts: { beforeVersion?: number; limit?: number },
    ): Promise<{
        appUuid: string;
        name: string;
        description: string;
        createdByUserUuid: string;
        spaceUuid: string | null;
        spaceName: string | null;
        template: Exclude<DataAppTemplate, 'custom'> | null;
        pinnedListUuid: string | null;
        pinnedListOrder: number | null;
        versions: {
            version: number;
            prompt: string;
            status: AppVersionStatus;
            statusMessage: string | null;
            statusHistory: AppVersionStatusHistoryEntry[];
            error: string | null;
            createdAt: Date;
            statusUpdatedAt: Date | null;
            createdByUser: {
                userUuid: string;
                firstName: string;
                lastName: string;
            } | null;
            resources: AppVersionResources | null;
            dependencies?: { custom: AppVersionDependencies['custom'] };
        }[];
        hasMore: boolean;
        latestReadyVersion: number | null;
    }> {
        await this.assertDataAppsEnabled(user);

        const {
            name,
            description,
            createdByUserUuid,
            organizationUuid,
            spaceUuid,
            spaceName,
            template,
            pinnedListUuid,
            pinnedListOrder,
            versions,
            hasMore,
        } = await this.appModel.getAppWithVersions(appUuid, projectUuid, opts);

        await this.assertCanViewApp(user, {
            project_uuid: projectUuid,
            space_uuid: spaceUuid,
            organization_uuid: organizationUuid,
            created_by_user_uuid: createdByUserUuid,
        });

        // The latest ready version can be older than the returned page of
        // versions, so resolve it independently of pagination.
        const latestReady = await this.appModel.getLatestReadyVersion(appUuid);

        return {
            appUuid,
            name,
            description,
            createdByUserUuid,
            spaceUuid,
            spaceName,
            template,
            pinnedListUuid,
            pinnedListOrder,
            versions: versions.map((v) => ({
                version: v.version,
                prompt: v.prompt,
                status: v.status,
                statusMessage: v.status_message,
                statusHistory: AppGenerateService.filterStatusHistoryForApi(
                    v.status_history,
                    v.status,
                    v.status_message,
                ),
                error: v.error,
                // Attach `vizSchema` even when `resources` JSONB is null (a
                // viz with no other attachments) — never drop existing
                // resources fields, and backfill `clarifications` for rows
                // persisted before the field existed on `resources`.
                resources:
                    v.resources || v.viz_schema
                        ? {
                              images: v.resources?.images ?? [],
                              files: v.resources?.files ?? [],
                              charts: v.resources?.charts ?? [],
                              externalConnections:
                                  v.resources?.externalConnections,
                              dashboardName: v.resources?.dashboardName ?? null,
                              clarifications: v.resources?.clarifications ?? [],
                              claudeModel: v.resources?.claudeModel,
                              design: v.resources?.design,
                              vizSchema: v.viz_schema ?? null,
                          }
                        : null,
                createdAt: v.created_at,
                statusUpdatedAt: v.status_updated_at,
                // Custom-deps summary only; the lockfile hash is internal.
                ...(v.dependencies
                    ? { dependencies: { custom: v.dependencies.custom } }
                    : {}),
                // LEFT JOIN may miss for hard-deleted users — collapse the
                // whole object to null in that case rather than expose
                // individually-nullable fields to API consumers.
                createdByUser:
                    v.created_by_user_first_name !== null &&
                    v.created_by_user_last_name !== null
                        ? {
                              userUuid: v.created_by_user_uuid,
                              firstName: v.created_by_user_first_name,
                              lastName: v.created_by_user_last_name,
                          }
                        : null,
            })),
            hasMore,
            latestReadyVersion: latestReady?.version ?? null,
        };
    }

    /**
     * List all (non-deleted) data apps in a project — used by the embed config
     * UI to populate the standalone-app allowlist picker.
     */
    async listAppsForProject(
        user: SessionUser,
        projectUuid: string,
    ): Promise<EmbedProjectApp[]> {
        await this.assertDataAppsEnabled(user);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('DataApp', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError('Insufficient permissions');
        }
        const apps = await this.appModel.listAppsByProject(projectUuid);
        return apps.map((app) => ({ appUuid: app.app_id, name: app.name }));
    }

    // Validate the generator's declared schema. Pure (no IO); null when the
    // value doesn't match the contract. Never throws.
    static parseSchema(value: unknown): DataAppVizSchema | null {
        const result = dataAppVizSchema.safeParse(value);
        return result.success ? result.data : null;
    }

    // Persist the schema the generator emitted as the run's `--json-schema`
    // structured output. Best-effort: a missing (null) or invalid structured
    // output leaves viz_schema untouched without failing an otherwise-good
    // build — a data app viz with no schema is simply absent from the picker.
    private async persistSchema(
        structuredOutput: unknown,
        appUuid: string,
        version: number,
    ): Promise<void> {
        if (structuredOutput === null || structuredOutput === undefined) {
            this.logger.warn(
                `App ${appUuid}: no structured schema from the generation run; leaving viz_schema null`,
            );
            return;
        }
        const schema = AppGenerateService.parseSchema(structuredOutput);
        if (!schema) {
            this.logger.warn(
                `App ${appUuid}: structured schema failed validation; leaving viz_schema null`,
            );
            return;
        }
        await this.appModel.setSchema(appUuid, version, schema);
        this.logger.info(
            `App ${appUuid} v${version}: persisted schema (${schema.fields.length} field(s), ${schema.configOptions.length} option(s))`,
        );
    }

    private static mapDataAppViz(
        app: DbApp & { viz_schema: DataAppVizSchema | null },
    ): DataAppViz {
        return {
            dataAppVizUuid: app.app_id,
            name: app.name,
            description: app.description,
            projectUuid: app.project_uuid,
            spaceUuid: app.space_uuid,
            schema: app.viz_schema,
            createdAt: app.created_at,
            createdByUserUuid: app.created_by_user_uuid,
        };
    }

    async listDataAppVisualizations(
        user: SessionUser,
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
        search?: string,
    ): Promise<KnexPaginatedData<DataAppViz[]>> {
        await this.assertDataAppsEnabled(user);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        // The library is offered to whoever can build a chart in an explore:
        // picking a renderer is part of configuring a chart, not app access.
        if (
            auditedAbility.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError('Insufficient permissions');
        }
        const { data, pagination } =
            await this.appModel.listDataAppVisualizations(
                projectUuid,
                paginateArgs,
                search,
            );
        return { data: data.map(AppGenerateService.mapDataAppViz), pagination };
    }

    async getDataAppVisualization(
        user: SessionUser,
        projectUuid: string,
        dataAppVizUuid: string,
    ): Promise<DataAppViz> {
        await this.assertDataAppsEnabled(user);
        const dataAppViz = await this.appModel.findVisualizationApp(
            dataAppVizUuid,
            projectUuid,
        );
        if (!dataAppViz) {
            throw new NotFoundError(
                `Data app visualization not found: ${dataAppVizUuid}`,
            );
        }
        await this.assertCanViewApp(user, {
            project_uuid: dataAppViz.project_uuid,
            space_uuid: dataAppViz.space_uuid,
            organization_uuid: dataAppViz.organization_uuid,
            created_by_user_uuid: dataAppViz.created_by_user_uuid,
        });
        return AppGenerateService.mapDataAppViz(dataAppViz);
    }

    async listMyApps(
        user: SessionUser,
        paginateArgs?: { page: number; pageSize: number },
        options: {
            excludePreviewProjects?: boolean;
            projectUuids?: string[];
            search?: string;
        } = {},
    ): Promise<{
        data: {
            appUuid: string;
            name: string;
            description: string;
            projectUuid: string;
            projectName: string;
            spaceUuid: string | null;
            spaceName: string | null;
            createdAt: Date;
            lastVersionNumber: number | null;
            lastVersionStatus: AppVersionStatus | null;
        }[];
        pagination?: {
            page: number;
            pageSize: number;
            totalPageCount: number;
            totalResults: number;
        };
    }> {
        await this.assertDataAppsEnabled(user);
        const auditedAbility = this.createAuditedAbility(user);
        if (auditedAbility.cannot('manage', 'DataApp')) {
            throw new ForbiddenError('Insufficient permissions');
        }

        const result = await this.appModel.listMyApps(
            user.userUuid,
            paginateArgs,
            options,
        );

        return {
            data: result.data.map((row) => ({
                appUuid: row.app.app_id,
                name: row.app.name,
                description: row.app.description,
                projectUuid: row.app.project_uuid,
                projectName: row.projectName,
                spaceUuid: row.app.space_uuid,
                spaceName: row.spaceName,
                createdAt: row.app.created_at,
                lastVersionNumber: row.lastVersion?.version ?? null,
                lastVersionStatus: row.lastVersion?.status ?? null,
            })),
            pagination: result.pagination,
        };
    }

    private static toActivityEvent(
        row: DbAppActivityRow,
    ): DataAppActivityEvent {
        return {
            appUuid: row.app_id,
            appName: row.app_name,
            appDeleted: row.app_deleted_at !== null,
            version: row.version,
            status: row.status,
            prompt: row.prompt,
            claudeModel:
                row.resources?.claudeModel ?? DEFAULT_DATA_APP_CLAUDE_MODEL,
            createdAt: row.created_at,
            projectUuid: row.project_uuid,
            projectName: row.project_name,
            // first_name/last_name are non-null on the user row, so a null here
            // means the join missed entirely (hard-deleted author).
            user:
                row.created_by_user_first_name === null ||
                row.created_by_user_last_name === null
                    ? null
                    : {
                          userUuid: row.created_by_user_uuid,
                          firstName: row.created_by_user_first_name,
                          lastName: row.created_by_user_last_name,
                      },
            usage: row.generation_usage,
        };
    }

    /**
     * Org-wide log of every data app generation — who built what, when, and
     * with which model. Org admins only.
     */
    async getOrganizationActivity(
        user: SessionUser,
        paginateArgs?: KnexPaginateArgs,
        filters?: DataAppActivityFilters,
    ): Promise<KnexPaginatedData<DataAppActivityEvent[]>> {
        await this.assertDataAppsEnabled(user);

        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError('Insufficient permissions');
        }

        const { data, pagination } =
            await this.appModel.getOrganizationActivity(
                organizationUuid,
                paginateArgs,
                filters,
            );

        return {
            data: data.map(AppGenerateService.toActivityEvent),
            pagination,
        };
    }

    /**
     * Pin/unpin a data app to the project homepage.
     *
     * Personal (spaceless) apps cannot be pinned — the pinned panel is a
     * project-wide surface, so pinning an app only visible to its creator
     * would leak its presence to everyone else.
     */
    async togglePinning(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
    ): Promise<TogglePinnedItemInfo> {
        await this.assertDataAppsEnabled(user);

        const app = await this.appModel.getApp(appUuid, projectUuid);

        if (!app.space_uuid) {
            throw new ParameterError('Personal data apps cannot be pinned');
        }

        await this.assertCanManageApp(
            user,
            app,
            'Insufficient permissions to pin data apps',
            { metadata: { appUuid } },
        );

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('PinnedItems', {
                    organizationUuid: app.organization_uuid,
                    projectUuid,
                    metadata: { appUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (app.pinned_list_uuid) {
            await this.pinnedListModel.deleteItem({
                pinnedListUuid: app.pinned_list_uuid,
                appUuid,
            });
        } else {
            await this.pinnedListModel.addItem({
                projectUuid,
                appUuid,
            });
        }

        const pinnedList =
            await this.pinnedListModel.getPinnedListAndItems(projectUuid);

        this.analytics.track({
            event: 'pinned_list.updated',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                organizationId: app.organization_uuid,
                location: 'homepage',
                pinnedListId: pinnedList.pinnedListUuid,
                pinnedItems: pinnedList.items,
            },
        });

        return {
            projectUuid,
            spaceUuid: app.space_uuid,
            pinnedListUuid: pinnedList.pinnedListUuid,
            isPinned: !!pinnedList.items.find(
                (item) => item.appUuid === appUuid,
            ),
        };
    }

    async updateApp(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        update: { name?: string; description?: string },
    ): Promise<{ appUuid: string; name: string; description: string }> {
        await this.assertDataAppsEnabled(user);
        const app = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanManageApp(
            user,
            app,
            'Insufficient permissions to manage data apps',
        );

        const fieldsToUpdate: Partial<{ name: string; description: string }> =
            {};
        if (update.name !== undefined) {
            const trimmedName = update.name.trim();
            if (trimmedName.length === 0) {
                throw new ParameterError('App name cannot be empty');
            }
            if (trimmedName.length > 255) {
                throw new ParameterError(
                    'App name must be 255 characters or fewer',
                );
            }
            fieldsToUpdate.name = trimmedName;
        }
        if (update.description !== undefined) {
            const trimmedDescription = update.description.trim();
            if (trimmedDescription.length > 1024) {
                throw new ParameterError(
                    'App description must be 1024 characters or fewer',
                );
            }
            fieldsToUpdate.description = trimmedDescription;
        }

        if (Object.keys(fieldsToUpdate).length === 0) {
            throw new ParameterError(
                'At least one of name or description must be provided',
            );
        }

        const updatedApp = await this.appModel.updateApp(
            appUuid,
            projectUuid,
            fieldsToUpdate,
        );
        return {
            appUuid: updatedApp.app_id,
            name: updatedApp.name,
            description: updatedApp.description,
        };
    }

    /**
     * Delete a data app. Routes to soft or permanent delete based on
     * `lightdashConfig.softDelete.enabled`.
     *
     * `bypassPermissions` is used by cascading deletes from `SpaceService`
     * where the parent space already authorized the action — skipping both
     * the feature-flag check and the CASL check.
     */
    async deleteApp(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        options?: { bypassPermissions?: boolean },
    ): Promise<void> {
        const app = await this.appModel.getApp(appUuid, projectUuid);
        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'delete', {
                type: 'DataApp',
                metadata: { appUuid },
                organizationUuid: app.organization_uuid,
            });
        } else {
            await this.assertDataAppsEnabled(user);
            await this.assertCanManageApp(
                user,
                app,
                'Insufficient permissions to delete data apps',
            );
        }

        const softDeleteEnabled = this.lightdashConfig.softDelete.enabled;

        if (softDeleteEnabled) {
            // Suspending the sandbox interrupts any in-flight pipeline so it
            // doesn't keep running against a now-hidden app, while preserving
            // its state in case the app is restored.
            await this.suspendSandboxIfExists(app.sandbox_id, appUuid);
            await this.appModel.softDelete(appUuid, projectUuid, user.userUuid);
        } else {
            await this.killSandboxIfExists(app.sandbox_id, appUuid);
            await this.deleteAppS3Prefix(appUuid);
            await this.appModel.permanentDelete(appUuid, projectUuid);
        }

        this.analytics.track({
            event: 'data_app.deleted',
            userId: user.userUuid,
            properties: {
                organizationId: app.organization_uuid,
                projectId: projectUuid,
                appUuid,
                softDelete: softDeleteEnabled,
            },
        });
    }

    /**
     * Restore a soft-deleted app. Used by the `SpaceService` restore cascade.
     */
    async restoreApp(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        options?: { bypassPermissions?: boolean },
    ): Promise<void> {
        const app = await this.appModel.getAppIncludingDeleted(
            appUuid,
            projectUuid,
        );
        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'manage', {
                type: 'DataApp',
                metadata: { appUuid },
                organizationUuid: app.organization_uuid,
            });
        } else {
            await this.assertDataAppsEnabled(user);
            this.assertDataAppAbility(
                user,
                'manage',
                app.organization_uuid,
                projectUuid,
                'Insufficient permissions to restore data apps',
            );
        }

        await this.appModel.restore(appUuid, projectUuid);

        this.analytics.track({
            event: 'data_app.restored',
            userId: user.userUuid,
            properties: {
                organizationId: app.organization_uuid,
                projectId: projectUuid,
                appUuid,
            },
        });
    }

    /**
     * Permanently delete an app regardless of current soft-delete state.
     * Kills the sandbox and purges the S3 prefix. Used by the `SpaceService`
     * permanent-delete cascade (where the app is typically already
     * soft-deleted) and by the admin recently-deleted flow.
     */
    async permanentDeleteApp(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        options?: { bypassPermissions?: boolean },
    ): Promise<void> {
        const app = await this.appModel.getAppIncludingDeleted(
            appUuid,
            projectUuid,
        );
        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'manage', {
                type: 'DataApp',
                metadata: { appUuid },
                organizationUuid: app.organization_uuid,
            });
        } else {
            await this.assertDataAppsEnabled(user);
            this.assertDataAppAbility(
                user,
                'manage',
                app.organization_uuid,
                projectUuid,
                'Insufficient permissions to delete data apps',
            );
        }

        await this.killSandboxIfExists(app.sandbox_id, appUuid);
        await this.deleteAppS3Prefix(appUuid);
        await this.appModel.permanentDelete(appUuid, projectUuid);

        this.analytics.track({
            event: 'data_app.deleted',
            userId: user.userUuid,
            properties: {
                organizationId: app.organization_uuid,
                projectId: projectUuid,
                appUuid,
                softDelete: false,
            },
        });
    }

    private async suspendSandboxIfExists(
        sandboxUuid: string | null,
        appUuid: string,
    ): Promise<void> {
        if (!sandboxUuid) return;
        try {
            await this.getSandboxManager().suspendByUuid(sandboxUuid);
            this.logger.info(
                `App ${appUuid}: sandbox suspended during delete (sandboxUuid=${sandboxUuid})`,
            );
        } catch (error) {
            this.logger.warn(
                `App ${appUuid}: failed to suspend sandbox during delete: ${getErrorMessage(error)}`,
            );
        }
    }

    private async killSandboxIfExists(
        sandboxUuid: string | null,
        appUuid: string,
    ): Promise<void> {
        if (!sandboxUuid) return;
        try {
            await this.getSandboxManager().destroy({ sandboxUuid });
            this.logger.info(
                `App ${appUuid}: sandbox killed during hard delete (sandboxUuid=${sandboxUuid})`,
            );
        } catch (error) {
            this.logger.warn(
                `App ${appUuid}: failed to kill sandbox during hard delete: ${getErrorMessage(error)}`,
            );
        }
    }

    /**
     * Purge every S3 object under `apps/{appUuid}/` — covers staged image
     * uploads, version source tarballs, built dist tarballs, and per-version
     * assets.
     */
    private async deleteAppS3Prefix(appUuid: string): Promise<void> {
        const { client, bucket } = this.getS3Client();
        const prefix = `apps/${appUuid}/`;

        let continuationToken: string | undefined;
        let totalDeleted = 0;
        // S3 pagination requires sequential awaits: each list call depends on
        // the previous call's continuation token.
        /* eslint-disable no-await-in-loop */
        do {
            const listResponse = await client.send(
                new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: prefix,
                    ContinuationToken: continuationToken,
                }),
            );

            const objects: ObjectIdentifier[] = (listResponse.Contents ?? [])
                .map((obj) => obj.Key)
                .filter((key): key is string => typeof key === 'string')
                .map((Key) => ({ Key }));

            if (objects.length > 0) {
                // DeleteObjects caps at 1000 keys per call; ListObjectsV2
                // returns at most 1000 per page, so one batch per page is safe.
                await client.send(
                    new DeleteObjectsCommand({
                        Bucket: bucket,
                        Delete: { Objects: objects, Quiet: true },
                    }),
                );
                totalDeleted += objects.length;
            }

            continuationToken = listResponse.IsTruncated
                ? listResponse.NextContinuationToken
                : undefined;
        } while (continuationToken);
        /* eslint-enable no-await-in-loop */

        this.logger.info(
            `App ${appUuid}: deleted ${totalDeleted} S3 object(s) under ${prefix}`,
        );
    }

    /**
     * Move a data app into a space, or between spaces.
     *
     * Implements the shared `BulkActionable` interface so `ContentService`
     * can dispatch move requests uniformly alongside dashboards and charts.
     * Moves to `null` (unassigning back to personal) are rejected — once
     * shared to a space, an app stays in a space.
     */
    async moveToSpace(
        user: SessionUser,
        {
            projectUuid,
            itemUuid: appUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string | null;
        },
        {
            tx,
            checkForAccess = true,
            trackEvent = true,
        }: {
            tx?: Knex;
            checkForAccess?: boolean;
            trackEvent?: boolean;
        } = {},
    ): Promise<void> {
        await this.assertDataAppsEnabled(user);

        if (targetSpaceUuid === null) {
            throw new ParameterError(
                'You cannot move a data app outside of a space',
            );
        }

        const app = await this.appModel.getApp(appUuid, projectUuid);

        if (checkForAccess) {
            // Manage on the source app (where it currently lives) — space
            // editors/admins of the source space can move it out.
            await this.assertCanManageApp(
                user,
                app,
                'Insufficient permissions to move data apps',
            );
            // …and manage on the target space, otherwise a user could move an
            // app into a space they don't own.
            const targetSpaceContext =
                await this.spacePermissionService.getSpaceAccessContext(
                    user.userUuid,
                    targetSpaceUuid,
                );
            this.assertDataAppAbility(
                user,
                'manage',
                app.organization_uuid,
                projectUuid,
                "You don't have access to the space this data app is being moved to",
                targetSpaceContext,
            );
        }

        await this.appModel.moveToSpace(
            { appId: appUuid, projectUuid, targetSpaceUuid },
            { tx },
        );

        if (trackEvent) {
            this.analytics.track({
                event: 'data_app.moved',
                userId: user.userUuid,
                properties: {
                    organizationId: app.organization_uuid,
                    projectId: projectUuid,
                    appUuid,
                    sourceSpaceUuid: app.space_uuid,
                    targetSpaceUuid,
                },
            });
        }
    }

    private static async extractAndUploadToS3(
        tarBuffer: Buffer,
        s3Client: S3Client,
        bucket: string,
        s3Prefix: string,
    ): Promise<{ fileCount: number; totalBytes: number }> {
        return new Promise<{ fileCount: number; totalBytes: number }>(
            (resolve, reject) => {
                const extractor = extract();
                const uploads: Promise<void>[] = [];
                let fileCount = 0;
                let totalBytes = 0;

                extractor.on(
                    'entry',
                    (
                        header: Headers,
                        stream: PassThrough,
                        next: () => void,
                    ) => {
                        if (header.type === 'file' && header.name) {
                            const chunks: Buffer[] = [];
                            stream.on('data', (chunk: Buffer) =>
                                chunks.push(chunk),
                            );
                            stream.on('end', () => {
                                const body = Buffer.concat(chunks);
                                fileCount += 1;
                                totalBytes += body.length;
                                const relativePath = header.name.replace(
                                    /^dist\//,
                                    '',
                                );
                                const s3Key = `${s3Prefix}/${relativePath}`;
                                const contentType =
                                    AppGenerateService.getContentType(
                                        relativePath,
                                    );

                                const upload = s3Client
                                    .send(
                                        new PutObjectCommand({
                                            Bucket: bucket,
                                            Key: s3Key,
                                            Body: body,
                                            ContentType: contentType,
                                        }),
                                    )
                                    .then(() => {});

                                uploads.push(upload);
                                next();
                            });
                            stream.on('error', reject);
                        } else {
                            stream.resume();
                            next();
                        }
                    },
                );

                extractor.on('finish', () => {
                    Promise.all(uploads).then(
                        () => resolve({ fileCount, totalBytes }),
                        reject,
                    );
                });

                extractor.on('error', reject);

                const passThrough = new PassThrough();
                passThrough.pipe(extractor);
                passThrough.end(tarBuffer);
            },
        );
    }

    async getPreviewToken(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        version: number,
    ): Promise<string> {
        await this.assertDataAppsEnabled(user);

        if (!isValidUuid(appUuid)) {
            throw new ParameterError('Invalid UUID format');
        }

        if (!Number.isInteger(version) || version < 1) {
            throw new ParameterError('Version must be a positive integer');
        }

        const app = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanViewApp(user, app);

        return mintPreviewToken(
            this.lightdashConfig.lightdashSecret,
            appUuid,
            version,
            user.userUuid,
            user.organizationUuid!,
            projectUuid,
        );
    }

    /**
     * Mint a preview token for embed-side rendering of a data app, bundling
     * the resolved latest ready version so the frontend doesn't need a
     * separate round-trip to find it.
     *
     * Authorization depends on the embed content type:
     * - standalone `dataApp` embed: the signed JWT names this exact app and
     *   self-authorizes it (the project opted in via `allow_all_apps` or the
     *   `app_uuids` allowlist, enforced at account build); a mismatched appUuid
     *   is rejected outright.
     * - dashboard-tile embed: the app must be referenced by a tile on a
     *   dashboard in the embed's allowlist (or `allowAllDashboards`), mirroring
     *   how embedded charts are gated by whitelisted dashboards.
     * The app must live in the embed's project — source-project apps (preview
     * environments) are out of scope and surface as a 404 to the frontend.
     */
    async getEmbedAppPreviewToken(
        account: AnonymousAccount,
        appUuid: string,
    ): Promise<{ token: string; version: number }> {
        assertEmbeddedAuth(account);

        if (!isValidUuid(appUuid)) {
            throw new ParameterError('Invalid UUID format');
        }

        const { projectUuid } = account.embed;
        const app = await this.appModel.findApp(appUuid, projectUuid);
        if (!app) {
            throw new NotFoundError(`App not found: ${appUuid}`);
        }

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('DataApp', {
                    organizationUuid: app.organization_uuid,
                    projectUuid: app.project_uuid,
                    metadata: { appUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to access this data app',
            );
        }

        if (account.access.content.type === 'dataApp') {
            // A standalone data app JWT authorizes EXACTLY its named app
            // (already gated at account build in
            // EmbedService.getAccountFromJwt). Requesting any other app is
            // denied — we must NOT fall through to the dashboard-allowlist gate,
            // which could otherwise mint a token for an app that merely sits on
            // an allowlisted dashboard, bypassing the per-app `app_uuids`
            // allowlist.
            if (account.access.content.appUuid !== appUuid) {
                throw new ForbiddenError(
                    'This embed is not authorized for this data app',
                );
            }
        } else if (!account.embed.allowAllDashboards) {
            const dashboardsWithApp =
                await this.appModel.findDashboardsContainingApp(
                    appUuid,
                    projectUuid,
                );
            const allowedDashboards = new Set(account.embed.dashboardUuids);
            const onAllowedDashboard = dashboardsWithApp.some((d) =>
                allowedDashboards.has(d),
            );
            if (!onAllowedDashboard) {
                throw new ForbiddenError(
                    'Data app is not authorized by this embed',
                );
            }
        }

        const latestReady = await this.appModel.getLatestReadyVersion(appUuid);
        if (!latestReady) {
            throw new NotFoundError(
                `Data app has no ready version yet: ${appUuid}`,
            );
        }

        const token = mintPreviewToken(
            this.lightdashConfig.lightdashSecret,
            appUuid,
            latestReady.version,
            account.user.id,
            app.organization_uuid,
            projectUuid,
        );

        return { token, version: latestReady.version };
    }

    /** Escape a string into a safe, single-line double-quoted YAML scalar. */
    private static yamlQuote(value: unknown): string {
        const cleaned = String(value).replace(/[\r\n\t]+/g, ' ');
        return JSON.stringify(cleaned);
    }

    /** Render a single Lightdash parameter as indented YAML lines. */
    private static renderParameterYaml(
        key: string,
        param: LightdashProjectParameter,
        indent: string,
    ): string[] {
        const inner = `${indent}  `;
        const scalar = (v: string | number): string =>
            typeof v === 'number' ? String(v) : AppGenerateService.yamlQuote(v);

        const lines: string[] = [`${indent}${key}:`];
        // Parameters authored before labels existed have no label at runtime;
        // fall back to the key rather than crashing in yamlQuote(undefined).
        lines.push(
            `${inner}label: ${AppGenerateService.yamlQuote(param.label ?? key)}`,
        );
        if (param.description) {
            lines.push(
                `${inner}description: ${AppGenerateService.yamlQuote(param.description)}`,
            );
        }
        if (param.type) {
            lines.push(`${inner}type: ${param.type}`);
        }
        if (param.multiple) {
            lines.push(`${inner}multiple: true`);
        }
        if (param.allow_custom_values) {
            lines.push(`${inner}allow_custom_values: true`);
        }
        if (param.options && param.options.length > 0) {
            const rendered = (param.options as Array<string | number>)
                .map(scalar)
                .join(', ');
            lines.push(`${inner}options: [${rendered}]`);
        }
        if (param.options_from_dimension) {
            lines.push(`${inner}options_from_dimension:`);
            lines.push(
                `${inner}  model: ${param.options_from_dimension.model}`,
            );
            lines.push(
                `${inner}  dimension: ${param.options_from_dimension.dimension}`,
            );
        }
        if (param.default !== undefined) {
            const rendered = Array.isArray(param.default)
                ? `[${(param.default as Array<string | number>).map(scalar).join(', ')}]`
                : scalar(param.default);
            lines.push(`${inner}default: ${rendered}`);
        }
        return lines;
    }

    private static readonly DESCRIPTION_MAX_LEN = 200;

    private static truncateDescription(s: string): string {
        return s.length > AppGenerateService.DESCRIPTION_MAX_LEN
            ? `${s.slice(0, AppGenerateService.DESCRIPTION_MAX_LEN - 1)}…`
            : s;
    }

    /**
     * Render one model-level filter in the SDK `Filter` shape (field/operator/
     * value/unit) so the agent can pass entries into `.filters([...])` as-is.
     */
    private static renderModelFilterYaml(
        filter: ModelRequiredFilterRule,
    ): string[] {
        const lines: string[] = [
            `        - field: ${filter.target.fieldRef}`,
            `          operator: ${filter.operator}`,
        ];
        if (
            filter.operator !== FilterOperator.NULL &&
            filter.operator !== FilterOperator.NOT_NULL
        ) {
            const values = (filter.values ?? []).map((v: unknown) =>
                typeof v === 'number' || typeof v === 'boolean'
                    ? String(v)
                    : AppGenerateService.yamlQuote(v),
            );
            lines.push(`          value: [${values.join(', ')}]`);
        }
        const unitOfTime: unknown = filter.settings?.unitOfTime;
        if (typeof unitOfTime === 'string') {
            lines.push(`          unit: ${unitOfTime}`);
        }
        return lines;
    }

    /**
     * Render one compiled table as a dbt-style model, carrying real
     * metric/dimension types, join relationships (`meta.joins`), AI hints,
     * model-level parameters, and model-level filters (`sql_filter`,
     * `required_filters`, `default_filters`). Joins, parameters, and filters
     * are explore-scoped rather than table-scoped, so they're passed in
     * explicitly. Hidden fields are skipped; descriptions are truncated to
     * keep the output bounded.
     */
    private static renderTableModel(
        modelName: string,
        table: CompiledTable,
        joins: CompiledExploreJoin[],
        parameters: Record<string, LightdashProjectParameter> | undefined,
        modelFilters: RenderedModelFilters,
    ): RenderedModel {
        const truncate = AppGenerateService.truncateDescription;
        const headerLines: string[] = [`  - name: ${modelName}`];
        if (table.description) {
            headerLines.push(
                `    description: ${AppGenerateService.yamlQuote(truncate(table.description))}`,
            );
        }

        const metrics = Object.values(table.metrics).filter((m) => !m.hidden);
        const dimensions = Object.values(table.dimensions).filter(
            (d) => !d.hidden,
        );
        const parameterEntries = parameters ? Object.entries(parameters) : [];
        // Same predicate MetricQueryBuilder uses to decide enforcement.
        const requiredFilters = modelFilters.requiredFilters.filter(
            (f) => f.required !== false,
        );
        const defaultFilters = modelFilters.requiredFilters.filter(
            (f) => f.required === false,
        );
        const { sqlFilter } = modelFilters;

        if (
            metrics.length > 0 ||
            joins.length > 0 ||
            parameterEntries.length > 0 ||
            requiredFilters.length > 0 ||
            defaultFilters.length > 0 ||
            sqlFilter !== null
        ) {
            headerLines.push(`    meta:`);
            if (metrics.length > 0) {
                headerLines.push(`      metrics:`);
                for (const m of metrics) {
                    headerLines.push(`        ${m.name}:`);
                    headerLines.push(`          type: ${m.type}`);
                    if (m.label && m.label !== m.name) {
                        headerLines.push(
                            `          label: ${AppGenerateService.yamlQuote(m.label)}`,
                        );
                    }
                    if (m.description) {
                        headerLines.push(
                            `          description: ${AppGenerateService.yamlQuote(truncate(m.description))}`,
                        );
                    }
                    const aiHints = getEffectiveFieldAiHints(m, table);
                    if (aiHints) {
                        headerLines.push(`          ai_hints:`);
                        for (const aiHint of aiHints) {
                            headerLines.push(
                                `            - ${AppGenerateService.yamlQuote(aiHint)}`,
                            );
                        }
                    }
                }
            }
            if (joins.length > 0) {
                headerLines.push(`      joins:`);
                for (const j of joins) {
                    headerLines.push(`        - join: ${j.table}`);
                    if (j.relationship) {
                        headerLines.push(
                            `          relationship: ${j.relationship}`,
                        );
                    }
                    if (j.sqlOn) {
                        headerLines.push(
                            `          sql_on: ${AppGenerateService.yamlQuote(j.sqlOn)}`,
                        );
                    }
                }
            }
            if (sqlFilter !== null) {
                headerLines.push(
                    `      sql_filter: ${AppGenerateService.yamlQuote(sqlFilter)}`,
                );
            }
            if (requiredFilters.length > 0) {
                headerLines.push(`      required_filters:`);
                for (const filter of requiredFilters) {
                    headerLines.push(
                        ...AppGenerateService.renderModelFilterYaml(filter),
                    );
                }
            }
            if (defaultFilters.length > 0) {
                headerLines.push(`      default_filters:`);
                for (const filter of defaultFilters) {
                    headerLines.push(
                        ...AppGenerateService.renderModelFilterYaml(filter),
                    );
                }
            }
            if (parameterEntries.length > 0) {
                headerLines.push(`      parameters:`);
                for (const [key, param] of parameterEntries) {
                    headerLines.push(
                        ...AppGenerateService.renderParameterYaml(
                            key,
                            param,
                            '        ',
                        ),
                    );
                }
            }
        }

        const columnBlocks = dimensions.map((d) => {
            const block: string[] = [`      - name: ${d.name}`];
            if (d.label && d.label !== d.name) {
                block.push(
                    `        label: ${AppGenerateService.yamlQuote(d.label)}`,
                );
            }
            if (d.description) {
                block.push(
                    `        description: ${AppGenerateService.yamlQuote(truncate(d.description))}`,
                );
            }
            const aiHints = getEffectiveFieldAiHints(d, table);
            if (aiHints) {
                block.push(`        ai_hints:`);
                for (const aiHint of aiHints) {
                    block.push(
                        `          - ${AppGenerateService.yamlQuote(aiHint)}`,
                    );
                }
            }
            block.push(`        meta:`);
            block.push(`          dimension:`);
            block.push(`            type: ${d.type}`);
            return block;
        });

        return {
            name: modelName,
            description: table.description ? truncate(table.description) : null,
            joinedTables: joins.map((j) => j.table),
            headerLines,
            columnBlocks,
            dimensionCount: dimensions.length,
            metricCount: metrics.length,
            requiredFilterCount: requiredFilters.length,
            defaultFilterCount: defaultFilters.length,
            hasSqlFilter: sqlFilter !== null,
        };
    }

    /**
     * One model per explore, keyed by the explore name (the value passed to
     * `query()`). Joined tables that aren't themselves a top-level explore
     * (seeds, aliased joins) are appended so their dot-notation fields stay
     * discoverable.
     */
    private static exploresToRenderedModels(
        explores: Explore[],
    ): RenderedModel[] {
        const models: RenderedModel[] = [];

        // Names already emitted as a standalone model, so the join-target
        // fallback (pass 2) only inlines tables that aren't otherwise visible.
        const emittedModelNames = new Set<string>(
            explores.map((explore) => explore.name),
        );

        // Pass 1: every explore becomes a model keyed by its queryable name.
        for (const explore of explores) {
            const baseTable = explore.tables[explore.baseTable];
            if (baseTable) {
                const joins = (explore.joinedTables ?? []).filter(
                    (j) => !j.hidden,
                );
                models.push(
                    AppGenerateService.renderTableModel(
                        explore.name,
                        baseTable,
                        joins,
                        explore.parameters,
                        {
                            requiredFilters: baseTable.requiredFilters ?? [],
                            sqlFilter: baseTable.sqlWhere ?? null,
                        },
                    ),
                );
            }
        }

        // Pass 2: inline join targets with no standalone model (seeds, aliased
        // joins) so their dot-notation fields remain discoverable.
        const inlined = new Set<string>();
        for (const explore of explores) {
            for (const join of explore.joinedTables ?? []) {
                const key = join.table; // alias-aware key into explore.tables
                const joinedTable = explore.tables[key];
                if (
                    !join.hidden &&
                    joinedTable &&
                    !emittedModelNames.has(key) &&
                    !inlined.has(key)
                ) {
                    inlined.add(key);
                    models.push(
                        AppGenerateService.renderTableModel(
                            key,
                            joinedTable,
                            [],
                            undefined,
                            // A join target's own filters only apply when it
                            // is queried as its own explore, which these are
                            // not — rendering them here would be misleading.
                            { requiredFilters: [], sqlFilter: null },
                        ),
                    );
                }
            }
        }

        return models;
    }

    private static renderedModelToLines(model: RenderedModel): string[] {
        return [
            ...model.headerLines,
            ...(model.columnBlocks.length > 0 ? ['    columns:'] : []),
            ...model.columnBlocks.flat(),
        ];
    }

    /**
     * Convert compiled explores into a single dbt-style YAML document. Used for
     * the app-code download bundle, where the whole semantic layer is expected
     * in one file; the build sandbox gets the sharded layout instead.
     */
    private static exploresToYaml(explores: Explore[]): {
        yaml: string;
        tableCount: number;
        dimensionCount: number;
        metricCount: number;
    } {
        const models = AppGenerateService.exploresToRenderedModels(explores);
        const lines = [
            'models:',
            ...models.flatMap(AppGenerateService.renderedModelToLines),
        ];

        return {
            yaml: lines.join('\n'),
            tableCount: models.length,
            dimensionCount: models.reduce((n, m) => n + m.dimensionCount, 0),
            metricCount: models.reduce((n, m) => n + m.metricCount, 0),
        };
    }

    static readonly MODELS_INDEX_FILENAME = '_index.md';

    // Iterations resume the previous Claude session, whose history still points
    // at the single-file layout this replaced. Leave a signpost so a remembered
    // read lands on instructions rather than a missing file.
    private static readonly MODELS_LEGACY_POINTER: ModelFile = {
        filename: 'schema.yml',
        contents: [
            '# This project is sharded across one YAML file per model in this directory.',
            `# Start with ${AppGenerateService.MODELS_INDEX_FILENAME}, then read only the model files you need.`,
            '',
        ].join('\n'),
    };

    // The agent's Read tool refuses files over 256KB outright, so every file we
    // write has to stay comfortably under it or it is unreadable in the sandbox.
    private static readonly MODEL_FILE_MAX_BYTES = 200_000;

    private static readonly INDEX_MAX_BYTES = 200_000;

    // Below this, index entries carry joins and a description; past it they
    // degrade to name/file/counts so every model still gets listed.
    private static readonly INDEX_DETAIL_MAX_BYTES = 120_000;

    private static readonly INDEX_DESCRIPTION_MAX_LEN = 120;

    /**
     * The index carries the resolved filename for every model, so sanitizing a
     * name here never leaves the agent guessing at the path.
     */
    private static modelFilenames(models: RenderedModel[]): string[] {
        const taken = new Set<string>([
            AppGenerateService.MODELS_INDEX_FILENAME,
            AppGenerateService.MODELS_LEGACY_POINTER.filename,
        ]);
        return models.map((model) => {
            const safe = model.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'model';
            let filename = `${safe}.yml`;
            let suffix = 2;
            while (taken.has(filename)) {
                filename = `${safe}-${suffix}.yml`;
                suffix += 1;
            }
            taken.add(filename);
            return filename;
        });
    }

    /**
     * One model as one or more YAML files. A model whose columns push it past
     * the Read ceiling is split across `<name>.yml`, `<name>.part2.yml`, … —
     * each a standalone-parseable document for the same model.
     */
    private static modelToFiles(
        model: RenderedModel,
        filename: string,
    ): ModelFile[] {
        const whole = `models:\n${AppGenerateService.renderedModelToLines(
            model,
        ).join('\n')}\n`;
        // Columns are the only split point, so a model with none is written
        // whole however big its metrics make it — an oversized file is still
        // greppable, whereas a model the index names but never writes is not.
        if (
            Buffer.byteLength(whole) <=
                AppGenerateService.MODEL_FILE_MAX_BYTES ||
            model.columnBlocks.length === 0
        ) {
            return [{ filename, contents: whole }];
        }

        const base = filename.replace(/\.yml$/, '');
        const header = `models:\n${model.headerLines.join('\n')}\n    columns:\n`;
        const files: ModelFile[] = [];
        let current: string[] = [];
        let currentBytes = Buffer.byteLength(header);

        const flush = () => {
            if (current.length === 0) return;
            const part = files.length + 1;
            files.push({
                filename: part === 1 ? filename : `${base}.part${part}.yml`,
                contents:
                    part === 1
                        ? `${header}${current.join('\n')}\n`
                        : `models:\n  - name: ${model.name}\n    columns:\n${current.join(
                              '\n',
                          )}\n`,
            });
            current = [];
            currentBytes = Buffer.byteLength(header);
        };

        for (const block of model.columnBlocks) {
            const text = block.join('\n');
            const blockBytes = Buffer.byteLength(text) + 1;
            if (
                current.length > 0 &&
                currentBytes + blockBytes >
                    AppGenerateService.MODEL_FILE_MAX_BYTES
            ) {
                flush();
            }
            current.push(text);
            currentBytes += blockBytes;
        }
        flush();

        return files.map((file, i) => ({
            ...file,
            contents:
                i < files.length - 1
                    ? `${file.contents}# ${model.name} continues in ${
                          files[i + 1].filename
                      }\n`
                    : file.contents,
        }));
    }

    /**
     * Shard the compiled explores into one YAML file per model plus an index
     * listing every model, so full fidelity stays on disk without the whole
     * catalog having to fit in the context window. `chartUsageByTable` ranks
     * the index, so any detail it sheds comes off the least-queried models.
     */
    private static exploresToModelFiles(
        explores: Explore[],
        chartUsageByTable: Map<string, number>,
    ): {
        files: ModelFile[];
        tableCount: number;
        dimensionCount: number;
        metricCount: number;
        totalBytes: number;
    } {
        const models = AppGenerateService.exploresToRenderedModels(explores);
        const filenames = AppGenerateService.modelFilenames(models);

        const files = models.flatMap((model, i) =>
            AppGenerateService.modelToFiles(model, filenames[i]),
        );

        const ranked = models
            .map((model, i) => ({
                model,
                filename: filenames[i],
                chartUsage: chartUsageByTable.get(model.name) ?? 0,
            }))
            .sort(
                (a, b) =>
                    b.chartUsage - a.chartUsage ||
                    a.model.name.localeCompare(b.model.name),
            );

        const header = [
            `# Semantic layer — ${models.length} model${
                models.length === 1 ? '' : 's'
            }`,
            '',
            'Every model in this project is listed below, most-queried first. Read',
            'only the model files you need — never the whole directory. To locate a',
            'field whose model you do not know, Grep this directory for its name.',
            'A `filters=` marker means the model declares model-level filters',
            '(required/default/sql_filter) that affect every query against it —',
            'read that model file before querying it.',
            '',
            'name  file  dims/metrics  joins  [filters]  description',
            '',
        ].join('\n');

        const detailLine = (entry: (typeof ranked)[number]): string => {
            const { model, filename } = entry;
            const joins =
                model.joinedTables.length > 0
                    ? model.joinedTables.join(',')
                    : '-';
            const filterParts = [
                model.requiredFilterCount > 0
                    ? `required:${model.requiredFilterCount}`
                    : null,
                model.defaultFilterCount > 0
                    ? `default:${model.defaultFilterCount}`
                    : null,
                model.hasSqlFilter ? 'sql' : null,
            ].filter((part) => part !== null);
            const filters =
                filterParts.length > 0
                    ? `  filters=${filterParts.join(',')}`
                    : '';
            const description = model.description
                ? `  ${model.description
                      .replace(/\s+/g, ' ')
                      .slice(0, AppGenerateService.INDEX_DESCRIPTION_MAX_LEN)}`
                : '';
            return `${model.name}  ${filename}  dims=${model.dimensionCount} metrics=${model.metricCount}  joins=${joins}${filters}${description}`;
        };

        const compactLine = (entry: (typeof ranked)[number]): string =>
            `${entry.model.name}  ${entry.filename}  dims=${entry.model.dimensionCount} metrics=${entry.model.metricCount}`;

        const lines: string[] = [];
        let bytes = Buffer.byteLength(header);
        let detailed = true;
        let omitted = 0;
        for (const entry of ranked) {
            if (detailed && bytes > AppGenerateService.INDEX_DETAIL_MAX_BYTES) {
                detailed = false;
            }
            const line = detailed ? detailLine(entry) : compactLine(entry);
            const lineBytes = Buffer.byteLength(line) + 1;
            if (bytes + lineBytes > AppGenerateService.INDEX_MAX_BYTES) {
                omitted += 1;
            } else {
                lines.push(line);
                bytes += lineBytes;
            }
        }
        if (omitted > 0) {
            lines.push(
                `\n(${omitted} rarely-queried models not listed — Glob this directory for *.yml to see them all)`,
            );
        }

        files.push(
            {
                filename: AppGenerateService.MODELS_INDEX_FILENAME,
                contents: `${header}${lines.join('\n')}\n`,
            },
            AppGenerateService.MODELS_LEGACY_POINTER,
        );

        return {
            files,
            tableCount: models.length,
            dimensionCount: models.reduce((n, m) => n + m.dimensionCount, 0),
            metricCount: models.reduce((n, m) => n + m.metricCount, 0),
            totalBytes: files.reduce(
                (n, f) => n + Buffer.byteLength(f.contents),
                0,
            ),
        };
    }

    /**
     * Render project-level (global) parameters as a `lightdash.config.yml`
     * fragment — the location skill.md tells the agent project-wide parameters
     * live in. Returns null when the project defines none.
     */
    private static projectParametersToConfigYaml(
        parameters: { name: string; config: LightdashProjectParameter }[],
    ): string | null {
        if (parameters.length === 0) {
            return null;
        }
        const lines: string[] = ['parameters:'];
        for (const { name, config } of parameters) {
            lines.push(
                ...AppGenerateService.renderParameterYaml(name, config, '  '),
            );
        }
        return `${lines.join('\n')}\n`;
    }

    private static getContentType(filePath: string): string {
        return contentTypeForPath(filePath);
    }

    /**
     * Read all artifacts for a specific (or latest ready) built app version from
     * S3 and return them as a base64-encoded bundle together with a manifest.
     */
    /** Extracts a tar archive in-process and collects its file entries. */
    private static extractTarFiles(
        tarBuffer: Buffer,
    ): Promise<DataAppCodeFile[]> {
        return new Promise<DataAppCodeFile[]>((resolve, reject) => {
            const extractor = extract();
            const entries: DataAppCodeFile[] = [];

            extractor.on(
                'entry',
                (header: Headers, stream: PassThrough, next: () => void) => {
                    if (header.type === 'file' && header.name) {
                        const chunks: Buffer[] = [];
                        stream.on('data', (chunk: Buffer) =>
                            chunks.push(chunk),
                        );
                        stream.on('end', () => {
                            const bytes = Buffer.concat(chunks);
                            entries.push({
                                path: header.name,
                                contentBase64: bytes.toString('base64'),
                            });
                            next();
                        });
                        stream.on('error', reject);
                    } else {
                        stream.resume();
                        next();
                    }
                },
            );

            extractor.on('finish', () => resolve(entries));
            extractor.on('error', reject);

            const passThrough = new PassThrough();
            passThrough.pipe(extractor);
            passThrough.end(tarBuffer);
        });
    }

    async getAppCode(
        user: SessionUser,
        projectUuid: string,
        appUuidOrSlug: string,
        version?: number,
    ): Promise<DataAppCodeDownload> {
        const app = await this.appModel.getAppByUuidOrSlug(
            projectUuid,
            appUuidOrSlug,
        );
        await this.assertCanViewApp(user, app);

        let resolvedVersion: number;
        let versionRow: DbAppVersion | null;
        if (version !== undefined) {
            resolvedVersion = version;
            versionRow = await this.appModel.getVersion(app.app_id, version);
        } else {
            const latestReady = await this.appModel.getLatestReadyVersion(
                app.app_id,
            );
            if (!latestReady) {
                throw new NotFoundError(
                    `Data app has no ready version yet: ${appUuidOrSlug}`,
                );
            }
            resolvedVersion = latestReady.version;
            versionRow = latestReady;
        }

        const { client: s3Client, bucket } = this.getS3Client();
        const sourceTarKey = `${versionPrefix(app.app_id, resolvedVersion)}source.tar`;

        // Download the single source archive for this version
        let tarBuffer: Buffer;
        try {
            const response = await s3Client.send(
                new GetObjectCommand({ Bucket: bucket, Key: sourceTarKey }),
            );
            const stream = response.Body as Readable;
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
                chunks.push(
                    Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
                );
            }
            tarBuffer = Buffer.concat(chunks);
        } catch (err: unknown) {
            const code =
                err instanceof Error &&
                'Code' in err &&
                typeof (err as { Code: unknown }).Code === 'string'
                    ? (err as { Code: string }).Code
                    : undefined;
            const name = err instanceof Error ? err.name : undefined;
            if (code === 'NoSuchKey' || name === 'NoSuchKey') {
                throw new NotFoundError(
                    `Source not found for app ${appUuidOrSlug} version ${resolvedVersion}`,
                );
            }
            throw err;
        }

        const files = await AppGenerateService.extractTarFiles(tarBuffer);

        // Emit the app's live links so a cross-project/instance upload can
        // re-establish them by connection slug. Omit the key when there are
        // none so link-less manifests stay unchanged.
        const appLinks = await this.externalConnectionModel.listAppLinks(
            app.app_id,
        );

        const manifest = buildManifest({
            appUuid: app.app_id,
            slug: app.slug,
            projectUuid,
            version: resolvedVersion,
            name: app.name,
            description: app.description,
            template: app.template,
            // Only viz versions carry a schema; omit the key entirely otherwise
            // so non-viz manifests stay unchanged.
            ...(versionRow?.viz_schema
                ? { vizSchema: versionRow.viz_schema }
                : {}),
            ...(appLinks.length > 0
                ? {
                      externalConnections: appLinks.map((link) => ({
                          alias: link.alias,
                          connectionSlug: link.connection.slug,
                      })),
                  }
                : {}),
            downloadedAt: new Date().toISOString(),
        });

        const context = await this.assembleAppContext(
            {
                appUuid: app.app_id,
                designUuid: app.design_uuid,
            },
            projectUuid,
            app.organization_uuid,
        );

        // Round-trip the declared dependency files when this version was
        // uploaded with a custom dependency set. Failures propagate: silently
        // dropping the files would make a re-upload build with template deps.
        let dependencies: DataAppDependencies | undefined;
        if (versionRow?.dependencies) {
            // Kill-switch: stripping deps instead would hand out a folder
            // whose src imports packages the lockfile no longer declares.
            if (!this.lightdashConfig.appRuntime.customDependenciesEnabled) {
                throw new ParameterError(
                    'This app declares custom dependencies, and custom app dependencies are disabled on this instance (LIGHTDASH_APP_CUSTOM_DEPENDENCIES_ENABLED), so it cannot be downloaded.',
                );
            }
            const depsPrefix = `${versionPrefix(app.app_id, resolvedVersion)}deps/`;
            const [packageJsonBuffer, lockfileBuffer] = await Promise.all([
                readS3ObjectAsBuffer(
                    s3Client,
                    bucket,
                    `${depsPrefix}package.json`,
                ),
                readS3ObjectAsBuffer(
                    s3Client,
                    bucket,
                    `${depsPrefix}pnpm-lock.yaml`,
                ),
            ]);
            dependencies = {
                packageJson: packageJsonBuffer.toString('utf-8'),
                lockfile: lockfileBuffer.toString('utf-8'),
            };
        }

        this.analytics.track({
            event: 'data_app.downloaded',
            userId: user.userUuid,
            properties: {
                organizationId: app.organization_uuid,
                projectId: projectUuid,
                appUuid: app.app_id,
                version: resolvedVersion,
                versionPinned: version !== undefined,
                fileCount: files.length,
                sourceBytes: tarBuffer.length,
                hasCustomDependencies: dependencies !== undefined,
            },
        });

        return {
            manifest,
            files,
            ...(dependencies !== undefined ? { dependencies } : {}),
            context,
        };
    }

    async getDataAppAuthoringContext(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        designUuid: string | null,
    ): Promise<DataAppContext> {
        await this.assertDataAppsEnabled(user);
        const organizationUuid = await this.getProjectOrgUuid(projectUuid);
        this.assertDataAppAbility(
            user,
            'create',
            organizationUuid,
            projectUuid,
            'Insufficient permissions to create data apps',
        );
        if (!isValidDataAppSlug(slug)) {
            throw new ParameterError(
                `Invalid data app slug "${slug}". Slugs must start with a lowercase letter or digit and contain only lowercase letters, digits, and hyphens, up to 255 characters.`,
            );
        }
        if (await this.appModel.hasAppSlug(projectUuid, slug)) {
            throw new AlreadyExistsError(
                `A data app with slug "${slug}" already exists in this project. Download it with lightdash download --apps ${slug}.`,
            );
        }
        return this.assembleAppContext(
            { appUuid: null, designUuid },
            projectUuid,
            organizationUuid,
        );
    }

    private async assembleAppContext(
        app: { appUuid: string | null; designUuid: string | null },
        projectUuid: string,
        organizationUuid: string,
    ): Promise<DataAppContext> {
        // Each piece is fetched independently — a failure in one degrades only
        // that piece and never blocks the download of manifest + files.

        const semanticLayer = await (async () => {
            try {
                const exploresByUuid =
                    await this.projectModel.getAllExploresFromCache(
                        projectUuid,
                    );
                const explores = Object.values(exploresByUuid).filter(
                    (e): e is Explore => !isExploreError(e),
                );
                const { yaml: modelYaml } =
                    AppGenerateService.exploresToYaml(explores);
                return contextFile('semantic-layer.yml', modelYaml);
            } catch (err) {
                this.logger.warn(
                    `assembleAppContext: semantic layer unavailable for project ${projectUuid}`,
                    err,
                );
                return contextFile(
                    'semantic-layer.yml',
                    '# Semantic layer unavailable\n',
                );
            }
        })();

        const parameters = await (async () => {
            try {
                const globalParameters =
                    await this.projectParametersModel.find(projectUuid);
                const configYaml =
                    AppGenerateService.projectParametersToConfigYaml(
                        globalParameters,
                    );
                return configYaml
                    ? contextFile('parameters.yml', configYaml)
                    : null;
            } catch (err) {
                this.logger.warn(
                    `assembleAppContext: parameters unavailable for project ${projectUuid}`,
                    err,
                );
                return null;
            }
        })();

        const promptHistory = await (async () => {
            if (app.appUuid === null) {
                return contextFile(
                    'prompt-history.md',
                    '# Prompt history\n\n_No previous versions._\n',
                );
            }
            try {
                const withVersions = await this.appModel.getAppWithVersions(
                    app.appUuid,
                    projectUuid,
                    { limit: 100 },
                );
                const promptMd = promptHistoryToMarkdown(
                    withVersions.versions.map((v) => ({
                        version: v.version,
                        prompt: v.prompt ?? '',
                        createdAt:
                            v.created_at instanceof Date
                                ? v.created_at.toISOString()
                                : String(v.created_at),
                    })),
                );
                return contextFile('prompt-history.md', promptMd);
            } catch (err) {
                this.logger.warn(
                    `assembleAppContext: prompt history unavailable for app ${app.appUuid}`,
                    err,
                );
                return contextFile(
                    'prompt-history.md',
                    '# Prompt history\n\n_Unavailable._\n',
                );
            }
        })();

        const theme = await (async () => {
            if (app.designUuid === null) {
                return { instructions: null, assets: [], skippedAssetCount: 0 };
            }
            try {
                const { client: s3Client, bucket } = this.getS3Client();
                return await readDesignForDownload({
                    s3Client,
                    bucket,
                    organizationDesignModel: this.organizationDesignModel,
                    organizationUuid,
                    designUuid: app.designUuid,
                    logger: this.logger,
                });
            } catch (err) {
                this.logger.warn(
                    `assembleAppContext: theme unavailable for org ${organizationUuid}`,
                    err,
                );
                return { instructions: null, assets: [], skippedAssetCount: 0 };
            }
        })();

        return { semanticLayer, parameters, promptHistory, theme };
    }

    /**
     * Applies manifest name/description to the app row when they differ.
     * App-level metadata only — never touches versions or builds.
     */
    private async updateAppMetadataIfChanged(
        existingApp: Pick<DbApp, 'app_id' | 'name' | 'description'>,
        manifest: DataAppCode['manifest'],
        projectUuid: string,
    ): Promise<void> {
        const update: Partial<Pick<DbApp, 'name' | 'description'>> = {};
        if (manifest.name !== existingApp.name) update.name = manifest.name;
        if (manifest.description !== existingApp.description)
            update.description = manifest.description;
        if (Object.keys(update).length > 0) {
            await this.appModel.updateApp(
                existingApp.app_id,
                projectUuid,
                update,
            );
        }
    }

    /**
     * Whether an uploaded bundle would rebuild exactly what `versionRow`
     * already built: same src file set, same custom-dependency summary and,
     * for viz apps, the same declared viz schema. Comparison failures (e.g.
     * source.tar not stored yet for an in-flight generation) count as
     * "changed" so the upload proceeds — skipping is only an optimization.
     */
    private async isUploadIdenticalToVersion(
        appUuid: string,
        versionRow: DbAppVersion,
        sourceFiles: DataAppCodeFile[],
        dependencySummary: AppVersionDependencies | undefined,
        manifestVizSchema: DataAppVizSchema | undefined,
    ): Promise<boolean> {
        if (dependencySummary === undefined) {
            if (versionRow.dependencies !== null) return false;
        } else {
            const stored = versionRow.dependencies;
            if (stored === null) return false;
            if (stored.lockfileHash !== dependencySummary.lockfileHash)
                return false;
            const storedCustom = new Map(
                stored.custom.map((dep) => [dep.name, dep.version]),
            );
            if (
                storedCustom.size !== dependencySummary.custom.length ||
                !dependencySummary.custom.every(
                    (dep) => storedCustom.get(dep.name) === dep.version,
                )
            ) {
                return false;
            }
        }
        if (!isEqual(versionRow.viz_schema ?? null, manifestVizSchema ?? null))
            return false;

        try {
            const { client, bucket } = this.getS3Client();
            const tarBuffer = await readS3ObjectAsBuffer(
                client,
                bucket,
                `${versionPrefix(appUuid, versionRow.version)}source.tar`,
            );
            const storedFiles =
                await AppGenerateService.extractTarFiles(tarBuffer);
            if (storedFiles.length !== sourceFiles.length) return false;
            const storedByPath = new Map(
                storedFiles.map((file) => [file.path, file.contentBase64]),
            );
            return sourceFiles.every(
                (file) => storedByPath.get(file.path) === file.contentBase64,
            );
        } catch (err) {
            this.logger.warn(
                `App ${appUuid}: unchanged-upload check failed, proceeding with a new version: ${getErrorMessage(err)}`,
            );
            return false;
        }
    }

    async importAppCode(
        user: SessionUser,
        projectUuid: string,
        body: ImportAppCodeRequestBody,
    ): Promise<{
        appUuid: string;
        version: number;
        action: 'create' | 'append' | 'unchanged';
        slug: string;
        warnings: string[];
    }> {
        await this.assertDataAppsEnabled(user);

        const code = validateDataAppCode(body.code);
        const sourceFiles = code.files.filter((f) => f.path.startsWith('src/'));
        if (sourceFiles.length === 0) {
            throw new ParameterError(
                'Uploaded bundle has no src/ files to build',
            );
        }

        const organizationUuid = await this.getProjectOrgUuid(projectUuid);

        // Resolve manifest external-connection links up front so a broken
        // bundle rejects before creating anything.
        const manifestLinks = code.manifest.externalConnections;
        const { resolvedLinks, linkWarnings } =
            await this.resolveManifestExternalConnections(
                user,
                projectUuid,
                organizationUuid,
                manifestLinks,
            );

        // Validate the round-tripped viz schema up front and fail loud: the
        // build-from-source pipeline has no generation run to re-emit it, so
        // silently dropping a bad one would unlist the viz from the picker.
        let manifestVizSchema: DataAppVizSchema | undefined;
        if (code.manifest.vizSchema !== undefined) {
            const parsed = dataAppVizSchema.safeParse(code.manifest.vizSchema);
            if (!parsed.success) {
                const issues = parsed.error.issues
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join('; ');
                throw new ParameterError(
                    `Invalid vizSchema in the app manifest (${issues}). Re-download the app or fix lightdash-app.yml.`,
                );
            }
            manifestVizSchema = parsed.data;
        }

        const trackUploadRejected = (
            reason: DataAppUploadRejectedEvent['properties']['reason'],
            details: {
                customDependencies?: AppVersionDependencyEntry[];
                error?: unknown;
            } = {},
        ): void => {
            this.analytics.track({
                event: 'data_app.upload_rejected',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    targetAppUuid: body.targetAppUuid,
                    reason,
                    ...(details.customDependencies !== undefined
                        ? {
                              customDependencyCount:
                                  details.customDependencies.length,
                              customDependencies: details.customDependencies,
                          }
                        : {}),
                    ...(details.error !== undefined
                        ? {
                              error: AppGenerateService.truncateEnd(
                                  getErrorMessage(details.error),
                                  500,
                              ),
                          }
                        : {}),
                },
            });
        };

        // Validate the declared dependency set against the template baseline.
        // An empty custom set is treated as no-dependencies (some CLIs attach
        // the template set redundantly) and nothing is stored.
        let dependencySummary: AppVersionDependencies | undefined;
        if (code.dependencies !== undefined) {
            let customDeps: Record<string, string>;
            try {
                ({ customDeps } = validateDataAppDependencies(
                    code.dependencies,
                    {
                        templateDependencies: buildTemplateBaseline(
                            code.dependencies.packageJson,
                        ),
                        // Lockfile tarball URLs must resolve to hosts the
                        // sandbox egress will actually allow.
                        allowedTarballHosts:
                            this.lightdashConfig.appRuntime
                                .dependencyRegistryHosts,
                    },
                ));
            } catch (err) {
                trackUploadRejected('dependency_validation', { error: err });
                throw new ParameterError(getErrorMessage(err));
            }
            if (Object.keys(customDeps).length > 0) {
                const customDependencies: AppVersionDependencyEntry[] =
                    Object.entries(customDeps).map(([name, version]) => ({
                        name,
                        version,
                    }));
                // Role gate: adding custom npm dependencies is a supply-chain
                // capability, so it requires manage:DataAppDependency (admins
                // only by default) — a level above the create/manage:DataApp
                // needed to upload a template-only app. Checked before the
                // instance/org gates so an unauthorized user gets a clear 403.
                try {
                    this.assertCanManageDataAppDependencies(
                        user,
                        organizationUuid,
                        projectUuid,
                    );
                } catch (err) {
                    trackUploadRejected('insufficient_permissions', {
                        customDependencies,
                        error: err,
                    });
                    throw err;
                }
                if (
                    !this.lightdashConfig.appRuntime.customDependenciesEnabled
                ) {
                    trackUploadRejected(
                        'custom_dependencies_disabled_instance',
                        { customDependencies },
                    );
                    throw new ParameterError(
                        'Custom app dependencies are disabled on this instance (LIGHTDASH_APP_CUSTOM_DEPENDENCIES_ENABLED). Remove the added packages or ask an admin to enable them.',
                    );
                }
                // Per-org rollout gate, layered on the instance env gate: even
                // when the instance allows custom deps, the org must be
                // explicitly enabled. Only applies to uploading NEW custom-dep
                // content — builds/downloads of already-approved sets stay
                // gated by the env kill-switch alone.
                const { enabled: orgAllowsCustomDeps } =
                    await this.featureFlagModel.get({
                        user,
                        featureFlagId:
                            FeatureFlags.EnableDataAppCustomDependencies,
                    });
                if (!orgAllowsCustomDeps) {
                    trackUploadRejected('custom_dependencies_disabled_org', {
                        customDependencies,
                    });
                    throw new ParameterError(
                        'Custom app dependencies are not enabled for your organization. Contact your Lightdash admin to request access.',
                    );
                }
                // Minimum-release-age guard (no-op unless the instance opts in
                // via LIGHTDASH_APP_DEPENDENCY_MIN_RELEASE_AGE_DAYS): reject
                // custom packages whose resolved version is too freshly
                // published to trust.
                const lockfilePackages = extractLockfilePackages(
                    code.dependencies.lockfile,
                );
                try {
                    await assertDependenciesMeetMinReleaseAge({
                        packages: lockfilePackages.filter(
                            (p) => customDeps[p.name] !== undefined,
                        ),
                        minReleaseAgeDays:
                            this.lightdashConfig.appRuntime
                                .dependencyMinReleaseAgeDays,
                        registryHost:
                            this.lightdashConfig.appRuntime
                                .dependencyRegistryHosts[0] ??
                            'registry.npmjs.org',
                        now: Date.now(),
                    });
                } catch (err) {
                    trackUploadRejected('min_release_age', {
                        customDependencies,
                        error: err,
                    });
                    throw err;
                }
                // Malware screen over the WHOLE resolved tree (transitive
                // included) — supply-chain attacks usually arrive through a
                // transitive dep, not the package the author added directly.
                try {
                    await assertDependenciesHaveNoKnownMalware({
                        packages: lockfilePackages,
                        enabled:
                            this.lightdashConfig.appRuntime
                                .dependencyMalwareCheckEnabled,
                    });
                } catch (err) {
                    trackUploadRejected('malware', {
                        customDependencies,
                        error: err,
                    });
                    throw err;
                }
                dependencySummary = {
                    custom: customDependencies,
                    lockfileHash: createHash('sha256')
                        .update(code.dependencies.lockfile)
                        .digest('hex'),
                };
            }
        }

        // Identity resolution (charts-as-code pattern): the manifest slug is
        // matched against the TARGET project — found → append a version,
        // missing → create with that exact slug. targetAppUuid remains as the
        // fallback for pre-slug bundles/CLIs; createNew forces a fresh app.
        const manifestSlug = code.manifest.slug;
        // Reject before any lookup: the slug becomes a project-scoped index
        // key here and a filesystem folder name on the CLI's next download —
        // a hand-edited manifest (e.g. `slug: ../../../../tmp/evil`) must
        // never reach either use unvalidated.
        if (manifestSlug !== undefined && !isValidDataAppSlug(manifestSlug)) {
            throw new ParameterError(
                `Invalid slug "${manifestSlug}" in the app manifest. Slugs must start with a lowercase letter or digit and contain only lowercase letters, digits, and hyphens, up to 255 characters. Re-download the app or fix lightdash-app.yml.`,
            );
        }
        let existingApp: Awaited<ReturnType<AppModel['findApp']>> | undefined;
        if (body.createNew) {
            existingApp = undefined;
        } else if (manifestSlug !== undefined) {
            existingApp = await this.appModel.findAppBySlug(
                projectUuid,
                manifestSlug,
            );
        } else if (body.targetAppUuid) {
            existingApp = await this.appModel.findApp(
                body.targetAppUuid,
                projectUuid,
            );
            if (existingApp === undefined) {
                throw new ParameterError(
                    `App ${body.targetAppUuid} not found in project ${projectUuid}`,
                );
            }
        }
        const action: 'create' | 'append' =
            existingApp !== undefined ? 'append' : 'create';
        // Mirrors the resolution precedence above. Watch 'uuid-fallback' and
        // 'none' (both pre-slug bundles) decay to zero before removing the
        // targetAppUuid fallback in a future codeVersion bump.
        let identitySource: DataAppUploadIdentitySource;
        if (body.createNew) {
            identitySource = 'create-new';
        } else if (manifestSlug !== undefined) {
            identitySource = 'slug';
        } else if (body.targetAppUuid) {
            identitySource = 'uuid-fallback';
        } else {
            identitySource = 'none';
        }

        // A bundle identical to the app's latest version needs no new version
        // and no rebuild — bulk re-uploads would otherwise burn build slots on
        // unchanged apps and trip the per-project build cap. Checked before
        // that cap so unchanged uploads always succeed. An 'error' latest
        // version never skips, so re-uploading the same source retries the
        // build. App-level metadata (name/description) and links still apply.
        if (
            action === 'append' &&
            existingApp !== undefined &&
            body.force !== true
        ) {
            await this.assertCanManageApp(
                user,
                existingApp,
                'You do not have access to update this app',
            );
            const latestVersion = await this.appModel.getLatestVersion(
                existingApp.app_id,
            );
            if (
                latestVersion !== null &&
                latestVersion.status !== 'error' &&
                (await this.isUploadIdenticalToVersion(
                    existingApp.app_id,
                    latestVersion,
                    sourceFiles,
                    dependencySummary,
                    existingApp.template === DATA_APP_VIZ_TEMPLATE
                        ? manifestVizSchema
                        : undefined,
                ))
            ) {
                await this.updateAppMetadataIfChanged(
                    existingApp,
                    code.manifest,
                    projectUuid,
                );
                if (manifestLinks !== undefined) {
                    await this.externalConnectionModel.replaceAppLinks(
                        existingApp.app_id,
                        resolvedLinks,
                    );
                }
                this.analytics.track({
                    event: 'data_app.uploaded',
                    userId: user.userUuid,
                    properties: {
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                        appUuid: existingApp.app_id,
                        version: latestVersion.version,
                        action: 'unchanged',
                        template: code.manifest.template,
                        sourceFileCount: sourceFiles.length,
                        sourceBytes: sourceFiles.reduce(
                            (total, file) =>
                                total +
                                Buffer.byteLength(file.contentBase64, 'base64'),
                            0,
                        ),
                        hasCustomDependencies: dependencySummary !== undefined,
                        customDependencyCount:
                            dependencySummary?.custom.length ?? 0,
                        customDependencies: dependencySummary?.custom ?? [],
                        identitySource,
                        ...(dependencySummary !== undefined
                            ? { lockfileHash: dependencySummary.lockfileHash }
                            : {}),
                    },
                });
                return {
                    appUuid: existingApp.app_id,
                    version: latestVersion.version,
                    action: 'unchanged',
                    slug: existingApp.slug,
                    warnings: linkWarnings,
                };
            }
        }

        const inProgressCount =
            await this.appModel.countInProgressVersionsForProject(projectUuid);
        if (inProgressCount >= MAX_CONCURRENT_APP_BUILDS_PER_PROJECT) {
            throw new TooManyRequestsError(
                `Too many app builds in progress for this project (${inProgressCount}/${MAX_CONCURRENT_APP_BUILDS_PER_PROJECT}). Wait for some to finish and try again.`,
            );
        }

        let newAppUuid: string;
        let newAppSlug: string;
        let newVersion: number;

        if (action === 'append' && existingApp !== undefined) {
            await this.assertCanManageApp(
                user,
                existingApp,
                'You do not have access to update this app',
            );
            await this.updateAppMetadataIfChanged(
                existingApp,
                code.manifest,
                projectUuid,
            );
            newAppUuid = existingApp.app_id;
            newAppSlug = existingApp.slug;
            const latestVersion = await this.appModel.getLatestVersion(
                existingApp.app_id,
            );
            newVersion = (latestVersion?.version ?? 0) + 1;
            await this.appModel.createVersion(
                existingApp.app_id,
                { version: newVersion, prompt: '' },
                'pending',
                user.userUuid,
                AppGenerateService.buildCopiedResources(null),
                dependencySummary,
                // The target app's stored template governs, not the manifest's
                existingApp.template === DATA_APP_VIZ_TEMPLATE
                    ? manifestVizSchema
                    : undefined,
            );
        } else {
            this.assertDataAppAbility(
                user,
                'create',
                organizationUuid,
                projectUuid,
                'Insufficient permissions to create data apps',
            );
            if (body.spaceUuid) {
                const spaceContext =
                    await this.spacePermissionService.getSpaceAccessContext(
                        user.userUuid,
                        body.spaceUuid,
                    );
                this.assertDataAppAbility(
                    user,
                    'manage',
                    organizationUuid,
                    projectUuid,
                    'Insufficient permissions to create a data app in this space',
                    spaceContext,
                );
            }
            newVersion = 1;
            const { app } = await this.appModel.createWithVersion(
                {
                    project_uuid: projectUuid,
                    created_by_user_uuid: user.userUuid,
                    name: code.manifest.name,
                    description: code.manifest.description,
                    template: code.manifest.template,
                    space_uuid: body.spaceUuid ?? null,
                    // Round-trip the manifest slug exactly; createNew and
                    // pre-slug bundles let the model generate a unique one.
                    ...(manifestSlug !== undefined && !body.createNew
                        ? { slug: manifestSlug }
                        : {}),
                },
                { version: newVersion, prompt: '' },
                'pending',
                AppGenerateService.buildCopiedResources(null),
                dependencySummary,
                code.manifest.template === DATA_APP_VIZ_TEMPLATE
                    ? manifestVizSchema
                    : undefined,
                // Verbatim slug + loud conflict, so re-uploads stay
                // idempotent (never silently minting suffixed duplicates).
                { forceSlug: true },
            );
            newAppUuid = app.app_id;
            newAppSlug = app.slug;
        }

        // Reconcile links only when the manifest carries the field — bundles
        // downloaded before link support must leave existing links untouched.
        if (manifestLinks !== undefined) {
            await this.externalConnectionModel.replaceAppLinks(
                newAppUuid,
                resolvedLinks,
            );
        }

        // Re-tar the source files into a single source.tar Buffer
        const sourceTar = await new Promise<Buffer>((resolve, reject) => {
            const packer = tarPack();
            const chunks: Buffer[] = [];
            packer.on('data', (chunk: Buffer) => chunks.push(chunk));
            packer.on('end', () => resolve(Buffer.concat(chunks)));
            packer.on('error', reject);

            const addNext = (index: number): void => {
                if (index >= sourceFiles.length) {
                    packer.finalize();
                    return;
                }
                const file = sourceFiles[index];
                const content = Buffer.from(file.contentBase64, 'base64');
                packer.entry({ name: file.path }, content, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    addNext(index + 1);
                });
            };
            addNext(0);
        });

        // Store source.tar in S3
        const { client, bucket } = this.getS3Client();
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: `${versionPrefix(newAppUuid, newVersion)}source.tar`,
                Body: sourceTar,
                ContentType: 'application/x-tar',
            }),
        );

        // Store the declared dependency files next to the source archive so
        // download can round-trip them (builds consume them in a later slice).
        // The stored package.json carries the TRUSTED template scripts, not
        // the uploader's — the sandbox `pnpm build` and every downstream
        // download read this file, so script commands must stay server-owned.
        if (
            dependencySummary !== undefined &&
            code.dependencies !== undefined
        ) {
            const depsPrefix = `${versionPrefix(newAppUuid, newVersion)}deps/`;
            await client.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: `${depsPrefix}package.json`,
                    Body: sanitizeAppPackageJsonScripts(
                        code.dependencies.packageJson,
                        TEMPLATE_SCRIPTS,
                    ),
                    ContentType: 'application/json',
                }),
            );
            await client.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: `${depsPrefix}pnpm-lock.yaml`,
                    Body: code.dependencies.lockfile,
                    ContentType: 'text/yaml',
                }),
            );
        }

        // Enqueue the build-only pipeline
        await this.schedulerClient.appBuildFromSource({
            appUuid: newAppUuid,
            version: newVersion,
            projectUuid,
            organizationUuid,
            userUuid: user.userUuid,
        });

        this.analytics.track({
            event: 'data_app.uploaded',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                appUuid: newAppUuid,
                version: newVersion,
                action,
                template: code.manifest.template,
                sourceFileCount: sourceFiles.length,
                sourceBytes: sourceTar.length,
                hasCustomDependencies: dependencySummary !== undefined,
                customDependencyCount: dependencySummary?.custom.length ?? 0,
                customDependencies: dependencySummary?.custom ?? [],
                identitySource,
                ...(dependencySummary !== undefined
                    ? { lockfileHash: dependencySummary.lockfileHash }
                    : {}),
            },
        });

        return {
            appUuid: newAppUuid,
            version: newVersion,
            action,
            slug: newAppSlug,
            warnings: linkWarnings,
        };
    }

    async runBuildFromSourcePipeline(
        payload: AppBuildFromSourceJobPayload,
    ): Promise<void> {
        const { appUuid, version, organizationUuid, projectUuid } = payload;
        const { client, bucket } = this.getS3Client();
        const copilot =
            await this.orgAiCopilotConfigResolver.getClaudeCodeConfig(
                organizationUuid,
            );

        // Look up the version's custom dependency set once — null means the
        // build uses the template set only (no install step).
        const versionRow = await this.appModel.getVersion(appUuid, version);
        const versionDeps = versionRow?.dependencies ?? null;
        const registryHosts =
            versionDeps !== null
                ? this.lightdashConfig.appRuntime.dependencyRegistryHosts
                : [];

        let sandbox: SandboxHandle | undefined;
        let sandboxUuid: string | undefined;
        const heartbeat = setInterval(() => {
            void this.appModel
                .touchVersionIfInProgress(appUuid, version)
                .catch((e) => {
                    this.logger.warn(
                        `App ${appUuid}: heartbeat failed: ${getErrorMessage(e)}`,
                    );
                });
        }, HEARTBEAT_INTERVAL_MS);
        try {
            const advanced = await this.advanceStage(
                appUuid,
                version,
                'sandbox',
                'Setting up build environment',
            );
            if (!advanced) {
                return;
            }

            const result = await this.createSandbox(
                appUuid,
                organizationUuid,
                projectUuid,
                copilot,
                registryHosts,
            );
            sandbox = result.sandbox;
            sandboxUuid = result.sandboxUuid;
            await this.appModel.updateSandboxUuid(appUuid, sandboxUuid);

            await this.restoreSourceFromS3(
                sandbox,
                client,
                bucket,
                appUuid,
                version,
            );

            const buildAdvanced = await this.advanceStage(
                appUuid,
                version,
                'building',
                'Building your app',
            );
            if (!buildAdvanced) {
                return;
            }

            // When the version declares custom deps, restore the stored
            // package.json + lockfile and run pnpm install before the build.
            if (versionDeps !== null) {
                try {
                    await this.appModel.recordBuildNarration(
                        appUuid,
                        version,
                        'Installing dependencies',
                        'stage',
                    );
                } catch (e) {
                    this.logger.warn(
                        `App ${appUuid}: failed to update status message: ${getErrorMessage(e)}`,
                    );
                }
                try {
                    await this.restoreDepsToSandbox(
                        sandbox,
                        client,
                        bucket,
                        appUuid,
                        version,
                        versionDeps,
                    );
                } catch (installError) {
                    await this.markError(
                        appUuid,
                        version,
                        installError,
                        'Installing dependencies',
                    );
                    return;
                }
            }

            const build = await this.runBuild(sandbox, appUuid);
            if (build.exitCode !== 0) {
                const buildOutput = [build.stderr, build.stdout]
                    .filter(Boolean)
                    .join('\n')
                    .slice(-2000);
                await this.markError(
                    appUuid,
                    version,
                    buildOutput ||
                        `Build exited with code ${build.exitCode} and no output`,
                    'Build failed',
                );
                return;
            }

            const packageAdvanced = await this.advanceStage(
                appUuid,
                version,
                'packaging',
                'Packaging your app',
            );
            if (!packageAdvanced) {
                return;
            }

            const { distTar, sourceTar } = await this.packageArtifacts(
                sandbox,
                appUuid,
            );
            await this.uploadToS3(
                client,
                bucket,
                appUuid,
                version,
                distTar,
                sourceTar,
            );

            await this.appModel.updateVersionStatusIfInProgress(
                appUuid,
                version,
                'ready',
                null,
                null,
            );
        } catch (err) {
            await this.markError(appUuid, version, err, 'Build failed');
        } finally {
            clearInterval(heartbeat);
            if (sandbox !== undefined && sandboxUuid !== undefined) {
                await this.suspendSandbox(sandboxUuid, sandbox, appUuid);
            }
        }
    }
}
