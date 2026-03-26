import {
    PutObjectCommand,
    S3Client,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { subject } from '@casl/ability';
import {
    ForbiddenError,
    MissingConfigError,
    ParameterError,
    type SessionUser,
} from '@lightdash/common';
import { Sandbox } from 'e2b';
import { PassThrough } from 'node:stream';
import { extract, type Headers } from 'tar-stream';
import { validate as isValidUuid, v4 as uuidv4 } from 'uuid';
import { LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import { mintPreviewToken } from '../../../routers/appPreviewToken';
import { BaseService } from '../../../services/BaseService';

type AppGenerateServiceDeps = {
    lightdashConfig: LightdashConfig;
};

type GenerateAppResult = {
    appUuid: string;
    versionUuid: string;
};

export class AppGenerateService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    constructor({ lightdashConfig }: AppGenerateServiceDeps) {
        super();
        this.lightdashConfig = lightdashConfig;
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
        const versionUuid = uuidv4();
        const anthropicApiKey = this.getAnthropicApiKey();
        const e2bApiKey = this.getE2bApiKey();
        const { client: s3Client, bucket } = this.getS3Client();

        this.logger.info(
            `Generating app ${appUuid} version ${versionUuid} from prompt`,
        );

        const sandbox = await Sandbox.create('lightdash-data-app', {
            timeoutMs: 10 * 60 * 1000,
            apiKey: e2bApiKey,
            envs: {
                ANTHROPIC_API_KEY: anthropicApiKey,
            },
        });

        try {
            // Write the prompt to a file to avoid shell injection
            await sandbox.files.write('/tmp/prompt.txt', prompt);

            // Generate the app with Claude
            this.logger.info(`App ${appUuid}: running Claude code generation`);

            const generateResult = await sandbox.commands.run(
                `cat /tmp/prompt.txt | claude -p ` +
                    `--model sonnet ` +
                    `--allowedTools "Read,Write,Edit,Glob,Grep" ` +
                    `--append-system-prompt-file /app/skill.md`,
                {
                    cwd: '/app',
                    timeoutMs: 8 * 60 * 1000,
                },
            );

            if (generateResult.exitCode !== 0) {
                throw new Error(
                    `Claude generation failed (exit ${generateResult.exitCode}): ${generateResult.stderr}`,
                );
            }

            // Build the Vite project
            this.logger.info(`App ${appUuid}: building Vite project`);
            const buildResult = await sandbox.commands.run('pnpm build', {
                cwd: '/app',
                timeoutMs: 60 * 1000,
            });

            if (buildResult.exitCode !== 0) {
                throw new Error(
                    `Build failed (exit ${buildResult.exitCode}): ${buildResult.stderr}`,
                );
            }

            // Tar and download dist/
            this.logger.info(`App ${appUuid}: downloading dist/`);
            await sandbox.commands.run('tar -cf /tmp/dist.tar -C /app dist', {
                timeoutMs: 10_000,
            });

            const tarBytes = await sandbox.files.read('/tmp/dist.tar', {
                format: 'bytes',
            });

            // Extract tar and upload each file to S3
            this.logger.info(`App ${appUuid}: uploading to S3`);
            const tarBuffer = Buffer.from(tarBytes);
            await AppGenerateService.extractAndUploadToS3(
                tarBuffer,
                s3Client,
                bucket,
                `apps/${appUuid}/versions/${versionUuid}`,
            );

            this.logger.info(
                `App ${appUuid} version ${versionUuid} generated successfully`,
            );

            return { appUuid, versionUuid };
        } finally {
            await sandbox.kill();
            this.logger.info(`App ${appUuid}: sandbox terminated`);
        }
    }

    private static async extractAndUploadToS3(
        tarBuffer: Buffer,
        s3Client: S3Client,
        bucket: string,
        s3Prefix: string,
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const extractor = extract();
            const uploads: Promise<void>[] = [];

            extractor.on(
                'entry',
                (header: Headers, stream: PassThrough, next: () => void) => {
                    if (header.type === 'file' && header.name) {
                        const chunks: Buffer[] = [];
                        stream.on('data', (chunk: Buffer) =>
                            chunks.push(chunk),
                        );
                        stream.on('end', () => {
                            const body = Buffer.concat(chunks);
                            // header.name is like "dist/index.html" — strip "dist/" prefix
                            const relativePath = header.name.replace(
                                /^dist\//,
                                '',
                            );
                            const s3Key = `${s3Prefix}/${relativePath}`;
                            const contentType =
                                AppGenerateService.getContentType(relativePath);

                            const upload = s3Client
                                .send(
                                    new PutObjectCommand({
                                        Bucket: bucket,
                                        Key: s3Key,
                                        Body: body,
                                        ContentType: contentType,
                                    }),
                                )
                                .then(() => {
                                    Logger.debug(`Uploaded ${s3Key}`);
                                });

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
                Promise.all(uploads).then(() => resolve(), reject);
            });

            extractor.on('error', reject);

            const passThrough = new PassThrough();
            passThrough.pipe(extractor);
            passThrough.end(tarBuffer);
        });
    }

    getPreviewToken(
        user: SessionUser,
        projectUuid: string,
        appUuid: string,
        versionUuid: string,
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

        if (!isValidUuid(appUuid) || !isValidUuid(versionUuid)) {
            throw new ParameterError('Invalid UUID format');
        }

        return mintPreviewToken(
            this.lightdashConfig.lightdashSecret,
            appUuid,
            versionUuid,
        );
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
