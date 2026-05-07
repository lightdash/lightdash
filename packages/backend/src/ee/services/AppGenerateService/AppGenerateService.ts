import {
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
    type ObjectIdentifier,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    formatPromptWithClarifications,
    getErrorMessage,
    isDashboardChartTileType,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    type AppChartReference,
    type AppClarification,
    type AppDashboardReference,
    type AppGeneratePipelineJobPayload,
    type AppVersionChartResource,
    type AppVersionResources,
    type ChartReference,
    type ChartSampleData,
    type DataAppTemplate,
    type SessionUser,
    type TogglePinnedItemInfo,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { ALL_TRAFFIC, Sandbox } from 'e2b';
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
import { PinnedListModel } from '../../../models/PinnedListModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { mintPreviewToken } from '../../../routers/appPreviewToken';
import { BaseService } from '../../../services/BaseService';
import type { DashboardService } from '../../../services/DashboardService/DashboardService';
import type { ProjectService } from '../../../services/ProjectService/ProjectService';
import type { SavedChartService } from '../../../services/SavedChartsService/SavedChartService';
import type { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import type { CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { getAnthropicModel } from '../ai/models/anthropic-claude';
import { getModelPreset } from '../ai/models/presets';
import { getTemplateInstructions } from './templates';

type AppGenerateServiceDeps = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    analyticsModel: AnalyticsModel;
    catalogModel: CatalogModel;
    appModel: AppModel;
    featureFlagModel: FeatureFlagModel;
    pinnedListModel: PinnedListModel;
    projectModel: ProjectModel;
    schedulerClient: CommercialSchedulerClient;
    savedChartService: SavedChartService;
    spacePermissionService: SpacePermissionService;
    dashboardService: DashboardService;
    projectService: ProjectService;
};

type GenerateAppResult = {
    appUuid: string;
    version: number;
};

// Wall-clock heartbeat to bump status_updated_at while the pipeline is
// running, independent of any per-stage progress updates. Must stay well
// under STALE_THRESHOLD (5 minutes) in sweepStaleLocks.
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export class AppGenerateService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly analyticsModel: AnalyticsModel;

    private readonly catalogModel: CatalogModel;

    private readonly appModel: AppModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly pinnedListModel: PinnedListModel;

    private readonly projectModel: ProjectModel;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly savedChartService: SavedChartService;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly dashboardService: DashboardService;

    private readonly projectService: ProjectService;

    constructor({
        lightdashConfig,
        analytics,
        analyticsModel,
        catalogModel,
        appModel,
        featureFlagModel,
        pinnedListModel,
        projectModel,
        schedulerClient,
        savedChartService,
        spacePermissionService,
        dashboardService,
        projectService,
    }: AppGenerateServiceDeps) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.analyticsModel = analyticsModel;
        this.catalogModel = catalogModel;
        this.appModel = appModel;
        this.featureFlagModel = featureFlagModel;
        this.pinnedListModel = pinnedListModel;
        this.projectModel = projectModel;
        this.schedulerClient = schedulerClient;
        this.savedChartService = savedChartService;
        this.spacePermissionService = spacePermissionService;
        this.dashboardService = dashboardService;
        this.projectService = projectService;
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
        const spaceContext = app.space_uuid
            ? await this.spacePermissionService.getSpaceAccessContext(
                  user.userUuid,
                  app.space_uuid,
              )
            : {};
        this.assertDataAppAbility(
            user,
            'view',
            app.organization_uuid,
            app.project_uuid,
            'Insufficient permissions to access this data app',
            { ...spaceContext, createdByUserUuid: app.created_by_user_uuid },
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

    private getE2bApiKey(): string {
        const key = this.lightdashConfig.appRuntime.e2bApiKey;
        if (!key) {
            throw new MissingConfigError(
                'E2B API key is not configured (E2B_API_KEY)',
            );
        }
        return key;
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
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.EnableDataApps,
        });
        if (!enabled) {
            throw new ForbiddenError('Data apps are not enabled');
        }
    }

    /**
     * Deterministic staging path for uploaded images.
     * No file extension — the MIME type is stored as the S3 object's ContentType.
     */
    private static imageStagingKey(appUuid: string, imageId: string): string {
        return `apps/${appUuid}/uploads/${imageId}`;
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
        e2bApiKey: string,
    ): Promise<{ sandbox: Sandbox; durationMs: number }> {
        const start = performance.now();
        const { e2bTemplateName, e2bTemplateTag } =
            this.lightdashConfig.appRuntime;
        // E2B treats `name` and `name:default` interchangeably, so an empty
        // tag is fine — it just resolves to the implicit `default` build.
        const templateRef = e2bTemplateTag
            ? `${e2bTemplateName}:${e2bTemplateTag}`
            : e2bTemplateName;
        const sandbox = await Sandbox.create(templateRef, {
            timeoutMs: 60 * 60 * 1000,
            apiKey: e2bApiKey,
            lifecycle: { onTimeout: 'pause' },
            network: {
                allowOut: ['api.anthropic.com'],
                denyOut: [ALL_TRAFFIC],
            },
        });
        this.logger.info(
            `App ${appUuid}: launching sandbox from template ${templateRef}`,
        );
        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: E2B sandbox created (sandboxId=${sandbox.sandboxId}, ${durationMs}ms)`,
        );
        return { sandbox, durationMs };
    }

    private async pauseSandbox(
        sandbox: Sandbox,
        appUuid: string,
    ): Promise<void> {
        try {
            const start = performance.now();
            await sandbox.pause();
            const durationMs = AppGenerateService.elapsed(start);
            this.logger.info(
                `App ${appUuid}: sandbox paused (sandboxId=${sandbox.sandboxId}, ${durationMs}ms)`,
            );
        } catch (error) {
            this.logger.warn(
                `App ${appUuid}: failed to pause sandbox (sandboxId=${sandbox.sandboxId}): ${getErrorMessage(error)}`,
            );
        }
    }

    private async resumeSandbox(
        sandboxId: string,
        appUuid: string,
        e2bApiKey: string,
    ): Promise<{ sandbox: Sandbox; durationMs: number }> {
        const start = performance.now();
        const sandbox = await Sandbox.connect(sandboxId, {
            apiKey: e2bApiKey,
            timeoutMs: 60 * 60 * 1000,
        });
        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: E2B sandbox resumed (sandboxId=${sandbox.sandboxId}, ${durationMs}ms)`,
        );
        return { sandbox, durationMs };
    }

    private async restoreSourceFromS3(
        sandbox: Sandbox,
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

        await sandbox.files.write(
            '/tmp/source.tar',
            tarBuffer.buffer.slice(
                tarBuffer.byteOffset,
                tarBuffer.byteOffset + tarBuffer.byteLength,
            ) as ArrayBuffer,
        );
        const result = await sandbox.commands.run(
            'tar -xf /tmp/source.tar -C /app',
            { timeoutMs: 30_000 },
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
     * Always returns a running Sandbox instance or throws.
     */
    private async acquireSandbox(
        app: DbApp,
        appUuid: string,
        newVersion: number,
        e2bApiKey: string,
        s3Client: S3Client,
        bucket: string,
    ): Promise<{
        sandbox: Sandbox;
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
                    e2bApiKey,
                );
                durations.resumeMs = result.durationMs;
                return {
                    sandbox: result.sandbox,
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
        const createResult = await this.createSandbox(appUuid, e2bApiKey);
        durations.sandboxMs = createResult.durationMs;
        await this.appModel.updateSandboxId(
            appUuid,
            createResult.sandbox.sandboxId,
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

        return { sandbox: createResult.sandbox, wasResumed: false, durations };
    }

    /**
     * Write resolved chart references as individual JSON files in the sandbox.
     * Returns a summary string to prepend to the prompt, or empty string if
     * no references were provided.
     */
    private async writeChartReferences(
        sandbox: Sandbox,
        appUuid: string,
        chartReferences: ChartReference[],
    ): Promise<string> {
        if (chartReferences.length === 0) return '';

        await sandbox.commands.run('mkdir -p /tmp/metric-queries', {
            timeoutMs: 5_000,
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

    private async writeCatalogAndPrompt(
        sandbox: Sandbox,
        appUuid: string,
        version: number,
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

        const catalogItems =
            await this.catalogModel.getCatalogItemsSummary(projectUuid);
        const modelYaml = AppGenerateService.catalogToYaml(catalogItems);

        // Remove files that may have been created by a previous run with
        // different ownership (e.g. root-owned after Claude CLI execution),
        // which would cause a permission error on write.
        await sandbox.commands.run(
            'rm -f /tmp/dbt-repo/models/schema.yml /tmp/prompt.txt 2>/dev/null; rm -rf /tmp/images /tmp/metric-queries 2>/dev/null; true',
            { timeoutMs: 5_000 },
        );

        await sandbox.files.write('/tmp/dbt-repo/models/schema.yml', modelYaml);

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
                        version,
                        id,
                        s3Client,
                        bucket,
                    ),
                ),
            );
            const referenceLines = imagePaths
                .map(
                    (p, i) =>
                        `[Design reference image ${
                            i + 1
                        } at ${p} — use the Read tool to view it]`,
                )
                .join('\n');
            finalPrompt = `${referenceLines}\n\n${finalPrompt}`;
        }

        // Write only the latest prompt — Claude is stateless between runs, but
        // the sandbox filesystem preserves all code from previous iterations.
        // Claude can read existing files to understand what was built so far,
        // so replaying the full prompt history is unnecessary and makes
        // responses overly verbose.
        await sandbox.files.write('/tmp/prompt.txt', `${finalPrompt}\n`);

        let tableCount = 0;
        let totalDimensions = 0;
        let totalMetrics = 0;
        for (const item of catalogItems) {
            if (item.type === 'field') {
                if (item.fieldType === 'metric') {
                    totalMetrics += 1;
                } else {
                    totalDimensions += 1;
                }
            } else {
                tableCount += 1;
            }
        }

        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: model context written (tables=${tableCount}, dimensions=${totalDimensions}, metrics=${totalMetrics}, yamlBytes=${modelYaml.length}, ${durationMs}ms)`,
        );
        return {
            durationMs,
            tableCount,
            dimensionCount: totalDimensions,
            metricCount: totalMetrics,
            yamlBytes: modelYaml.length,
        };
    }

    /**
     * Reconstruct the image's staging S3 key from convention, read the object
     * (which gives us the MIME type from ContentType), copy it to the version
     * assets folder, and write it into the sandbox for Claude to read.
     * Returns the sandbox file path.
     */
    private async writeImageToSandbox(
        sandbox: Sandbox,
        appUuid: string,
        version: number,
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
        const sandboxPath = `/tmp/images/${imageId}.${ext}`;

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

        // Copy to version assets folder
        const versionKey = `apps/${appUuid}/versions/${version}/assets/images/${imageId}.${ext}`;
        this.logger.info(
            `App ${appUuid}: copying image to version path (${stagingKey} → ${versionKey})`,
        );
        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: versionKey,
                Body: buffer,
                ContentType: mimeType,
            }),
        );

        // Write to sandbox
        this.logger.info(
            `App ${appUuid}: writing image to sandbox (${mimeType}, ${buffer.length} bytes)`,
        );
        await sandbox.commands.run('mkdir -p /tmp/images', {
            timeoutMs: 5_000,
        });
        await sandbox.files.write(
            sandboxPath,
            buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength,
            ) as ArrayBuffer,
        );

        return sandboxPath;
    }

    /**
     * Parse a stream-json line from the Claude CLI and return a short
     * description of tool_use events. Returns undefined for non-tool events.
     */
    private static parseClaudeStreamEvent(line: string): string | undefined {
        let event: Record<string, unknown>;
        try {
            event = JSON.parse(line);
        } catch {
            return undefined;
        }
        if (event.type !== 'assistant') return undefined;

        const msg = event.message as Record<string, unknown> | undefined;
        const content = (msg?.content ?? []) as Array<Record<string, unknown>>;
        const tools: string[] = [];
        for (const block of content) {
            if (block.type === 'tool_use') {
                const name = String(block.name ?? '');
                const input = (block.input ?? {}) as Record<string, unknown>;
                if (name === 'Write' || name === 'Read' || name === 'Edit') {
                    tools.push(`${name} ${String(input.file_path ?? '')}`);
                } else {
                    tools.push(name);
                }
            }
        }
        return tools.length > 0 ? tools.join(', ') : undefined;
    }

    /**
     * Parse a stream-json `result` event and return the final response text.
     */
    private static parseClaudeResultText(line: string): string | undefined {
        let event: Record<string, unknown>;
        try {
            event = JSON.parse(line);
        } catch {
            return undefined;
        }
        if (event.type !== 'result') return undefined;
        return typeof event.result === 'string' ? event.result : undefined;
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

    private async runClaudeGeneration(
        sandbox: Sandbox,
        appUuid: string,
        version: number,
        continueSession: boolean,
        anthropicApiKey: string,
    ): Promise<{
        durationMs: number;
        responseText: string | null;
        toolCallCount: number;
    }> {
        const start = performance.now();
        let stdoutBuffer = '';
        let toolCallCount = 0;
        let responseText: string | null = null;

        // When the sandbox was resumed from a previous iteration, use
        // --continue so Claude has the full conversation history of what
        // it built before. For fresh sandboxes, start a new session.
        const sessionFlags = continueSession ? '--continue -p' : '-p';

        const result = await sandbox.commands.run(
            `cat /tmp/prompt.txt | claude ${sessionFlags} ` +
                `--model sonnet ` +
                `--verbose --output-format stream-json ` +
                `--allowedTools "Read(//app/**),Read(//tmp/dbt-repo/**),Read(//tmp/images/**),Read(//tmp/metric-queries/**),Write(//app/src/**),Edit(//app/src/**),Glob(//app/**),Glob(//tmp/dbt-repo/**),Glob(//tmp/metric-queries/**),Grep(//app/**),Grep(//tmp/dbt-repo/**)" ` +
                `--append-system-prompt-file /app/skill.md`,
            {
                cwd: '/app',
                timeoutMs: 55 * 60 * 1000,
                envs: { ANTHROPIC_API_KEY: anthropicApiKey },
                onStdout: (chunk) => {
                    stdoutBuffer += chunk;
                    const lines = stdoutBuffer.split('\n');
                    stdoutBuffer = lines.pop() ?? '';
                    for (const line of lines) {
                        if (line.trim()) {
                            const description =
                                AppGenerateService.parseClaudeStreamEvent(line);
                            if (description) {
                                toolCallCount += 1;
                                this.logger.info(
                                    `App ${appUuid}: claude tool #${toolCallCount}: ${description}`,
                                );

                                // description can be comma-separated
                                // (e.g. "Write foo.tsx, Read bar.tsx") —
                                // use only the first tool for the status.
                                const firstTool = description.split(', ')[0];
                                const msg =
                                    AppGenerateService.toolDescriptionToStatusMessage(
                                        firstTool,
                                    );
                                void this.appModel
                                    .updateStatusMessage(appUuid, version, msg)
                                    .catch((e) => {
                                        this.logger.warn(
                                            `App ${appUuid}: failed to update status message: ${getErrorMessage(e)}`,
                                        );
                                    });
                            }

                            const resultText =
                                AppGenerateService.parseClaudeResultText(line);
                            if (resultText) {
                                responseText = resultText;
                            }
                        }
                    }
                },
                onStderr: (chunk) => {
                    this.logger.debug(
                        `App ${appUuid}: claude stderr: ${chunk.trimEnd()}`,
                    );
                },
            },
        );
        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: Claude code generation completed (exit=${result.exitCode}, toolCalls=${toolCallCount}, ${durationMs}ms)`,
        );

        if (result.exitCode !== 0) {
            this.logger.debug(
                `App ${appUuid}: Claude stderr (tail): ${AppGenerateService.truncateEnd(result.stderr, 4000)}`,
            );
            throw new Error(
                `Claude generation failed (exit ${result.exitCode}): ${result.stderr}`,
            );
        }
        return { durationMs, responseText, toolCallCount };
    }

    /**
     * After a successful first build, ask Claude (with --continue so it has
     * full context) for a short name and description for the app.
     * Returns null if parsing fails — callers should treat this as non-fatal.
     */
    private async generateAppMetadata(
        sandbox: Sandbox,
        appUuid: string,
        version: number,
        anthropicApiKey: string,
    ): Promise<{
        name: string;
        description: string;
        durationMs: number;
    } | null> {
        const start = performance.now();
        const metadataPrompt =
            'Respond with ONLY a JSON object (no markdown, no explanation) ' +
            'containing a short "name" (3-6 words, title case, no quotes around it) ' +
            'and a one-sentence "description" for the app you just built. ' +
            'Example: {"name": "Weekly Sales Dashboard", "description": "Interactive dashboard showing weekly sales trends by region and product category."}';

        await sandbox.commands.run('rm -f /tmp/prompt.txt 2>/dev/null; true', {
            timeoutMs: 5_000,
        });
        await sandbox.files.write('/tmp/prompt.txt', `${metadataPrompt}\n`);

        const generation = await this.runClaudeGeneration(
            sandbox,
            appUuid,
            version,
            true, // --continue: Claude remembers what it just built
            anthropicApiKey,
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
            return { name, description: description ?? '', durationMs };
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
        sandbox: Sandbox,
        appUuid: string,
    ): Promise<{
        durationMs: number;
        exitCode: number;
        stdout: string;
        stderr: string;
    }> {
        const start = performance.now();
        const result = await sandbox.commands.run('pnpm build', {
            cwd: '/app',
            timeoutMs: 60 * 1000,
            onStdout: (chunk) => {
                this.logger.debug(
                    `App ${appUuid}: build stdout: ${chunk.trimEnd()}`,
                );
            },
            onStderr: (chunk) => {
                this.logger.info(`App ${appUuid}: build: ${chunk.trimEnd()}`);
            },
        });
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
     * Run `pnpm build` and, on failure, feed the build output back to Claude
     * so it can fix the compilation errors. Retries up to
     * MAX_BUILD_FIX_ATTEMPTS times before giving up and throwing.
     */
    private async runBuildWithAutoFix(
        sandbox: Sandbox,
        appUuid: string,
        version: number,
        anthropicApiKey: string,
    ): Promise<{
        buildMs: number;
        fixAttempts: number;
        fixGenerationMs: number;
    }> {
        let buildMs = 0;
        let fixGenerationMs = 0;
        let fixAttempts = 0;

        let lastResult = await this.runBuild(sandbox, appUuid);
        buildMs += lastResult.durationMs;

        while (
            lastResult.exitCode !== 0 &&
            fixAttempts < AppGenerateService.MAX_BUILD_FIX_ATTEMPTS
        ) {
            // Each iteration depends on the previous one: Claude's fix must
            // complete before the next build, and we need the build outcome
            // to decide whether to keep retrying.
            /* eslint-disable no-await-in-loop */
            fixAttempts += 1;

            this.logger.info(
                `App ${appUuid}: build failed (exit ${lastResult.exitCode}), asking Claude to fix (attempt ${fixAttempts}/${AppGenerateService.MAX_BUILD_FIX_ATTEMPTS})`,
            );

            try {
                await this.appModel.updateStatusMessage(
                    appUuid,
                    version,
                    'Fixing build errors',
                );
            } catch (e) {
                this.logger.warn(
                    `App ${appUuid}: failed to update status message: ${getErrorMessage(e)}`,
                );
            }

            const errorOutput = AppGenerateService.truncateEnd(
                `${lastResult.stderr}\n${lastResult.stdout}`.trim(),
                8000,
            );
            const fixPrompt =
                `The code you just produced failed to build with \`pnpm build\`. ` +
                `Analyze the build output below, identify the compilation errors, ` +
                `and fix the code so it builds cleanly. Do not ask questions — ` +
                `apply the fix directly.\n\n` +
                `Build output:\n${errorOutput}`;
            // Remove the previous prompt file first — after the Claude CLI
            // ran, it may be owned by a different user and writing would
            // fail with EPERM. Same reason as in writeCatalogAndPrompt.
            await sandbox.commands.run(
                'rm -f /tmp/prompt.txt 2>/dev/null; true',
                { timeoutMs: 5_000 },
            );
            await sandbox.files.write('/tmp/prompt.txt', `${fixPrompt}\n`);

            const generation = await this.runClaudeGeneration(
                sandbox,
                appUuid,
                version,
                true, // --continue: keep conversation context from generation
                anthropicApiKey,
            );
            fixGenerationMs += generation.durationMs;

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
            /* eslint-enable no-await-in-loop */
        }

        if (lastResult.exitCode !== 0) {
            throw new Error(
                `Build failed after ${fixAttempts} auto-fix attempt(s) (exit ${lastResult.exitCode}): ${lastResult.stderr}`,
            );
        }

        if (fixAttempts > 0) {
            this.logger.info(
                `App ${appUuid}: build recovered after ${fixAttempts} auto-fix attempt(s)`,
            );
        }

        return { buildMs, fixAttempts, fixGenerationMs };
    }

    private async packageArtifacts(
        sandbox: Sandbox,
        appUuid: string,
    ): Promise<{ distTar: Buffer; sourceTar: Buffer; durationMs: number }> {
        const start = performance.now();

        await Promise.all([
            sandbox.commands.run('tar -cf /tmp/dist.tar -C /app dist', {
                timeoutMs: 10_000,
            }),
            sandbox.commands.run('tar -cf /tmp/source.tar -C /app src', {
                timeoutMs: 30_000,
            }),
        ]);

        const [distBytes, sourceBytes] = await Promise.all([
            sandbox.files.read('/tmp/dist.tar', { format: 'bytes' }),
            sandbox.files.read('/tmp/source.tar', { format: 'bytes' }),
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

        let anthropicApiKey: string;
        let e2bApiKey: string;
        let s3Client: S3Client;
        let bucket: string;
        try {
            anthropicApiKey = this.getAnthropicApiKey();
            e2bApiKey = this.getE2bApiKey();
            ({ client: s3Client, bucket } = this.getS3Client());
        } catch (error) {
            const marked = await this.markError(
                appUuid,
                version,
                error,
                'Something went wrong. Please try again.',
            );
            if (marked) {
                this.trackVersionFailed(payload, 'config', error, {}, null, 0);
            }
            return;
        }

        const overallStart = performance.now();
        const durations: Record<string, number> = {};

        this.logger.info(
            `App ${appUuid}: pipeline started (version=${version}, status=${currentStatus}, isIteration=${isIteration})`,
        );

        // --- Stage: sandbox ---
        let sandbox: Sandbox;
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
                        version,
                        e2bApiKey,
                        s3Client,
                        bucket,
                    );
                    sandbox = acquired.sandbox;
                    wasResumed = acquired.wasResumed;
                    Object.assign(durations, acquired.durations);
                } else {
                    const result = await this.createSandbox(appUuid, e2bApiKey);
                    sandbox = result.sandbox;
                    durations.sandboxMs = result.durationMs;
                    await this.appModel.updateSandboxId(
                        appUuid,
                        sandbox.sandboxId,
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
                    'No sandbox_id found for resume',
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
                    e2bApiKey,
                );
                sandbox = result.sandbox;
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
                anthropicApiKey,
                imageIds,
                chartReferences,
            );
        } finally {
            clearInterval(heartbeat);
            await this.pauseSandbox(sandbox, appUuid);
        }
    }

    private async runPipelineStages(
        sandbox: Sandbox,
        payload: AppGeneratePipelineJobPayload,
        s3Client: S3Client,
        bucket: string,
        extraDurations: Record<string, number>,
        overallStart: number,
        currentStatus: AppVersionStatus,
        wasResumed: boolean,
        anthropicApiKey: string,
        imageIds: string[] | undefined,
        chartReferences: ChartReference[] | undefined,
    ): Promise<void> {
        const { appUuid, version, projectUuid, prompt, template } = payload;
        const durations: Record<string, number> = { ...extraDurations };
        const shouldRun = (stage: AppVersionStatus) =>
            AppGenerateService.shouldRunStage(currentStatus, stage);

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
                    version,
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
                    anthropicApiKey,
                );
                durations.generateMs = generation.durationMs;
                responseText = generation.responseText;
                toolCallCount = generation.toolCallCount;
            } catch (error) {
                const totalMs = AppGenerateService.elapsed(overallStart);
                this.logger.error(
                    `App ${appUuid}: generation failed after ${totalMs}ms: ${getErrorMessage(error)}`,
                );
                const marked = await this.markError(
                    appUuid,
                    version,
                    error,
                    'Failed to generate app code. Try rephrasing your request.',
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
                    anthropicApiKey,
                );
                durations.buildMs = buildResult.buildMs;
                buildFixAttempts = buildResult.fixAttempts;
                buildFixGenerationMs = buildResult.fixGenerationMs;
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
                    anthropicApiKey,
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
            `App ${appUuid}: generation completed successfully in ${totalMs}ms (${Object.entries(
                durations,
            )
                .map(([k, v]) => `${k}=${v}ms`)
                .join(', ')})`,
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
     * - the Anthropic model is not configured,
     * - the LLM call times out or errors.
     */
    async clarifyApp(
        user: SessionUser,
        projectUuid: string,
        prompt: string,
        template?: DataAppTemplate,
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

        const anthropicConfig =
            this.lightdashConfig.ai.copilot.providers.anthropic;
        if (!anthropicConfig?.apiKey) {
            this.logger.info(
                'Skipping app clarification: Anthropic API key not configured',
            );
            return { questions: [] };
        }
        const preset = getModelPreset('anthropic', 'claude-sonnet-4-5');
        if (!preset) {
            this.logger.warn(
                'Skipping app clarification: claude-sonnet-4-5 preset not found',
            );
            return { questions: [] };
        }
        const modelOptions = getAnthropicModel(anthropicConfig, preset, {
            enableReasoning: false,
        });

        const catalogSummary =
            await this.buildCatalogSummaryForClarifier(projectUuid);

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

Each question, when asked, must be a single sentence, 5–15 words.`,
                    },
                    {
                        role: 'user',
                        content: `App kind: ${template ?? 'custom'}\n\nUser prompt:\n${trimmed}\n\nAvailable tables and key fields:\n${
                            catalogSummary || '(no catalog available)'
                        }`,
                    },
                ],
            });
        } catch (err) {
            this.logger.warn(
                `App clarify failed after ${AppGenerateService.elapsed(start)}ms (project=${projectUuid}): ${getErrorMessage(err)}`,
            );
            return { questions: [] };
        }
        const elapsedMs = AppGenerateService.elapsed(start);

        const questions = result.object.questions
            .map((q) => q.trim())
            .filter((q) => q.length > 0)
            .slice(0, 4);

        this.logger.info(
            `App clarify: ${questions.length} question(s) in ${elapsedMs}ms (project=${projectUuid})`,
        );

        return { questions };
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
    ): Promise<GenerateAppResult> {
        await this.assertDataAppsEnabled(user);
        const organizationUuid = await this.getProjectOrgUuid(projectUuid);
        this.assertDataAppAbility(
            user,
            'create',
            organizationUuid,
            projectUuid,
            'Insufficient permissions to create data apps',
        );

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
            `App ${appUuid}: generation started (promptLength=${prompt.length}, clarifications=${
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

        // Build resources metadata to persist with the version
        const resources: AppVersionResources = {
            images: imageIds.map((id) => ({ imageId: id })),
            charts: chartResources,
            dashboardName,
            clarifications: clarifications ?? [],
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
    ): Promise<GenerateAppResult> {
        await this.assertDataAppsEnabled(user);

        AppGenerateService.validateImageIds(imageIds);

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
            throw new ParameterError(
                'A version is already building for this app',
            );
        }

        const newVersion = (latestVersion?.version ?? 0) + 1;

        this.logger.info(
            `App ${appUuid}: iteration started (version=${newVersion}, promptLength=${prompt.length})`,
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

        const resources: AppVersionResources = {
            images: imageIds.map((id) => ({ imageId: id })),
            charts: chartResources,
            dashboardName,
            clarifications: [],
        };

        await this.appModel.createVersion(
            appUuid,
            { version: newVersion, prompt },
            'pending',
            user.userUuid,
            resources,
        );

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
            prompt,
            imageIds: imageIds.length > 0 ? imageIds : undefined,
            isIteration: true,
            chartReferences:
                chartReferences.length > 0 ? chartReferences : undefined,
        });

        return { appUuid, version: newVersion };
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

        // Pause the sandbox to interrupt any running commands while keeping
        // it resumable for the next iteration.
        // The pipeline will catch the resulting error, but markError is now
        // a no-op since the version is already in 'error' state — and
        // pipeline catches gate `trackVersionFailed` on the markError result,
        // so no spurious failed analytics event fires on top of the cancel.
        if (app.sandbox_id) {
            try {
                const sandbox = await Sandbox.connect(app.sandbox_id, {
                    apiKey: this.getE2bApiKey(),
                });
                await sandbox.pause();
                this.logger.info(
                    `App ${appUuid}: sandbox paused after cancel (sandboxId=${app.sandbox_id})`,
                );
            } catch (error) {
                // Sandbox may already be dead/paused — that's fine
                this.logger.warn(
                    `App ${appUuid}: failed to pause sandbox after cancel: ${getErrorMessage(error)}`,
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
        template: Exclude<DataAppTemplate, 'custom'> | null;
        pinnedListUuid: string | null;
        pinnedListOrder: number | null;
        versions: {
            version: number;
            prompt: string;
            status: AppVersionStatus;
            statusMessage: string | null;
            createdAt: Date;
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
            })),
            hasMore,
        };
    }

    async listMyApps(
        user: SessionUser,
        paginateArgs?: { page: number; pageSize: number },
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
            // Pausing the sandbox interrupts any in-flight pipeline so it
            // doesn't keep running against a now-hidden app.
            await this.pauseSandboxIfRunning(app.sandbox_id, appUuid);
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

    private async pauseSandboxIfRunning(
        sandboxId: string | null,
        appUuid: string,
    ): Promise<void> {
        if (!sandboxId) return;
        try {
            const sandbox = await Sandbox.connect(sandboxId, {
                apiKey: this.getE2bApiKey(),
            });
            await sandbox.pause();
            this.logger.info(
                `App ${appUuid}: sandbox paused during delete (sandboxId=${sandboxId})`,
            );
        } catch (error) {
            this.logger.warn(
                `App ${appUuid}: failed to pause sandbox during delete: ${getErrorMessage(error)}`,
            );
        }
    }

    private async killSandboxIfExists(
        sandboxId: string | null,
        appUuid: string,
    ): Promise<void> {
        if (!sandboxId) return;
        try {
            const sandbox = await Sandbox.connect(sandboxId, {
                apiKey: this.getE2bApiKey(),
            });
            await sandbox.kill();
            this.logger.info(
                `App ${appUuid}: sandbox killed during hard delete (sandboxId=${sandboxId})`,
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
     * Convert catalog items into a dbt-style YAML that skill.md expects.
     * Groups fields by table and separates dimensions from metrics.
     */
    private static catalogToYaml(
        items: {
            name: string;
            type: string;
            tableName: string;
            fieldType: string | undefined;
        }[],
    ): string {
        const tables = new Map<
            string,
            { dimensions: string[]; metrics: string[] }
        >();

        for (const item of items) {
            if (item.type === 'field') {
                if (!tables.has(item.tableName)) {
                    tables.set(item.tableName, { dimensions: [], metrics: [] });
                }
                const table = tables.get(item.tableName)!;

                if (item.fieldType === 'metric') {
                    table.metrics.push(item.name);
                } else {
                    table.dimensions.push(item.name);
                }
            }
        }

        const lines: string[] = ['models:'];
        for (const [tableName, fields] of tables) {
            lines.push(`  - name: ${tableName}`);
            if (fields.metrics.length > 0) {
                lines.push(`    meta:`);
                lines.push(`      metrics:`);
                for (const m of fields.metrics) {
                    lines.push(`        ${m}:`);
                    lines.push(`          type: metric`);
                }
            }
            if (fields.dimensions.length > 0) {
                lines.push(`    columns:`);
                for (const d of fields.dimensions) {
                    lines.push(`      - name: ${d}`);
                }
            }
        }

        return lines.join('\n');
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
