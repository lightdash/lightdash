import {
    PutObjectCommand,
    S3Client,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { subject } from '@casl/ability';
import {
    ForbiddenError,
    getErrorMessage,
    MissingConfigError,
    ParameterError,
    type SessionUser,
} from '@lightdash/common';
import { Sandbox } from 'e2b';
import { performance } from 'node:perf_hooks';
import { PassThrough } from 'node:stream';
import { extract, type Headers } from 'tar-stream';
import { validate as isValidUuid, v4 as uuidv4 } from 'uuid';
import { LightdashConfig } from '../../../config/parseConfig';
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
    ): Promise<void> {
        try {
            await this.appModel.updateVersionStatus(
                appUuid,
                version,
                'error',
                AppGenerateService.truncateEnd(getErrorMessage(error), 4000),
            );
        } catch (dbError) {
            this.logger.error(
                `App ${appUuid}: failed to persist error status: ${getErrorMessage(dbError)}`,
            );
        }
    }

    private async createSandbox(
        appUuid: string,
        e2bApiKey: string,
        anthropicApiKey: string,
    ): Promise<{ sandbox: Sandbox; durationMs: number }> {
        const start = performance.now();
        const sandbox = await Sandbox.create('lightdash-data-app', {
            timeoutMs: 10 * 60 * 1000,
            apiKey: e2bApiKey,
            envs: { ANTHROPIC_API_KEY: anthropicApiKey },
        });
        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: E2B sandbox created (sandboxId=${sandbox.sandboxId}, ${durationMs}ms)`,
        );
        return { sandbox, durationMs };
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
        await sandbox.files.write('/tmp/dbt-repo/models/schema.yml', modelYaml);
        await sandbox.files.write('/tmp/prompt.txt', prompt);

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

    private async runClaudeGeneration(
        sandbox: Sandbox,
        appUuid: string,
    ): Promise<number> {
        const start = performance.now();
        const result = await sandbox.commands.run(
            `cat /tmp/prompt.txt | claude -p ` +
                `--model sonnet ` +
                `--allowedTools "Read,Write,Edit,Glob,Grep" ` +
                `--append-system-prompt-file /app/skill.md`,
            { cwd: '/app', timeoutMs: 8 * 60 * 1000 },
        );
        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: Claude code generation completed (exit=${result.exitCode}, stdoutLen=${result.stdout.length}, stderrLen=${result.stderr.length}, ${durationMs}ms)`,
        );
        this.logger.debug(
            `App ${appUuid}: Claude stdout (tail): ${AppGenerateService.truncateEnd(result.stdout, 8000)}`,
        );

        if (result.exitCode !== 0) {
            throw new Error(
                `Claude generation failed (exit ${result.exitCode}): ${result.stderr}`,
            );
        }
        return durationMs;
    }

    private async runBuild(sandbox: Sandbox, appUuid: string): Promise<number> {
        const start = performance.now();
        const result = await sandbox.commands.run('pnpm build', {
            cwd: '/app',
            timeoutMs: 60 * 1000,
        });
        const durationMs = AppGenerateService.elapsed(start);
        this.logger.info(
            `App ${appUuid}: Vite build completed (exit=${result.exitCode}, ${durationMs}ms)`,
        );
        if (result.stderr.length > 0) {
            this.logger.debug(
                `App ${appUuid}: build stderr: ${AppGenerateService.truncateEnd(result.stderr, 4000)}`,
            );
        }

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

    async generateApp(
        user: SessionUser,
        projectUuid: string,
        prompt: string,
    ): Promise<GenerateAppResult> {
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
                'Insufficient permissions to create data apps',
            );
        }

        const appUuid = uuidv4();
        const version = 1;
        const anthropicApiKey = this.getAnthropicApiKey();
        const e2bApiKey = this.getE2bApiKey();
        const { client: s3Client, bucket } = this.getS3Client();

        const overallStart = performance.now();
        const durations: Record<string, number> = {};

        this.logger.info(
            `App ${appUuid}: generation started (promptLength=${prompt.length})`,
        );

        // Persist app record early so we can track status
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

        let sandbox: Sandbox;
        try {
            const result = await this.createSandbox(
                appUuid,
                e2bApiKey,
                anthropicApiKey,
            );
            sandbox = result.sandbox;
            durations.sandboxMs = result.durationMs;
        } catch (error) {
            await this.markError(appUuid, version, error);
            throw error;
        }

        try {
            durations.catalogMs = await this.writeCatalogAndPrompt(
                sandbox,
                appUuid,
                projectUuid,
                prompt,
            );
            durations.generateMs = await this.runClaudeGeneration(
                sandbox,
                appUuid,
            );
            durations.buildMs = await this.runBuild(sandbox, appUuid);

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

            const dbStart = performance.now();
            await this.appModel.updateVersionStatus(appUuid, version, 'ready');
            durations.dbMs = AppGenerateService.elapsed(dbStart);

            const totalMs = AppGenerateService.elapsed(overallStart);
            this.logger.info(
                `App ${appUuid}: generation completed successfully in ${totalMs}ms (${Object.entries(
                    durations,
                )
                    .map(([k, v]) => `${k}=${v}ms`)
                    .join(', ')})`,
            );

            return { appUuid, version };
        } catch (error) {
            const totalMs = AppGenerateService.elapsed(overallStart);
            this.logger.error(
                `App ${appUuid}: generation failed after ${totalMs}ms: ${getErrorMessage(error)}`,
            );
            await this.markError(appUuid, version, error);
            throw error;
        } finally {
            await sandbox.kill();
            this.logger.info(
                `App ${appUuid}: sandbox terminated (sandboxId=${sandbox.sandboxId})`,
            );
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

    getPreviewToken(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        version: number,
    ): string {
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
