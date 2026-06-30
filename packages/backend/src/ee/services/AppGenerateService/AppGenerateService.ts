import {
    CopyObjectCommand,
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
    assertEmbeddedAuth,
    assertUnreachable,
    DATA_APP_CLAUDE_MODELS,
    DEFAULT_DATA_APP_CLAUDE_MODEL,
    FeatureFlags,
    ForbiddenError,
    formatPromptWithClarifications,
    getErrorMessage,
    isDashboardChartTileType,
    isExploreError,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    type AnonymousAccount,
    type AppChartReference,
    type AppClarification,
    type AppDashboardReference,
    type AppExternalConnectionReference,
    type AppGeneratePipelineJobPayload,
    type AppVersionChartResource,
    type AppVersionExternalConnectionResource,
    type AppVersionResources,
    type ChartReference,
    type ChartSampleData,
    type CompiledExploreJoin,
    type CompiledTable,
    type DataAppClaudeModel,
    type DataAppTemplate,
    type EmbedProjectApp,
    type Explore,
    type ExternalConnectionMethod,
    type ExternalConnectionSample,
    type LightdashProjectParameter,
    type PromoteAppAction,
    type PromoteAppDiff,
    type SessionUser,
    type TogglePinnedItemInfo,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { Knex } from 'knex';
import { performance } from 'node:perf_hooks';
import { PassThrough, Readable } from 'node:stream';
import { extract, type Headers } from 'tar-stream';
import { validate as isValidUuid, v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { fromSession } from '../../../auth/account';
import { resolveS3Credentials } from '../../../clients/Aws/S3BaseClient';
import { LightdashConfig } from '../../../config/parseConfig';
import {
    APP_VERSION_STAGE_ORDER,
    APP_VERSION_TERMINAL_STATUSES,
    isAppVersionInProgress,
    type AppVersionStatus,
    type DbApp,
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
import { type ExternalConnectionModel } from '../../models/ExternalConnectionModel';
import type { SandboxRegistryModel } from '../../models/SandboxRegistryModel';
import type { CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { getModel } from '../ai/models';
import { getAiCallTelemetry } from '../ai/utils/aiCallTelemetry';
import {
    createSandboxManager,
    S3SnapshotStore,
    SandboxCommandError,
    SandboxManager,
    type PersistentWorkspace,
    type SandboxHandle,
    type SandboxSpec,
} from '../SandboxRuntime';
import { assertCanViewApp as assertUserCanViewApp } from './appAuthz';
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
    addClaudeUsage,
    ClaudeStreamProcessor,
    ZERO_CLAUDE_USAGE,
    type ClaudeGenerationUsage,
} from './ClaudeStreamProcessor';
import {
    copyDesignIntoSandbox,
    type DesignSandboxCopyResult,
} from './designSandboxCopy';
import { getTemplateInstructions } from './templates';

type AppExternalConnectionDoc = {
    alias: string;
    origin: string;
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
};

type GenerateAppOptions = {
    designUuidInput?: string | null;
    externalConnections?: AppExternalConnectionReference[];
};

type GenerateAppResult = {
    appUuid: string;
    version: number;
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

    private getAnthropicApiKey(): string {
        const key = this.lightdashConfig.ai.copilot.providers.anthropic?.apiKey;
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
     * is set.
     */
    private getClaudeCodeEnv(): Record<string, string> {
        return buildClaudeCodeEnv(this.lightdashConfig.ai.copilot, () =>
            this.getAnthropicApiKey(),
        );
    }

    /**
     * The sandbox manager over the provider selected by `SANDBOX_PROVIDER`
     * (e2b | docker). Memoized — the feature talks only to the manager for
     * lifecycle (acquire/resume/suspend/destroy via the stable `sandbox_uuid`)
     * and to the returned {@link SandboxHandle} for the data plane.
     * See SandboxRuntime/DESIGN.md.
     */
    private getSandboxManager(): SandboxManager {
        if (!this.sandboxManager) {
            this.sandboxManager = createSandboxManager({
                provider: this.lightdashConfig.appRuntime.sandboxProvider,
                e2bApiKey: this.lightdashConfig.appRuntime.e2bApiKey,
                dockerImage: this.lightdashConfig.appRuntime.sandboxDockerImage,
                lambdaMicroVm: this.lightdashConfig.appRuntime.lambdaMicroVm,
                snapshotStore: new S3SnapshotStore({
                    lightdashConfig: this.lightdashConfig,
                }),
                registryModel: this.sandboxRegistryModel,
                logger: this.logger,
                idleTimeoutMs:
                    this.lightdashConfig.appRuntime.sandboxIdleTimeoutMs,
                snapshotRetentionMs:
                    this.lightdashConfig.appRuntime.sandboxSnapshotRetentionMs,
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
        // E2B treats `name` and `name:default` interchangeably, so an empty
        // tag is fine — it just resolves to the implicit `default` build.
        return e2bTemplateTag
            ? `${e2bTemplateName}:${e2bTemplateTag}`
            : e2bTemplateName;
    }

    private buildSandboxSpec(): SandboxSpec {
        return {
            templateRef: this.getSandboxTemplateRef(),
            timeoutMs: 60 * 60 * 1000,
            egress: {
                allow: claudeCodeAllowedHosts(this.lightdashConfig.ai.copilot),
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
     * Deterministic staging path for uploaded images.
     * No file extension — the MIME type is stored as the S3 object's ContentType.
     */
    private static imageStagingKey(appUuid: string, imageId: string): string {
        return `apps/${appUuid}/uploads/${imageId}`;
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
        };
        return extMap[mimeType] ?? 'png';
    }

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

    private static readonly MAX_IMAGES_PER_VERSION = 4;

    private static validateImageIds(imageIds: string[]): void {
        if (imageIds.length > AppGenerateService.MAX_IMAGES_PER_VERSION) {
            throw new ParameterError(
                `Too many images: ${imageIds.length}. Maximum: ${AppGenerateService.MAX_IMAGES_PER_VERSION}`,
            );
        }
        for (const id of imageIds) {
            if (!isValidUuid(id)) {
                throw new ParameterError(
                    'Invalid imageId: must be a valid UUID',
                );
            }
        }
    }

    /**
     * Resolve the user-supplied Claude model to a known value, defaulting when
     * absent. Rejects unknown strings outright so a stray value can't shell
     * out as `--model <anything>` against the Claude CLI inside the sandbox.
     */
    private static resolveClaudeModel(
        claudeModel: DataAppClaudeModel | undefined,
    ): DataAppClaudeModel {
        if (claudeModel === undefined) {
            return DEFAULT_DATA_APP_CLAUDE_MODEL;
        }
        if (
            !(DATA_APP_CLAUDE_MODELS as readonly string[]).includes(claudeModel)
        ) {
            throw new ParameterError(
                `Invalid claudeModel: ${claudeModel}. Allowed: ${DATA_APP_CLAUDE_MODELS.join(
                    ', ',
                )}`,
            );
        }
        return claudeModel;
    }

    /**
     * Read the first few bytes of a stream, validate image magic bytes,
     * then return a new Readable that replays those bytes followed by
     * the rest of the original stream.
     */
    /**
     * Buffer the full upload body (capped at maxBytes), then validate that
     * its leading bytes match the declared MIME type. Returns the buffer.
     * Buffering up-front avoids stream pause/pipe state-machine pitfalls
     * and gives us a Buffer ready for signed S3 PutObject.
     */
    private static async bufferAndValidate(
        stream: Readable,
        mimeType: string,
        maxBytes: number,
    ): Promise<Buffer> {
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of stream) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buf.length;
            if (total > maxBytes) {
                throw new ParameterError(
                    `Image too large: exceeded ${maxBytes} bytes`,
                );
            }
            chunks.push(buf);
        }
        const body = Buffer.concat(chunks);

        if (body.length === 0) {
            throw new ParameterError('Upload body is empty');
        }
        if (body.length < AppGenerateService.SIGNATURE_PREFIX_SIZE) {
            throw new ParameterError(
                'Upload body too small to be a valid image',
            );
        }

        const signatures = AppGenerateService.IMAGE_SIGNATURES[mimeType];
        if (signatures) {
            const matchesAll = signatures.every((sig) =>
                sig.bytes.every((byte, i) => body[sig.offset + i] === byte),
            );
            if (!matchesAll) {
                throw new ParameterError(
                    `File content does not match declared Content-Type: ${mimeType}`,
                );
            }
        }

        return body;
    }

    async uploadImage(
        user: SessionUser,
        projectUuid: string,
        mimeType: string,
        body: Readable,
        contentLength: number,
        appUuid: string,
        kind?: 'screenshot',
    ): Promise<{ imageId: string }> {
        await this.assertDataAppsEnabled(user);

        // For iterations the app already exists — use its space + creator
        // context so a space editor or the creator can attach an image. For
        // initial creation the appUuid is generated client-side and the app
        // row doesn't exist yet, so we authorize against `create:DataApp`
        // (anyone who can create an app can stage an image for it).
        const app = await this.appModel.findApp(appUuid, projectUuid);
        if (app) {
            await this.assertCanManageApp(
                user,
                app,
                'Insufficient permissions to upload app images',
            );
        } else {
            const organizationUuid = await this.getProjectOrgUuid(projectUuid);
            this.assertDataAppAbility(
                user,
                'create',
                organizationUuid,
                projectUuid,
                'Insufficient permissions to upload app images',
            );
        }

        const validTypes = [
            'image/png',
            'image/jpeg',
            'image/gif',
            'image/webp',
        ];
        if (!validTypes.includes(mimeType)) {
            throw new ParameterError(
                `Invalid image type: ${mimeType}. Allowed: ${validTypes.join(', ')}`,
            );
        }

        const maxSize = 10 * 1024 * 1024; // 10 MB
        if (contentLength > maxSize) {
            throw new ParameterError(
                `Image too large: ${contentLength} bytes. Maximum: ${maxSize} bytes`,
            );
        }

        // Buffer the whole body and validate its MIME signature. We need the
        // full Buffer anyway so the AWS SDK can use standard S3v4 signing —
        // streaming bodies cause chunked signing which MinIO/GCS reject with
        // RequestTimeout.
        const bufferedBody = await AppGenerateService.bufferAndValidate(
            body,
            mimeType,
            maxSize,
        );

        const { client: s3Client, bucket } = this.getS3Client();
        const imageId = uuidv4();
        const s3Key = AppGenerateService.imageStagingKey(appUuid, imageId);

        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: s3Key,
                Body: bufferedBody,
                ContentLength: bufferedBody.length,
                ContentType: mimeType,
                // Persist the upload kind on the staged object so
                // `writeImageToSandbox` can decide the filename prefix later
                // without needing a separate DB column.
                ...(kind ? { Metadata: { kind } } : {}),
            }),
        );

        this.analytics.track({
            event: 'data_app.image_uploaded',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                appUuid,
                imageId,
                mimeType,
                sizeBytes: contentLength,
            },
        });

        return { imageId };
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
        const s3Key = AppGenerateService.imageStagingKey(appUuid, imageId);

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

        const bufferedBody = await AppGenerateService.bufferAndValidate(
            body,
            mimeType,
            maxSize,
        );

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
        await this.assertCanManageApp(
            user,
            app,
            'Insufficient permissions to view app thumbnail',
        );

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

    private static truncateEnd(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return `...[truncated ${text.length - maxLength} chars]...${text.slice(-maxLength)}`;
    }

    private static elapsed(start: number): number {
        return Math.round(performance.now() - start);
    }

    trackTimeoutFailure(
        payload: AppGeneratePipelineJobPayload,
        error: unknown,
    ): void {
        this.trackVersionFailed(payload, 'timeout', error, {}, null, 0);
    }

    private trackVersionFailed(
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
    ): void {
        this.analytics.track({
            event: 'data_app.version.failed',
            userId: payload.userUuid,
            properties: {
                organizationId: payload.organizationUuid,
                projectId: payload.projectUuid,
                appUuid: payload.appUuid,
                version: payload.version,
                isIteration: payload.isIteration,
                claudeModel:
                    payload.claudeModel ?? DEFAULT_DATA_APP_CLAUDE_MODEL,
                failureStage,
                errorMessage: AppGenerateService.truncateEnd(
                    getErrorMessage(error),
                    500,
                ),
                buildFixAttempts,
                totalDurationMs:
                    overallStart !== null
                        ? AppGenerateService.elapsed(overallStart)
                        : 0,
                sandboxMs: durations.sandboxMs,
                resumeMs: durations.resumeMs,
                restoreMs: durations.restoreMs,
                catalogMs: durations.catalogMs,
                generateMs: durations.generateMs,
                buildMs: durations.buildMs,
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
    ): Promise<{
        sandboxUuid: string;
        sandbox: SandboxHandle;
        durationMs: number;
    }> {
        const start = performance.now();
        const spec = this.buildSandboxSpec();
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
    ): Promise<{ sandbox: SandboxHandle; durationMs: number }> {
        const start = performance.now();
        const sandbox = await this.getSandboxManager().resume({
            sandboxUuid,
            spec: this.buildSandboxSpec(),
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
            fileEntries.push(
                `- ${filename} ("${ref.chartName}", explore: ${ref.exploreName})${sampleSuffix}`,
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
            const fileContent = JSON.stringify(
                {
                    alias: doc.alias,
                    signature:
                        "externalFetch(alias: string, opts: { method?: 'GET' | 'POST'; path: string; query?: Record<string, string>; body?: unknown }): Promise<{ status: number; contentType: string; body: unknown; truncated: boolean }>",
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
        imageIds: string[] | undefined,
        s3Client: S3Client,
        bucket: string,
        chartReferences: ChartReference[] | undefined,
        template: DataAppTemplate | undefined,
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
        // types, and parameters. See exploresToYaml.
        const exploresByUuid =
            await this.projectModel.getAllExploresFromCache(projectUuid);
        const explores = Object.values(exploresByUuid).filter(
            (explore): explore is Explore => !isExploreError(explore),
        );
        const {
            yaml: modelYaml,
            tableCount,
            dimensionCount,
            metricCount,
        } = AppGenerateService.exploresToYaml(explores);

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
            'rm -f /tmp/dbt-repo/models/schema.yml /tmp/dbt-repo/lightdash.config.yml /tmp/prompt.txt 2>/dev/null; rm -rf /tmp/images /tmp/metric-queries /tmp/external-data 2>/dev/null; true',
            { timeoutMs: 10_000 },
        );

        await sandbox.files.write('/tmp/dbt-repo/models/schema.yml', modelYaml);
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

        // Prepend starter-template instructions, when one was selected on creation
        if (template) {
            const templateInstructions = getTemplateInstructions(template);
            if (templateInstructions) {
                finalPrompt = `${templateInstructions}\n\n${finalPrompt}`;
            }
        }

        // Resolve images from staging, copy to version paths, and write to sandbox
        if (imageIds && imageIds.length > 0) {
            const imagePaths = await Promise.all(
                imageIds.map((id) =>
                    this.writeImageToSandbox(
                        sandbox,
                        appUuid,
                        id,
                        s3Client,
                        bucket,
                    ),
                ),
            );
            // Label screenshots distinctly so the agent treats them as
            // "current state of the built app" rather than design targets.
            // Filename convention is set in `writeImageToSandbox`.
            let designIndex = 0;
            const referenceLines = imagePaths
                .map((p) => {
                    const isScreenshot = p
                        .split('/')
                        .pop()
                        ?.startsWith('screenshot-');
                    if (isScreenshot) {
                        return `[Screenshot of the current app at ${p} — use the Read tool to view it. This is what the user is looking at right now, not a design to reproduce.]`;
                    }
                    designIndex += 1;
                    return `[Design reference image ${designIndex} at ${p} — use the Read tool to view it]`;
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
            `App ${appUuid}: model context written (tables=${tableCount}, dimensions=${dimensionCount}, metrics=${metricCount}, yamlBytes=${modelYaml.length}, ${durationMs}ms)`,
        );
        return {
            durationMs,
            tableCount,
            dimensionCount,
            metricCount,
            yamlBytes: modelYaml.length,
        };
    }

    /**
     * Reconstruct the image's staging S3 key from convention, read the object
     * (which gives us the MIME type from ContentType), and write it into the
     * sandbox for Claude to read. Returns the sandbox file path.
     *
     * Design references are dual-written: once to `/tmp/images/` (read-only
     * inspection — picked up by the prompt prepend and the agent's Read
     * tool), and again to `/app/src/uploads/` so the agent can `import` them
     * as Vite assets when the image should ship inside the rendered app
     * (logo, hero illustration, etc). Screenshots are inspection-only and
     * never end up in the bundle — they describe current state, not target.
     */
    private async writeImageToSandbox(
        sandbox: SandboxHandle,
        appUuid: string,
        imageId: string,
        s3Client: S3Client,
        bucket: string,
    ): Promise<string> {
        const stagingKey = AppGenerateService.imageStagingKey(appUuid, imageId);

        this.logger.info(
            `App ${appUuid}: reading staged image (key=${stagingKey})`,
        );

        const response = await s3Client.send(
            new GetObjectCommand({
                Bucket: bucket,
                Key: stagingKey,
            }),
        );

        const mimeType = response.ContentType ?? 'image/png';
        const ext = AppGenerateService.mimeToExt(mimeType);
        // Screenshots get a filename prefix so the agent can tell them apart
        // from user-provided design references. Stamped on the staging object
        // at upload time via S3 metadata (see `uploadImage`).
        const isScreenshot = response.Metadata?.kind === 'screenshot';
        const filename = isScreenshot
            ? `screenshot-${imageId}.${ext}`
            : `${imageId}.${ext}`;
        const sandboxPath = `/tmp/images/${filename}`;

        // Read the image bytes
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

        // Write to sandbox
        this.logger.info(
            `App ${appUuid}: writing image to sandbox (${mimeType}, ${buffer.length} bytes)`,
        );
        await sandbox.commands.run('mkdir -p /tmp/images', {
            timeoutMs: 10_000,
        });
        await sandbox.files.write(sandboxPath, buffer);

        // Design references go into the Vite-bundled source tree so the agent
        // can `import logo from './uploads/<file>'` and have the URL hashed,
        // auth-gated, and CSP-clean — same path as theme images. Screenshots
        // are explicitly inspection-only and skipped to keep the bundle lean.
        if (!isScreenshot) {
            await sandbox.commands.run('mkdir -p /app/src/uploads', {
                timeoutMs: 10_000,
            });
            await sandbox.files.write(`/app/src/uploads/${filename}`, buffer);
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
    private static toolDescriptionToStatusMessage(description: string): string {
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
                return AppGenerateService.randomCodingPhrase();
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
    ): Promise<{
        durationMs: number;
        responseText: string | null;
        toolCallCount: number;
        usage: ClaudeGenerationUsage | null;
        timeToFirstTokenMs: number | null;
        turnDurationsMs: number[];
    }> {
        const start = performance.now();

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
            toolCallCount: number;
            usage: ClaudeGenerationUsage | null;
            timeToFirstTokenMs: number | null;
            turnDurationsMs: number[];
        }> => {
            const sessionFlags =
                continueSession || forceContinue ? '--continue -p' : '-p';
            const processor = new ClaudeStreamProcessor();
            let responseText: string | null = null;
            let sessionEstablished = false;

            const result = await sandbox.commands
                .run(
                    `cat /tmp/prompt.txt | claude ${sessionFlags} ` +
                        `--model ${claudeModel} ` +
                        `--verbose --output-format stream-json --include-partial-messages ` +
                        `--allowedTools "Read(//app/**),Read(//tmp/dbt-repo/**),Read(//tmp/images/**),Read(//tmp/metric-queries/**),Read(//tmp/external-data/**),Write(//app/src/**),Edit(//app/src/**),Glob(//app/**),Glob(//tmp/dbt-repo/**),Glob(//tmp/metric-queries/**),Glob(//tmp/external-data/**),Grep(//app/**),Grep(//tmp/dbt-repo/**),Grep(//tmp/external-data/**)" ` +
                        `--append-system-prompt-file ${AppGenerateService.EFFECTIVE_SKILL_PATH}`,
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
                                        this.updateAppStatus(
                                            appUuid,
                                            version,
                                            'Thinking',
                                        );
                                        break;
                                    case 'thinking_snippet':
                                        this.updateAppStatus(
                                            appUuid,
                                            version,
                                            event.snippet,
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
                                        this.updateAppStatus(
                                            appUuid,
                                            version,
                                            AppGenerateService.toolDescriptionToStatusMessage(
                                                firstTool,
                                            ),
                                        );
                                        break;
                                    }
                                    case 'result':
                                        if (event.text) {
                                            responseText = event.text;
                                        }
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
            const durationMs = AppGenerateService.elapsed(start);
            this.logger.info(
                `App ${appUuid}: Claude code generation completed (model=${claudeModel}, exit=${result.exitCode}, toolCalls=${toolCallCount}, turns=${usage?.numTurns ?? 0}, outputTokens=${usage?.outputTokens ?? 0}, cacheReadTokens=${usage?.cacheReadInputTokens ?? 0}, ${durationMs}ms, attempt ${attempt}/${AppGenerateService.MAX_GENERATION_ATTEMPTS})`,
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
                    toolCallCount,
                    usage,
                    timeToFirstTokenMs,
                    turnDurationsMs,
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

            if (attempt >= AppGenerateService.MAX_GENERATION_ATTEMPTS) {
                // On final failure, promote stderr+stdout to info so the
                // upstream API error (often emitted to stdout in
                // stream-json mode) is captured in production logs.
                const classification = classifyClaudeCliFailure(
                    result.stderr,
                    result.stdout,
                );
                this.logger.info(
                    `App ${appUuid}: Claude failure (category=${classification.category}, exit=${result.exitCode})`,
                );
                this.logger.info(
                    `App ${appUuid}: Claude stderr (tail): ${stderrTail}`,
                );
                this.logger.info(
                    `App ${appUuid}: Claude stdout (tail): ${stdoutTail}`,
                );
                const message = `Claude generation failed (exit ${result.exitCode}): ${result.stderr}`;
                if (classification.category === 'unknown') {
                    throw new Error(message);
                }
                throw new ClaudeGenerationError({
                    message,
                    userMessage: classification.userMessage,
                    category: classification.category,
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
     * pipeline.
     */
    private updateAppStatus(
        appUuid: string,
        version: number,
        message: string,
    ): void {
        void this.appModel
            .updateStatusMessage(appUuid, version, message)
            .catch((e) => {
                this.logger.warn(
                    `App ${appUuid}: failed to update status message: ${getErrorMessage(e)}`,
                );
            });
    }

    /**
     * After a successful first build, ask Claude (with --continue so it has
     * full context) for a short name and description for the app.
     * Returns null if parsing fails — callers should treat this as non-fatal.
     */
    private async generateAppMetadata(
        sandbox: SandboxHandle,
        appUuid: string,
        version: number,
        claudeCodeEnv: Record<string, string>,
        claudeModel: DataAppClaudeModel,
    ): Promise<{
        name: string;
        description: string;
        durationMs: number;
        usage: ClaudeGenerationUsage | null;
    } | null> {
        const start = performance.now();
        const metadataPrompt =
            'Respond with ONLY a JSON object (no markdown, no explanation) ' +
            'containing a short "name" (3-6 words, title case, no quotes around it) ' +
            'and a one-sentence "description" for the app you just built. ' +
            'Example: {"name": "Weekly Sales Dashboard", "description": "Interactive dashboard showing weekly sales trends by region and product category."}';

        await sandbox.commands.run('rm -f /tmp/prompt.txt 2>/dev/null; true', {
            timeoutMs: 10_000,
        });
        await sandbox.files.write('/tmp/prompt.txt', `${metadataPrompt}\n`);

        const generation = await this.runClaudeGeneration(
            sandbox,
            appUuid,
            version,
            true, // --continue: Claude remembers what it just built
            claudeCodeEnv,
            claudeModel,
        );

        const durationMs = AppGenerateService.elapsed(start);

        if (!generation.responseText) {
            this.logger.warn(
                `App ${appUuid}: metadata generation returned no text`,
            );
            return null;
        }

        // Extract JSON from the response (Claude may wrap it in markdown code fences)
        const jsonMatch = generation.responseText.match(/\{[\s\S]*\}/) ?? null;
        if (!jsonMatch) {
            this.logger.warn(
                `App ${appUuid}: could not find JSON in metadata response`,
            );
            return null;
        }

        try {
            const parsed = JSON.parse(jsonMatch[0]);
            const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').trim();
            const name =
                typeof parsed.name === 'string'
                    ? stripHtml(parsed.name).slice(0, 255)
                    : null;
            const description =
                typeof parsed.description === 'string'
                    ? stripHtml(parsed.description).slice(0, 1024)
                    : null;
            if (!name) {
                this.logger.warn(
                    `App ${appUuid}: metadata missing "name" field`,
                );
                return null;
            }
            return {
                name,
                description: description ?? '',
                durationMs,
                usage: generation.usage,
            };
        } catch {
            const safeLog = generation.responseText
                .replace(/[\n\r]/g, ' ')
                .slice(0, 200);
            this.logger.warn(
                `App ${appUuid}: failed to parse metadata JSON: ${safeLog}`,
            );
            return null;
        }
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

            const isBuildError = lastResult.exitCode !== 0;

            this.logger.info(
                `App ${appUuid}: ${
                    isBuildError
                        ? `build failed (exit ${lastResult.exitCode})`
                        : 'app renders the placeholder'
                }, asking Claude to fix (attempt ${fixAttempts}/${AppGenerateService.MAX_BUILD_FIX_ATTEMPTS})`,
            );

            try {
                await this.appModel.updateStatusMessage(
                    appUuid,
                    version,
                    isBuildError ? 'Fixing build errors' : 'Fixing blank app',
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

            const generation = await this.runClaudeGeneration(
                sandbox,
                appUuid,
                version,
                true, // --continue: keep conversation context from generation
                claudeCodeEnv,
                claudeModel,
            );
            fixGenerationMs += generation.durationMs;
            fixUsage = addClaudeUsage(fixUsage, generation.usage);

            try {
                await this.appModel.updateStatusMessage(
                    appUuid,
                    version,
                    'Rebuilding',
                );
            } catch (e) {
                this.logger.warn(
                    `App ${appUuid}: failed to update status message: ${getErrorMessage(e)}`,
                );
            }

            lastResult = await this.runBuild(sandbox, appUuid);
            buildMs += lastResult.durationMs;
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
    async runPipeline(payload: AppGeneratePipelineJobPayload): Promise<void> {
        const {
            appUuid,
            version,
            projectUuid,
            imageIds,
            isIteration,
            chartReferences,
        } = payload;

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
        let s3Client: S3Client;
        let bucket: string;
        try {
            claudeCodeEnv = this.getClaudeCodeEnv();
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
                this.trackVersionFailed(payload, 'config', error, {}, null, 0);
            }
            return;
        }

        const overallStart = performance.now();
        const durations: Record<string, number> = {};

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
                    );
                    sandbox = result.sandbox;
                    sandboxUuid = result.sandboxUuid;
                    durations.sandboxMs = result.durationMs;
                    await this.appModel.updateSandboxUuid(appUuid, sandboxUuid);
                }
            } catch (error) {
                const marked = await this.markError(
                    appUuid,
                    version,
                    error,
                    'Failed to set up build environment. Please try again.',
                );
                if (marked) {
                    this.trackVersionFailed(
                        payload,
                        'sandbox',
                        error,
                        durations,
                        overallStart,
                        0,
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
                    this.trackVersionFailed(
                        payload,
                        'sandbox',
                        missingSandboxError,
                        durations,
                        overallStart,
                        0,
                    );
                }
                return;
            }
            try {
                const result = await this.resumeSandbox(
                    app.sandbox_id,
                    appUuid,
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
                    this.trackVersionFailed(
                        payload,
                        'sandbox',
                        error,
                        durations,
                        overallStart,
                        0,
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
            await this.runPipelineStages(
                sandbox,
                payload,
                s3Client,
                bucket,
                durations,
                overallStart,
                currentStatus,
                wasResumed,
                claudeCodeEnv,
                imageIds,
                chartReferences,
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
        imageIds: string[] | undefined,
        chartReferences: ChartReference[] | undefined,
    ): Promise<void> {
        const { appUuid, version, projectUuid, prompt, template } = payload;
        // Resolve the model once per pipeline run. Jobs enqueued before the
        // picker shipped (or any future caller that omits the field) fall back
        // to the default so we never run with `--model undefined`.
        const claudeModel: DataAppClaudeModel =
            payload.claudeModel ?? DEFAULT_DATA_APP_CLAUDE_MODEL;
        const durations: Record<string, number> = { ...extraDurations };
        const shouldRun = (stage: AppVersionStatus) =>
            AppGenerateService.shouldRunStage(currentStatus, stage);

        // Theme (org design) copy + system-prompt assembly. Runs
        // unconditionally on every pipeline execution — including
        // resumed/iterated runs — so a new sandbox or a switched theme
        // always lands clean. When `payload.designUuid` is absent/null
        // the helper short-circuits and `effective-skill.md` is
        // byte-identical to the baseline `/app/skill.md`.
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
                const catalogResult = await this.writeCatalogAndPrompt(
                    sandbox,
                    appUuid,
                    projectUuid,
                    prompt,
                    imageIds,
                    s3Client,
                    bucket,
                    chartReferences,
                    template,
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
                    this.trackVersionFailed(
                        payload,
                        'catalog',
                        error,
                        durations,
                        overallStart,
                        buildFixAttempts,
                    );
                }
                return;
            }
        }

        // --- Stage: generating ---
        let responseText: string | null = null;
        if (shouldRun('generating')) {
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
                );
                durations.generateMs = generation.durationMs;
                responseText = generation.responseText;
                toolCallCount = generation.toolCallCount;
                generationUsage = addClaudeUsage(
                    generationUsage,
                    generation.usage,
                );
                timeToFirstTokenMs = generation.timeToFirstTokenMs;
                slowestTurnMs = generation.turnDurationsMs.length
                    ? Math.max(...generation.turnDurationsMs)
                    : 0;
            } catch (error) {
                const totalMs = AppGenerateService.elapsed(overallStart);
                this.logger.error(
                    `App ${appUuid}: generation failed after ${totalMs}ms: ${getErrorMessage(error)}`,
                );
                // Prefer a classified upstream-API message (quota /
                // rate-limit / auth / overloaded). Otherwise fall back to
                // the existing branches: Bedrock failures are often the
                // model not being enabled in the configured region — point
                // operators at that instead of the generic "try rephrasing".
                let userMessage: string;
                if (error instanceof ClaudeGenerationError) {
                    userMessage = error.userMessage;
                } else if (claudeCodeEnv.CLAUDE_CODE_USE_BEDROCK === '1') {
                    userMessage =
                        'Failed to generate the app. If this keeps happening, check that the selected model is enabled in your AWS Bedrock region (see server logs).';
                } else {
                    userMessage =
                        'Failed to generate app code. Try rephrasing your request.';
                }
                const marked = await this.markError(
                    appUuid,
                    version,
                    error,
                    userMessage,
                );
                if (marked) {
                    this.trackVersionFailed(
                        payload,
                        'generating',
                        error,
                        durations,
                        overallStart,
                        buildFixAttempts,
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
                const buildResult = await this.runBuildWithAutoFix(
                    sandbox,
                    appUuid,
                    version,
                    claudeCodeEnv,
                    claudeModel,
                );
                durations.buildMs = buildResult.buildMs;
                buildFixAttempts = buildResult.fixAttempts;
                buildFixGenerationMs = buildResult.fixGenerationMs;
                generationUsage = addClaudeUsage(
                    generationUsage,
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
                const marked = await this.markError(
                    appUuid,
                    version,
                    error,
                    "The generated code couldn't be compiled. Try again or simplify your request.",
                );
                if (marked) {
                    this.trackVersionFailed(
                        payload,
                        'building',
                        error,
                        durations,
                        overallStart,
                        buildFixAttempts,
                    );
                }
                return;
            }
        }

        // --- Auto-name: first version only ---
        if (version === 1) {
            try {
                const metadata = await this.generateAppMetadata(
                    sandbox,
                    appUuid,
                    version,
                    claudeCodeEnv,
                    claudeModel,
                );
                if (metadata) {
                    // Only fills fields the user hasn't already set — the
                    // build is async, so by the time we get here the user
                    // may have renamed the app themselves.
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
                    durations.metadataMs = metadata.durationMs;
                    generationUsage = addClaudeUsage(
                        generationUsage,
                        metadata.usage,
                    );
                }
            } catch (error) {
                // Non-fatal — the app works fine without a name
                this.logger.warn(
                    `App ${appUuid}: failed to auto-generate name: ${getErrorMessage(error)}`,
                );
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
                    this.trackVersionFailed(
                        payload,
                        'packaging',
                        error,
                        durations,
                        overallStart,
                        buildFixAttempts,
                    );
                }
                return;
            }
        }

        try {
            const dbStart = performance.now();
            const updated = await this.appModel.updateVersionStatusIfInProgress(
                appUuid,
                version,
                'ready',
                null,
                responseText,
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
                this.trackVersionFailed(
                    payload,
                    'db',
                    error,
                    durations,
                    overallStart,
                    buildFixAttempts,
                );
            }
            return;
        }

        const totalMs = AppGenerateService.elapsed(overallStart);
        this.logger.info(
            `App ${appUuid}: generation completed successfully in ${totalMs}ms (model=${claudeModel}, ${Object.entries(
                durations,
            )
                .map(([k, v]) => `${k}=${v}ms`)
                .join(
                    ', ',
                )}, numTurns=${generationUsage.numTurns}, inputTokens=${generationUsage.inputTokens}, outputTokens=${generationUsage.outputTokens}, cacheReadTokens=${generationUsage.cacheReadInputTokens}, cacheCreationTokens=${generationUsage.cacheCreationInputTokens}, costUsd=${generationUsage.costUsd})`,
        );

        this.analytics.track({
            event: 'data_app.version.completed',
            userId: payload.userUuid,
            properties: {
                organizationId: payload.organizationUuid,
                projectId: projectUuid,
                appUuid,
                version,
                isIteration: payload.isIteration,
                claudeModel,
                wasResumed,
                totalDurationMs: totalMs,
                sandboxMs: durations.sandboxMs,
                resumeMs: durations.resumeMs,
                restoreMs: durations.restoreMs,
                catalogMs: durations.catalogMs,
                generateMs: durations.generateMs,
                buildMs: durations.buildMs,
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
                timeToFirstTokenMs: timeToFirstTokenMs ?? 0,
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
     * Extract UUID v4 patterns from the prompt, attempt to resolve each as a
     * saved chart (permission-checked), and return structured references for
     * any that resolve.
     */
    private async resolveDashboardToChartUuids(
        dashboardUuid: string,
        user: SessionUser,
    ): Promise<{ chartUuids: string[]; dashboardName: string }> {
        const dashboard = await this.dashboardService.getByIdOrSlug(
            user,
            dashboardUuid,
        );
        const chartUuids = dashboard.tiles
            .filter(isDashboardChartTileType)
            .map((tile) => tile.properties.savedChartUuid)
            .filter((uuid): uuid is string => uuid !== null);
        return {
            chartUuids: [...new Set(chartUuids)],
            dashboardName: dashboard.name,
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
    ): Promise<{
        refs: AppChartReference[];
        dashboardName: string | null;
    }> {
        const flagByUuid = new Map<string, boolean>();
        for (const c of charts ?? []) {
            flagByUuid.set(
                c.uuid,
                (flagByUuid.get(c.uuid) ?? false) || c.includeSampleData,
            );
        }
        let dashboardName: string | null = null;
        if (dashboard) {
            const result = await this.resolveDashboardToChartUuids(
                dashboard.uuid,
                user,
            );
            dashboardName = result.dashboardName;
            for (const uuid of result.chartUuids) {
                flagByUuid.set(
                    uuid,
                    (flagByUuid.get(uuid) ?? false) ||
                        dashboard.includeSampleData,
                );
            }
        }
        const refs: AppChartReference[] = [...flagByUuid.entries()].map(
            ([uuid, includeSampleData]) => ({ uuid, includeSampleData }),
        );
        return { refs, dashboardName };
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
    ): Promise<{
        references: ChartReference[];
        chartResources: AppVersionChartResource[];
        sampleStats: { requested: number; available: number };
    }> {
        // Dedupe by uuid; if any duplicate asks for sample data, the union
        // wins so the user gets the data they opted into.
        const dedup = new Map<string, boolean>();
        for (const ref of chartRefs) {
            dedup.set(
                ref.uuid,
                (dedup.get(ref.uuid) ?? false) || ref.includeSampleData,
            );
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
            uuids.map((uuid) => this.savedChartService.get(uuid, account)),
        );

        // Kick off sample fetches in parallel, only for charts that resolved
        // and were opted-in. Track which uuids actually requested a sample
        // so we can attach the result back to the right reference.
        const sampleUuids: string[] = [];
        chartResults.forEach((result, i) => {
            if (result.status === 'fulfilled' && dedup.get(uuids[i])) {
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
                references.push({
                    chartName: chart.name,
                    chartDescription: chart.description ?? '',
                    exploreName: chart.tableName,
                    metricQuery: chart.metricQuery,
                    sampleData: sampleByUuid.get(uuids[i]) ?? null,
                });
                chartResources.push({
                    chartUuid: uuids[i],
                    chartName: chart.name,
                    chartKind: null,
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
     */
    async clarifyApp(
        user: SessionUser,
        projectUuid: string,
        prompt: string,
        template?: DataAppTemplate,
        charts?: AppChartReference[],
        dashboard?: AppDashboardReference,
        imageIds?: string[],
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

        const { copilot } = this.lightdashConfig.ai;
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

        const [catalogSummary, attachedResources] = await Promise.all([
            this.buildCatalogSummaryForClarifier(projectUuid),
            this.buildAttachedResourcesForClarifier(charts, dashboard, user),
        ]);
        const imageCount = imageIds?.length ?? 0;

        // No `.max()` on the array — Anthropic's structured-output mode
        // rejects `maxItems` in the schema. The prompt already pins the
        // 1–4 cap and we slice client-side after the response.
        const clarifySchema = z.object({
            questions: z
                .array(z.string())
                .describe(
                    '0–4 short clarifying questions, each a single sentence (5–15 words). Default to empty — only include questions whose answers would materially change the app.',
                ),
        });

        // Cap the LLM call so a stalled provider can't pin the chat input
        // open indefinitely. The frontend disables the input while clarify
        // is in flight; on timeout we fall through to a no-questions build.
        const CLARIFY_TIMEOUT_MS = 15_000;

        const start = performance.now();
        let result;
        try {
            result = await generateObject({
                model: modelOptions.model,
                ...modelOptions.callOptions,
                providerOptions: modelOptions.providerOptions,
                experimental_telemetry: getAiCallTelemetry({
                    functionId: 'clarifyApp',
                    feature: 'data-app',
                    organizationUuid,
                    projectUuid,
                    userUuid: user.userUuid,
                }),
                schema: clarifySchema,
                abortSignal: AbortSignal.timeout(CLARIFY_TIMEOUT_MS),
                messages: [
                    {
                        role: 'system',
                        content: `You help a user scope a React data app on top of their semantic layer before any code is written. Given the user's prompt, the kind of app they're building, and a summary of the available tables, decide whether 0–4 short clarifying questions would materially change what gets built.

DEFAULT TO ASKING NOTHING. Empty is the right answer for most well-formed prompts. Only ask when the answer would meaningfully change the app's structure, content, or scope — never to fine-tune cosmetics or pick between two equally reasonable defaults. If you're unsure whether to ask, don't. Reasonable defaults during the build beat slowing the user down.

Worth asking about (only when the prompt is silent on them):
- Which tables or metrics to query, when several plausible options exist
- Default time range, when the prompt doesn't imply one
- Audience, when it would change the level of detail (executive vs analyst)
- The shape of the app (single-page vs tabs, drill-down vs flat) when truly ambiguous

App kind context (use to prioritize, not as a checklist):
- dashboard: audience, key metrics/KPIs, default time range, layout density.
- slideshow: number of slides, narrative arc, takeaway per slide.
- pdf: page orientation, audience, what gets exported vs interactive.
- custom: focus on the most impactful unknowns.

Do NOT ask about:
- Cosmetic details with reasonable defaults (date format, exact colors, number formatting, axis labels, column widths).
- Anything already stated in the prompt — even partially.
- Things you can look up in the catalog (table names, field names).
- Picking between two readings of a phrase when one is the obvious interpretation.
- Multi-part or open-ended — each question must be answerable in one short line.
- Which chart, dashboard, or image to use, when the user has already attached resources — those are listed under "Resources the user attached".

Each question, when asked, must be a single sentence, 5–15 words.`,
                    },
                    {
                        role: 'user',
                        content: [
                            `App kind: ${template ?? 'custom'}`,
                            `\nUser prompt:\n${trimmed}`,
                            `\nResources the user attached:\n${
                                AppGenerateService.formatAttachedResourcesForClarifier(
                                    attachedResources,
                                    imageCount,
                                ) || '(none)'
                            }`,
                            `\nAvailable tables and key fields:\n${
                                catalogSummary || '(no catalog available)'
                            }`,
                        ].join('\n'),
                    },
                ],
            });
        } catch (err) {
            this.logger.warn(
                `App clarify failed after ${AppGenerateService.elapsed(start)}ms (project=${projectUuid}, llm=${llmProvider}): ${getErrorMessage(err)}`,
            );
            return { questions: [] };
        }
        const elapsedMs = AppGenerateService.elapsed(start);

        const questions = result.object.questions
            .map((q) => q.trim())
            .filter((q) => q.length > 0)
            .slice(0, 4);

        this.logger.info(
            `App clarify: ${questions.length} question(s) in ${elapsedMs}ms (project=${projectUuid}, llm=${llmProvider})`,
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
    ): Promise<{
        charts: { name: string; exploreName: string }[];
        dashboardName: string | null;
    }> {
        const uuids = new Set<string>();
        for (const c of charts ?? []) uuids.add(c.uuid);
        let dashboardName: string | null = null;
        if (dashboard) {
            try {
                const result = await this.resolveDashboardToChartUuids(
                    dashboard.uuid,
                    user,
                );
                dashboardName = result.dashboardName;
                for (const uuid of result.chartUuids) uuids.add(uuid);
            } catch (error) {
                this.logger.warn(
                    `Clarifier: dashboard ${dashboard.uuid} could not be resolved: ${getErrorMessage(error)}`,
                );
            }
        }
        if (uuids.size === 0) {
            return { charts: [], dashboardName };
        }
        const account = fromSession(user);
        const chartResults = await Promise.allSettled(
            [...uuids].map((uuid) => this.savedChartService.get(uuid, account)),
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
        return { charts: resolvedCharts, dashboardName };
    }

    /**
     * Render the resolved attached-resources context as a short bullet list
     * for the clarifier's user message. Empty string when nothing was
     * attached — the caller handles the "(none)" fallback.
     */
    private static formatAttachedResourcesForClarifier(
        attached: {
            charts: { name: string; exploreName: string }[];
            dashboardName: string | null;
        },
        imageCount: number,
    ): string {
        const lines: string[] = [];
        if (attached.dashboardName) {
            lines.push(`- Dashboard: "${attached.dashboardName}"`);
        }
        for (const chart of attached.charts) {
            lines.push(
                `- Chart: "${chart.name}" (explore: ${chart.exploreName})`,
            );
        }
        if (imageCount > 0) {
            lines.push(
                `- ${imageCount} image${imageCount === 1 ? '' : 's'} attached as design reference`,
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
        imageIds: string[],
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
        const claudeModel =
            AppGenerateService.resolveClaudeModel(claudeModelInput);

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

        AppGenerateService.validateImageIds(imageIds);

        const appUuid = preGeneratedAppUuid ?? uuidv4();
        const version = 1;

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

        const { refs, dashboardName } = await this.collectChartReferences(
            charts,
            dashboard,
            user,
        );
        const {
            references: chartReferences,
            chartResources,
            sampleStats,
        } = await this.resolveChartReferences(refs, user);
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
            resolvedDesignUuid = picked.designUuid;
            designSnapshot = {
                designUuid: picked.designUuid,
                name: picked.name,
                fileCount: picked.files.length,
            };
        }

        // Build resources metadata to persist with the version
        const resources: AppVersionResources = {
            images: imageIds.map((id) => ({ imageId: id })),
            charts: chartResources,
            externalConnections: externalConnectionResources,
            dashboardName,
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
                imageCount: imageIds.length,
                template: template ?? null,
                claudeModel,
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
            imageIds: imageIds.length > 0 ? imageIds : undefined,
            isIteration: false,
            chartReferences:
                chartReferences.length > 0 ? chartReferences : undefined,
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
        imageIds: string[],
        charts?: AppChartReference[],
        dashboard?: AppDashboardReference,
        claudeModelInput?: DataAppClaudeModel,
        options: GenerateAppOptions = {},
    ): Promise<GenerateAppResult> {
        const { designUuidInput, externalConnections } = options;
        await this.assertDataAppsEnabled(user);

        AppGenerateService.validateImageIds(imageIds);
        const claudeModel =
            AppGenerateService.resolveClaudeModel(claudeModelInput);

        const app = await this.appModel.getApp(appUuid, projectUuid);
        await this.assertCanManageApp(
            user,
            app,
            'Insufficient permissions to modify data apps',
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

        const { refs, dashboardName } = await this.collectChartReferences(
            charts,
            dashboard,
            user,
        );
        const {
            references: chartReferences,
            chartResources,
            sampleStats,
        } = await this.resolveChartReferences(refs, user);

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
            images: imageIds.map((id) => ({ imageId: id })),
            charts: chartResources,
            externalConnections: externalConnectionResources,
            dashboardName,
            clarifications: [],
            claudeModel,
            design: designSnapshot,
        };

        await this.appModel.createVersion(
            appUuid,
            { version: newVersion, prompt },
            'pending',
            user.userUuid,
            resources,
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
                imageCount: imageIds.length,
                claudeModel,
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
            imageIds: imageIds.length > 0 ? imageIds : undefined,
            isIteration: true,
            chartReferences:
                chartReferences.length > 0 ? chartReferences : undefined,
            claudeModel,
            designUuid: effectiveDesignUuid,
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
                const resumed = await this.resumeSandbox(
                    app.sandbox_id,
                    appUuid,
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
    ): Promise<void> {
        let claudeCodeEnv: Record<string, string>;
        try {
            claudeCodeEnv = this.getClaudeCodeEnv();
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
        const sourcePreviewPath = `/projects/${projectUuid}/apps/${sourceApp.app_id}/versions/${sourceVersion.version}/preview`;
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

        const resources = AppGenerateService.buildCopiedResources(
            sourceVersion.resources ?? null,
        );

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
        const sourcePreviewPath = `/projects/${projectUuid}/apps/${sourceApp.app_id}/versions/${sourceVersion.version}/preview`;
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

        const resources = AppGenerateService.buildCopiedResources(
            sourceVersion.resources ?? null,
        );

        const newAppUuid = uuidv4();
        const newVersion = 1;

        const sourceDisplayName = sourceApp.name || 'untitled app';
        const sourcePreviewPath = `/projects/${sourceProjectUuid}/apps/${sourceApp.app_id}/versions/${sourceVersion.version}/preview`;
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
                    description: sourceApp.description,
                    template: sourceApp.template,
                    space_uuid: previewSpaceUuid,
                    design_uuid: targetDesignUuid,
                },
                { version: newVersion, prompt },
                'ready',
                resources,
            );
            // Link back to the upstream app so a later promote updates it
            // instead of creating a duplicate.
            await this.appModel.setUpstreamAppUuid(
                newAppUuid,
                sourceApp.app_id,
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
            'Cancelled by user',
            'Cancelled by user',
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

        // Suspend the sandbox to interrupt any running commands while keeping
        // it resumable for the next iteration (snapshot + destroy on
        // object-store backends, preserving state).
        // The pipeline will catch the resulting error, but markError is now
        // a no-op since the version is already in 'error' state — and
        // pipeline catches gate `trackVersionFailed` on the markError result,
        // so no spurious failed analytics event fires on top of the cancel.
        if (app.sandbox_id) {
            try {
                await this.getSandboxManager().suspendByUuid(app.sandbox_id);
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
            createdAt: Date;
            statusUpdatedAt: Date | null;
            createdByUser: {
                userUuid: string;
                firstName: string;
                lastName: string;
            } | null;
            resources: AppVersionResources | null;
        }[];
        hasMore: boolean;
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
                // Backfill `clarifications` for rows persisted before the
                // field existed on `resources`.
                resources: v.resources
                    ? {
                          ...v.resources,
                          clarifications: v.resources.clarifications ?? [],
                      }
                    : null,
                createdAt: v.created_at,
                statusUpdatedAt: v.status_updated_at,
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

    async listMyApps(
        user: SessionUser,
        paginateArgs?: { page: number; pageSize: number },
        options: { excludePreviewProjects?: boolean } = {},
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
    private static yamlQuote(s: string): string {
        const cleaned = s
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
        return `"${cleaned}"`;
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
        lines.push(
            `${inner}label: ${AppGenerateService.yamlQuote(param.label)}`,
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

    /**
     * Convert compiled explores into the dbt-style YAML that skill.md expects.
     * One model per explore, keyed by the explore name (the value passed to
     * `query()`), carrying real metric/dimension types, join relationships
     * (`meta.joins`), and model-level parameters. Joined tables that aren't
     * themselves a top-level explore (seeds, aliased joins) are inlined so
     * their dot-notation fields stay discoverable. Hidden fields are skipped;
     * descriptions are truncated to keep the prompt bounded.
     */
    private static exploresToYaml(explores: Explore[]): {
        yaml: string;
        tableCount: number;
        dimensionCount: number;
        metricCount: number;
    } {
        const DESCRIPTION_MAX_LEN = 200;
        const truncate = (s: string): string =>
            s.length > DESCRIPTION_MAX_LEN
                ? `${s.slice(0, DESCRIPTION_MAX_LEN - 1)}…`
                : s;

        const lines: string[] = ['models:'];
        let tableCount = 0;
        let dimensionCount = 0;
        let metricCount = 0;

        // Names already emitted as a standalone model, so the join-target
        // fallback (pass 2) only inlines tables that aren't otherwise visible.
        const emittedModelNames = new Set<string>(
            explores.map((explore) => explore.name),
        );

        // Emit one model from a compiled table. Joins and parameters live on
        // the explore (not the table), so they're passed in explicitly.
        const emitTableModel = (
            modelName: string,
            table: CompiledTable,
            joins: CompiledExploreJoin[],
            parameters: Record<string, LightdashProjectParameter> | undefined,
        ): void => {
            tableCount += 1;
            lines.push(`  - name: ${modelName}`);
            if (table.description) {
                lines.push(
                    `    description: ${AppGenerateService.yamlQuote(truncate(table.description))}`,
                );
            }

            const metrics = Object.values(table.metrics).filter(
                (m) => !m.hidden,
            );
            const dimensions = Object.values(table.dimensions).filter(
                (d) => !d.hidden,
            );
            const parameterEntries = parameters
                ? Object.entries(parameters)
                : [];

            if (
                metrics.length > 0 ||
                joins.length > 0 ||
                parameterEntries.length > 0
            ) {
                lines.push(`    meta:`);
                if (metrics.length > 0) {
                    lines.push(`      metrics:`);
                    for (const m of metrics) {
                        metricCount += 1;
                        lines.push(`        ${m.name}:`);
                        lines.push(`          type: ${m.type}`);
                        if (m.label && m.label !== m.name) {
                            lines.push(
                                `          label: ${AppGenerateService.yamlQuote(m.label)}`,
                            );
                        }
                        if (m.description) {
                            lines.push(
                                `          description: ${AppGenerateService.yamlQuote(truncate(m.description))}`,
                            );
                        }
                    }
                }
                if (joins.length > 0) {
                    lines.push(`      joins:`);
                    for (const j of joins) {
                        lines.push(`        - join: ${j.table}`);
                        if (j.relationship) {
                            lines.push(
                                `          relationship: ${j.relationship}`,
                            );
                        }
                        if (j.sqlOn) {
                            lines.push(
                                `          sql_on: ${AppGenerateService.yamlQuote(j.sqlOn)}`,
                            );
                        }
                    }
                }
                if (parameterEntries.length > 0) {
                    lines.push(`      parameters:`);
                    for (const [key, param] of parameterEntries) {
                        lines.push(
                            ...AppGenerateService.renderParameterYaml(
                                key,
                                param,
                                '        ',
                            ),
                        );
                    }
                }
            }

            if (dimensions.length > 0) {
                lines.push(`    columns:`);
                for (const d of dimensions) {
                    dimensionCount += 1;
                    lines.push(`      - name: ${d.name}`);
                    if (d.label && d.label !== d.name) {
                        lines.push(
                            `        label: ${AppGenerateService.yamlQuote(d.label)}`,
                        );
                    }
                    if (d.description) {
                        lines.push(
                            `        description: ${AppGenerateService.yamlQuote(truncate(d.description))}`,
                        );
                    }
                    lines.push(`        meta:`);
                    lines.push(`          dimension:`);
                    lines.push(`            type: ${d.type}`);
                }
            }
        };

        // Pass 1: every explore becomes a model keyed by its queryable name.
        for (const explore of explores) {
            const baseTable = explore.tables[explore.baseTable];
            if (baseTable) {
                const joins = (explore.joinedTables ?? []).filter(
                    (j) => !j.hidden,
                );
                emitTableModel(
                    explore.name,
                    baseTable,
                    joins,
                    explore.parameters,
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
                    emitTableModel(key, joinedTable, [], undefined);
                }
            }
        }

        return {
            yaml: lines.join('\n'),
            tableCount,
            dimensionCount,
            metricCount,
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
        const ext = filePath.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
            html: 'text/html',
            js: 'application/javascript',
            css: 'text/css',
            json: 'application/json',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            svg: 'image/svg+xml',
            ico: 'image/x-icon',
            woff: 'font/woff',
            woff2: 'font/woff2',
            ttf: 'font/ttf',
            eot: 'application/vnd.ms-fontobject',
            map: 'application/json',
        };
        return mimeTypes[ext ?? ''] ?? 'application/octet-stream';
    }
}
