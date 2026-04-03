import {
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    MissingConfigError,
    ParameterError,
    type AppGeneratePipelineJobPayload,
    type AppImageAttachment,
    type SessionUser,
} from '@lightdash/common';
import { ALL_TRAFFIC, Sandbox } from 'e2b';
import { performance } from 'node:perf_hooks';
import { PassThrough, Readable } from 'node:stream';
import { extract, type Headers } from 'tar-stream';
import { validate as isValidUuid, v4 as uuidv4 } from 'uuid';
import { LightdashConfig } from '../../../config/parseConfig';
import {
    APP_VERSION_STAGE_ORDER,
    APP_VERSION_TERMINAL_STATUSES,
    isAppVersionInProgress,
    type AppVersionStatus,
    type DbApp,
} from '../../../database/entities/apps';
import { AppModel } from '../../../models/AppModel';
import { CatalogModel } from '../../../models/CatalogModel/CatalogModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { mintPreviewToken } from '../../../routers/appPreviewToken';
import { BaseService } from '../../../services/BaseService';
import type { CommercialSchedulerClient } from '../../scheduler/SchedulerClient';

type AppGenerateServiceDeps = {
    lightdashConfig: LightdashConfig;
    catalogModel: CatalogModel;
    appModel: AppModel;
    featureFlagModel: FeatureFlagModel;
    schedulerClient: CommercialSchedulerClient;
};

type GenerateAppResult = {
    appUuid: string;
    version: number;
};

export class AppGenerateService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly catalogModel: CatalogModel;

    private readonly appModel: AppModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly schedulerClient: CommercialSchedulerClient;

    constructor({
        lightdashConfig,
        catalogModel,
        appModel,
        featureFlagModel,
        schedulerClient,
    }: AppGenerateServiceDeps) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.catalogModel = catalogModel;
        this.appModel = appModel;
        this.featureFlagModel = featureFlagModel;
        this.schedulerClient = schedulerClient;
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

        if (s3Config.accessKey && s3Config.secretKey) {
            config.credentials = {
                accessKeyId: s3Config.accessKey,
                secretAccessKey: s3Config.secretKey,
            };
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

    private static mimeToExt(mimeType: string): string {
        const extMap: Record<string, string> = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/gif': 'gif',
            'image/webp': 'webp',
        };
        return extMap[mimeType] ?? 'png';
    }

    async uploadImage(
        user: SessionUser,
        projectUuid: string,
        mimeType: string,
        body: Readable,
        contentLength: number | undefined,
        appUuid?: string,
    ): Promise<{ s3Key: string }> {
        await this.assertDataAppsEnabled(user);
        if (
            user.ability.cannot(
                'manage',
                subject('DataApp', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
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
        if (contentLength !== undefined && contentLength > maxSize) {
            throw new ParameterError(
                `Image too large: ${contentLength} bytes. Maximum: ${maxSize} bytes`,
            );
        }

        const { client: s3Client, bucket } = this.getS3Client();
        const ext = AppGenerateService.mimeToExt(mimeType);
        const appDir = appUuid ?? uuidv4();
        const s3Key = `apps/${appDir}/images/${uuidv4()}.${ext}`;

        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: s3Key,
                Body: body,
                ContentLength: contentLength,
                ContentType: mimeType,
            }),
        );

        return { s3Key };
    }

    private static truncateEnd(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return `...[truncated ${text.length - maxLength} chars]...${text.slice(-maxLength)}`;
    }

    private static elapsed(start: number): number {
        return Math.round(performance.now() - start);
    }

    async markError(
        appUuid: string,
        version: number,
        error: unknown,
        userMessage: string,
    ): Promise<void> {
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
        } catch (dbError) {
            this.logger.error(
                `App ${appUuid}: failed to persist error status: ${getErrorMessage(dbError)}`,
            );
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
        const sandbox = await Sandbox.create('lightdash-data-app', {
            timeoutMs: 60 * 60 * 1000,
            apiKey: e2bApiKey,
            lifecycle: { onTimeout: 'pause' },
            network: {
                allowOut: ['api.anthropic.com'],
                denyOut: [ALL_TRAFFIC],
            },
        });
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

    private async writeCatalogAndPrompt(
        sandbox: Sandbox,
        appUuid: string,
        projectUuid: string,
        prompt: string,
        image: AppImageAttachment | undefined,
        s3Client: S3Client,
        bucket: string,
    ): Promise<number> {
        const start = performance.now();

        const catalogItems =
            await this.catalogModel.getCatalogItemsSummary(projectUuid);
        const modelYaml = AppGenerateService.catalogToYaml(catalogItems);

        // Remove files that may have been created by a previous run with
        // different ownership (e.g. root-owned after Claude CLI execution),
        // which would cause a permission error on write.
        await sandbox.commands.run(
            'rm -f /tmp/dbt-repo/models/schema.yml /tmp/prompt.txt 2>/dev/null; rm -rf /tmp/images 2>/dev/null; true',
            { timeoutMs: 5_000 },
        );

        await sandbox.files.write('/tmp/dbt-repo/models/schema.yml', modelYaml);

        // Write image to sandbox and prepend path reference to prompt
        let finalPrompt = prompt;
        if (image) {
            const imagePath = await this.writeImageToSandbox(
                sandbox,
                appUuid,
                image,
                s3Client,
                bucket,
            );
            finalPrompt = `[Design reference image at ${imagePath} — use the Read tool to view it]\n\n${prompt}`;
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
        return durationMs;
    }

    /**
     * Stream an image from S3 and write it into the sandbox.
     * Returns the sandbox file path where the image was written.
     */
    private async writeImageToSandbox(
        sandbox: Sandbox,
        appUuid: string,
        image: AppImageAttachment,
        s3Client: S3Client,
        bucket: string,
    ): Promise<string> {
        const ext = AppGenerateService.mimeToExt(image.mimeType);
        const filePath = `/tmp/images/reference.${ext}`;

        this.logger.info(
            `App ${appUuid}: streaming image from S3 (key=${image.s3Key}, type=${image.mimeType})`,
        );

        const response = await s3Client.send(
            new GetObjectCommand({
                Bucket: bucket,
                Key: image.s3Key,
            }),
        );

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
            `App ${appUuid}: writing image to sandbox (${image.mimeType}, ${buffer.length} bytes)`,
        );

        await sandbox.commands.run('mkdir -p /tmp/images', {
            timeoutMs: 5_000,
        });
        await sandbox.files.write(
            filePath,
            buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength,
            ) as ArrayBuffer,
        );

        return filePath;
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
    ): Promise<{ durationMs: number; responseText: string | null }> {
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
                `--allowedTools "Read(//app/**),Read(//tmp/dbt-repo/**),Read(//tmp/images/**),Write(//app/src/**),Edit(//app/src/**),Glob(//app/**),Glob(//tmp/dbt-repo/**),Grep(//app/**),Grep(//tmp/dbt-repo/**)" ` +
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
        return { durationMs, responseText };
    }

    private async runBuild(sandbox: Sandbox, appUuid: string): Promise<number> {
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

        if (result.exitCode !== 0) {
            throw new Error(
                `Build failed (exit ${result.exitCode}): ${result.stderr}`,
            );
        }
        return durationMs;
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

    private async advanceStage(
        appUuid: string,
        version: number,
        stage: AppVersionStatus,
        statusMessage: string,
    ): Promise<void> {
        await this.appModel.updateVersionStatus(
            appUuid,
            version,
            stage,
            null,
            statusMessage,
        );
    }

    /**
     * Main pipeline entry point — called by the Graphile Worker task handler.
     * On retry after pod death, reads current status from DB and skips
     * completed stages. `claude --continue` resumes the conversation.
     */
    async runPipeline(payload: AppGeneratePipelineJobPayload): Promise<void> {
        const { appUuid, version, projectUuid, prompt, image, isIteration } =
            payload;

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
            await this.markError(
                appUuid,
                version,
                error,
                'Something went wrong. Please try again.',
            );
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
            await this.advanceStage(
                appUuid,
                version,
                'sandbox',
                'Setting up build environment',
            );
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
                await this.markError(
                    appUuid,
                    version,
                    error,
                    'Failed to set up build environment. Please try again.',
                );
                return;
            }
        } else {
            // Resuming past sandbox stage — reconnect
            const app = await this.appModel.getApp(appUuid, projectUuid);
            if (!app.sandbox_id) {
                await this.markError(
                    appUuid,
                    version,
                    new Error('No sandbox_id found for resume'),
                    'Failed to resume build environment. Please try again.',
                );
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
                await this.markError(
                    appUuid,
                    version,
                    error,
                    'Failed to resume build environment. Please try again.',
                );
                return;
            }
        }

        try {
            await this.runPipelineStages(
                sandbox,
                appUuid,
                version,
                projectUuid,
                prompt,
                s3Client,
                bucket,
                durations,
                overallStart,
                currentStatus,
                wasResumed,
                anthropicApiKey,
                image,
            );
        } finally {
            await this.pauseSandbox(sandbox, appUuid);
        }
    }

    private async runPipelineStages(
        sandbox: Sandbox,
        appUuid: string,
        version: number,
        projectUuid: string,
        prompt: string,
        s3Client: S3Client,
        bucket: string,
        extraDurations: Record<string, number>,
        overallStart: number,
        currentStatus: AppVersionStatus,
        wasResumed: boolean,
        anthropicApiKey: string,
        image: AppImageAttachment | undefined,
    ): Promise<void> {
        const durations: Record<string, number> = { ...extraDurations };
        const shouldRun = (stage: AppVersionStatus) =>
            AppGenerateService.shouldRunStage(currentStatus, stage);

        // --- Stage: catalog ---
        if (shouldRun('catalog')) {
            try {
                await this.advanceStage(
                    appUuid,
                    version,
                    'catalog',
                    'Loading your data models',
                );
                durations.catalogMs = await this.writeCatalogAndPrompt(
                    sandbox,
                    appUuid,
                    projectUuid,
                    prompt,
                    image,
                    s3Client,
                    bucket,
                );
            } catch (error) {
                const totalMs = AppGenerateService.elapsed(overallStart);
                this.logger.error(
                    `App ${appUuid}: catalog failed after ${totalMs}ms: ${getErrorMessage(error)}`,
                );
                await this.markError(
                    appUuid,
                    version,
                    error,
                    'Failed to load your data models. Please try again.',
                );
                return;
            }
        }

        // --- Stage: generating ---
        let responseText: string | null = null;
        if (shouldRun('generating')) {
            try {
                await this.advanceStage(
                    appUuid,
                    version,
                    'generating',
                    AppGenerateService.randomCodingPhrase(),
                );
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
            } catch (error) {
                const totalMs = AppGenerateService.elapsed(overallStart);
                this.logger.error(
                    `App ${appUuid}: generation failed after ${totalMs}ms: ${getErrorMessage(error)}`,
                );
                await this.markError(
                    appUuid,
                    version,
                    error,
                    'Failed to generate app code. Try rephrasing your request.',
                );
                return;
            }
        }

        // --- Stage: building ---
        if (shouldRun('building')) {
            try {
                await this.advanceStage(
                    appUuid,
                    version,
                    'building',
                    'Packaging your app',
                );
                durations.buildMs = await this.runBuild(sandbox, appUuid);
            } catch (error) {
                const totalMs = AppGenerateService.elapsed(overallStart);
                this.logger.error(
                    `App ${appUuid}: build failed after ${totalMs}ms: ${getErrorMessage(error)}`,
                );
                await this.markError(
                    appUuid,
                    version,
                    error,
                    "The generated code couldn't be compiled. Try again or simplify your request.",
                );
                return;
            }
        }

        // --- Stage: packaging ---
        if (shouldRun('packaging')) {
            try {
                await this.advanceStage(
                    appUuid,
                    version,
                    'packaging',
                    'Deploying your app',
                );
                const artifacts = await this.packageArtifacts(sandbox, appUuid);
                durations.packageMs = artifacts.durationMs;

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
                await this.markError(
                    appUuid,
                    version,
                    error,
                    'Failed to deploy your app. Please try again.',
                );
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
            await this.markError(
                appUuid,
                version,
                error,
                'Something went wrong. Please try again.',
            );
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
    }

    async generateApp(
        user: SessionUser,
        projectUuid: string,
        prompt: string,
        image?: AppImageAttachment,
        preGeneratedAppUuid?: string,
    ): Promise<GenerateAppResult> {
        await this.assertDataAppsEnabled(user);
        if (
            user.ability.cannot(
                'manage',
                subject('DataApp', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to create data apps',
            );
        }

        const appUuid = preGeneratedAppUuid ?? uuidv4();
        const version = 1;

        this.logger.info(
            `App ${appUuid}: generation started (promptLength=${prompt.length})`,
        );

        // Persist app record so we can track status immediately
        try {
            await this.appModel.createWithVersion(
                {
                    app_id: appUuid,
                    project_uuid: projectUuid,
                    created_by_user_uuid: user.userUuid,
                },
                { version, prompt },
                'pending',
            );
        } catch (error) {
            this.logger.error(
                `App ${appUuid}: failed to create app record: ${getErrorMessage(error)}`,
            );
            throw error;
        }

        await this.schedulerClient.appGeneratePipeline({
            appUuid,
            version,
            projectUuid,
            organizationUuid: user.organizationUuid!,
            userUuid: user.userUuid,
            prompt,
            image,
            isIteration: false,
        });

        return { appUuid, version };
    }

    async iterateApp(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        prompt: string,
        image?: AppImageAttachment,
    ): Promise<GenerateAppResult> {
        await this.assertDataAppsEnabled(user);
        if (
            user.ability.cannot(
                'manage',
                subject('DataApp', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to modify data apps',
            );
        }

        await this.appModel.getApp(appUuid, projectUuid); // validates app exists

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

        await this.appModel.createVersion(
            appUuid,
            { version: newVersion, prompt },
            'pending',
            user.userUuid,
        );

        await this.schedulerClient.appGeneratePipeline({
            appUuid,
            version: newVersion,
            projectUuid,
            organizationUuid: user.organizationUuid!,
            userUuid: user.userUuid,
            prompt,
            image,
            isIteration: true,
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
        if (
            user.ability.cannot(
                'manage',
                subject('DataApp', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to cancel app generation',
            );
        }

        const app = await this.appModel.getApp(appUuid, projectUuid);

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

        // Pause the sandbox to interrupt any running commands while keeping
        // it resumable for the next iteration.
        // The pipeline will catch the resulting error, but markError is now
        // a no-op since the version is already in 'error' state.
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
        versions: {
            version: number;
            prompt: string;
            status: AppVersionStatus;
            statusMessage: string | null;
            createdAt: Date;
        }[];
        hasMore: boolean;
    }> {
        await this.assertDataAppsEnabled(user);
        if (
            user.ability.cannot(
                'manage',
                subject('DataApp', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to access data apps',
            );
        }

        const { name, description, createdByUserUuid, versions, hasMore } =
            await this.appModel.getAppWithVersions(appUuid, projectUuid, opts);

        return {
            appUuid,
            name,
            description,
            createdByUserUuid,
            versions: versions.map((v) => ({
                version: v.version,
                prompt: v.prompt,
                status: v.status,
                statusMessage: v.status_message,
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
        if (user.ability.cannot('manage', 'DataApp')) {
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
                createdAt: row.app.created_at,
                lastVersionNumber: row.lastVersion?.version ?? null,
                lastVersionStatus: row.lastVersion?.status ?? null,
            })),
            pagination: result.pagination,
        };
    }

    async updateApp(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        update: { name?: string; description?: string },
    ): Promise<{ appUuid: string; name: string; description: string }> {
        await this.assertDataAppsEnabled(user);
        if (
            user.ability.cannot(
                'manage',
                subject('DataApp', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to manage data apps',
            );
        }

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

        const app = await this.appModel.updateApp(
            appUuid,
            projectUuid,
            fieldsToUpdate,
        );
        return {
            appUuid: app.app_id,
            name: app.name,
            description: app.description,
        };
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
        if (
            user.ability.cannot(
                'manage',
                subject('DataApp', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to access data apps',
            );
        }

        if (!isValidUuid(appUuid)) {
            throw new ParameterError('Invalid UUID format');
        }

        if (!Number.isInteger(version) || version < 1) {
            throw new ParameterError('Version must be a positive integer');
        }

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
