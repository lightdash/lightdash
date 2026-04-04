import {
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { subject } from '@casl/ability';
import {
    ForbiddenError,
    getErrorMessage,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    type SessionUser,
} from '@lightdash/common';
import { Sandbox } from 'e2b';
import { performance } from 'node:perf_hooks';
import { PassThrough, Readable } from 'node:stream';
import { extract, type Headers } from 'tar-stream';
import { validate as isValidUuid, v4 as uuidv4 } from 'uuid';
import { LightdashConfig } from '../../../config/parseConfig';
import { type DbApp } from '../../../database/entities/apps';
import { AppModel } from '../../../models/AppModel';
import { CatalogModel } from '../../../models/CatalogModel/CatalogModel';
import { mintPreviewToken } from '../../../routers/appPreviewToken';
import { BaseService } from '../../../services/BaseService';

type AppGenerateServiceDeps = {
    lightdashConfig: LightdashConfig;
    catalogModel: CatalogModel;
    appModel: AppModel;
};

type GenerateAppResult = {
    appUuid: string;
    version: number;
};

export class AppGenerateService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly catalogModel: CatalogModel;

    private readonly appModel: AppModel;

    constructor({
        lightdashConfig,
        catalogModel,
        appModel,
    }: AppGenerateServiceDeps) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.catalogModel = catalogModel;
        this.appModel = appModel;
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

    private assertDataAppsEnabled(): void {
        if (!this.lightdashConfig.appRuntime.enabled) {
            throw new ForbiddenError('Data apps are not enabled');
        }
    }

    private static truncateEnd(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return `...[truncated ${text.length - maxLength} chars]...${text.slice(-maxLength)}`;
    }

    private static elapsed(start: number): number {
        return Math.round(performance.now() - start);
    }

    private async markError(
        appUuid: string,
        version: number,
        error: unknown,
        userMessage: string,
    ): Promise<void> {
        try {
            const updated = await this.appModel.updateVersionStatusIfBuilding(
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

    private async createSandbox(
        appUuid: string,
        e2bApiKey: string,
    ): Promise<{ sandbox: Sandbox; durationMs: number }> {
        const start = performance.now();
        const sandbox = await Sandbox.create('lightdash-data-app', {
            timeoutMs: 60 * 60 * 1000,
            apiKey: e2bApiKey,
            lifecycle: { onTimeout: 'pause' },
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
    ): Promise<number> {
        const start = performance.now();

        const catalogItems =
            await this.catalogModel.getCatalogItemsSummary(projectUuid);
        const modelYaml = AppGenerateService.catalogToYaml(catalogItems);

        // Remove files that may have been created by a previous run with
        // different ownership (e.g. root-owned after Claude CLI execution),
        // which would cause a permission error on write.
        await sandbox.commands.run(
            'rm -f /tmp/dbt-repo/models/schema.yml /tmp/prompt.txt 2>/dev/null; true',
            { timeoutMs: 5_000 },
        );

        await sandbox.files.write('/tmp/dbt-repo/models/schema.yml', modelYaml);

        // Write only the latest prompt — Claude is stateless between runs, but
        // the sandbox filesystem preserves all code from previous iterations.
        // Claude can read existing files to understand what was built so far,
        // so replaying the full prompt history is unnecessary and makes
        // responses overly verbose.
        await sandbox.files.write('/tmp/prompt.txt', `${prompt}\n`);

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
                `--allowedTools "Read(//app/**),Read(//tmp/dbt-repo/**),Write(//app/src/**),Edit(//app/src/**),Glob(//app/**),Glob(//tmp/dbt-repo/**),Grep(//app/**),Grep(//tmp/dbt-repo/**)" ` +
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

    private async runNewAppPipeline(
        appUuid: string,
        version: number,
        projectUuid: string,
        prompt: string,
    ): Promise<void> {
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

        await this.appModel.updateStatusMessage(
            appUuid,
            version,
            'Setting up build environment',
        );

        let sandbox: Sandbox;
        try {
            const result = await this.createSandbox(appUuid, e2bApiKey);
            sandbox = result.sandbox;
            durations.sandboxMs = result.durationMs;
            await this.appModel.updateSandboxId(appUuid, sandbox.sandboxId);
        } catch (error) {
            await this.markError(
                appUuid,
                version,
                error,
                'Failed to set up build environment. Please try again.',
            );
            return;
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
                false, // fresh sandbox — no previous session to continue
                anthropicApiKey,
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
        continueSession: boolean,
        anthropicApiKey: string,
    ): Promise<void> {
        const durations: Record<string, number> = { ...extraDurations };

        try {
            await this.appModel.updateStatusMessage(
                appUuid,
                version,
                'Loading your data models',
            );
            durations.catalogMs = await this.writeCatalogAndPrompt(
                sandbox,
                appUuid,
                projectUuid,
                prompt,
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

        let responseText: string | null = null;

        try {
            await this.appModel.updateStatusMessage(
                appUuid,
                version,
                AppGenerateService.randomCodingPhrase(),
            );
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

        try {
            await this.appModel.updateStatusMessage(
                appUuid,
                version,
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

        try {
            await this.appModel.updateStatusMessage(
                appUuid,
                version,
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

        try {
            const dbStart = performance.now();
            const updated = await this.appModel.updateVersionStatusIfBuilding(
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
    ): Promise<GenerateAppResult> {
        this.assertDataAppsEnabled();
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('DataApp', {
                    uuid: '',
                    organizationUuid: user.organizationUuid || '',
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to create data apps',
            );
        }

        const appUuid = uuidv4();
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
                'building',
            );
        } catch (error) {
            this.logger.error(
                `App ${appUuid}: failed to create app record: ${getErrorMessage(error)}`,
            );
            throw error;
        }

        // Fire pipeline in background — status updates flow through DB polling
        this.runNewAppPipeline(appUuid, version, projectUuid, prompt).catch(
            (error) => {
                this.logger.error(
                    `App ${appUuid}: unhandled pipeline error: ${getErrorMessage(error)}`,
                );
            },
        );

        return { appUuid, version };
    }

    private async runIterationPipeline(
        app: DbApp,
        appUuid: string,
        newVersion: number,
        projectUuid: string,
        prompt: string,
    ): Promise<void> {
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
                newVersion,
                error,
                'Something went wrong. Please try again.',
            );
            return;
        }

        const overallStart = performance.now();
        const durations: Record<string, number> = {};

        await this.appModel.updateStatusMessage(
            appUuid,
            newVersion,
            'Setting up build environment',
        );

        let sandbox: Sandbox;
        let wasResumed = false;
        try {
            const acquired = await this.acquireSandbox(
                app,
                appUuid,
                newVersion,
                e2bApiKey,
                s3Client,
                bucket,
            );
            sandbox = acquired.sandbox;
            wasResumed = acquired.wasResumed;
            Object.assign(durations, acquired.durations);
        } catch (error) {
            await this.markError(
                appUuid,
                newVersion,
                error,
                'Failed to set up build environment. Please try again.',
            );
            return;
        }

        try {
            await this.runPipelineStages(
                sandbox,
                appUuid,
                newVersion,
                projectUuid,
                prompt,
                s3Client,
                bucket,
                durations,
                overallStart,
                wasResumed, // continue Claude session if sandbox was resumed
                anthropicApiKey,
            );
        } finally {
            await this.pauseSandbox(sandbox, appUuid);
        }
    }

    async iterateApp(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        prompt: string,
    ): Promise<GenerateAppResult> {
        this.assertDataAppsEnabled();
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('DataApp', {
                    uuid: '',
                    organizationUuid: user.organizationUuid || '',
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to modify data apps',
            );
        }

        const app = await this.appModel.getApp(appUuid, projectUuid);

        const latestVersion = await this.appModel.getLatestVersion(appUuid);
        if (latestVersion?.status === 'building') {
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
            'building',
            user.userUuid,
        );

        // Fire pipeline in background — status updates flow through DB polling
        this.runIterationPipeline(
            app,
            appUuid,
            newVersion,
            projectUuid,
            prompt,
        ).catch((error) => {
            this.logger.error(
                `App ${appUuid}: unhandled iteration pipeline error: ${getErrorMessage(error)}`,
            );
        });

        return { appUuid, version: newVersion };
    }

    async cancelVersion(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        version: number,
    ): Promise<void> {
        this.assertDataAppsEnabled();
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
        const updated = await this.appModel.updateVersionStatusIfBuilding(
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
        versions: {
            version: number;
            prompt: string;
            status: string;
            statusMessage: string | null;
            createdAt: Date;
        }[];
        hasMore: boolean;
    }> {
        this.assertDataAppsEnabled();
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('DataApp', {
                    uuid: '',
                    organizationUuid: user.organizationUuid || '',
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to access data apps',
            );
        }

        const { name, description, versions, hasMore } =
            await this.appModel.getAppWithVersions(appUuid, projectUuid, opts);

        // Auto-heal stale builds: if the pipeline died (e.g. server restart)
        // the version stays "building" forever. Detect via heartbeat timeout.
        const STALE_THRESHOLD_MS = 60 * 60_000;
        const now = Date.now();
        const staleVersions = versions.filter((v) => {
            if (v.status !== 'building') return false;
            const lastActivity = v.status_updated_at ?? v.created_at;
            return now - new Date(lastActivity).getTime() > STALE_THRESHOLD_MS;
        });
        // Best-effort — don't let a failed DB write break the GET response
        try {
            await Promise.all(
                staleVersions.map(async (v) => {
                    this.logger.warn(
                        `App ${appUuid}: auto-healing stale build (version=${v.version})`,
                    );
                    await this.appModel.updateVersionStatus(
                        appUuid,
                        v.version,
                        'error',
                        'Build process was interrupted',
                        'Something went wrong. Please try again.',
                    );
                }),
            );
        } catch (healError) {
            this.logger.error(
                `App ${appUuid}: auto-heal failed: ${getErrorMessage(healError)}`,
            );
        }
        const staleVersionNumbers = new Set(
            staleVersions.map((v) => v.version),
        );

        return {
            appUuid,
            name,
            description,
            versions: versions.map((v) => ({
                version: v.version,
                prompt: v.prompt,
                status: staleVersionNumbers.has(v.version) ? 'error' : v.status,
                statusMessage: staleVersionNumbers.has(v.version)
                    ? 'Something went wrong. Please try again.'
                    : v.status_message,
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
            lastVersionStatus: string | null;
        }[];
        pagination?: {
            page: number;
            pageSize: number;
            totalPageCount: number;
            totalResults: number;
        };
    }> {
        this.assertDataAppsEnabled();
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
        this.assertDataAppsEnabled();
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

    getPreviewToken(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        version: number,
    ): string {
        this.assertDataAppsEnabled();
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('DataApp', {
                    uuid: '',
                    organizationUuid: user.organizationUuid || '',
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
