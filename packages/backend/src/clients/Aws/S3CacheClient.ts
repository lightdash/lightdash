import {
    GetObjectCommand,
    HeadObjectCommand,
    NotFound,
    PutObjectCommand,
    PutObjectCommandInput,
    S3,
    S3ServiceException,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import {
    getErrorMessage,
    MissingConfigError,
    S3Error,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { wrapSentryTransaction } from '../../utils';

export type S3CacheClientArguments = {
    lightdashConfig: LightdashConfig;
};

export class S3CacheClient {
    configuration: LightdashConfig['results']['s3'];

    protected readonly s3: S3 | undefined;

    constructor({ lightdashConfig }: S3CacheClientArguments) {
        this.configuration = lightdashConfig.results.s3;

        if (!this.configuration) {
            return;
        }

        const { endpoint, region, accessKey, secretKey, forcePathStyle } =
            this.configuration;

        const s3Config: S3ClientConfig = {
            endpoint,
            region,
            apiVersion: '2006-03-01',
            forcePathStyle,
        };

        if (accessKey && secretKey) {
            Object.assign(s3Config, {
                credentials: {
                    accessKeyId: accessKey,
                    secretAccessKey: secretKey,
                },
            });
            Logger.debug(
                'Using results S3 storage with access key credentials',
            );
        } else {
            Logger.debug('Using results S3 storage with IAM role credentials');
        }

        this.s3 = new S3(s3Config);
    }

    async uploadResults(
        key: string,
        results: PutObjectCommandInput['Body'],
        metadata: PutObjectCommandInput['Metadata'],
    ) {
        return wrapSentryTransaction('s3.uploadResults', { key }, async () => {
            if (!this.configuration || !this.s3) {
                throw new MissingConfigError('S3 configuration is not set');
            }

            try {
                const sanitizedMetadata = metadata
                    ? Object.fromEntries(
                          Object.entries(metadata).map(([_key, value]) => {
                              switch (typeof value) {
                                  case 'object':
                                      return [key, JSON.stringify(value)];
                                  default:
                                      return [key, String(value)];
                              }
                          }),
                      )
                    : {};

                const command = new PutObjectCommand({
                    Bucket: this.configuration.bucket,
                    Key: `${key}.json`,
                    Body: results,
                    ContentType: 'application/json',
                    Metadata: sanitizedMetadata,
                });
                await this.s3.send(command);
            } catch (error) {
                if (error instanceof S3ServiceException) {
                    Logger.error(
                        `Failed to upload results to s3. ${error.name} - ${error.message}`,
                    );
                } else {
                    Logger.error(
                        `Failed to upload results to s3. ${getErrorMessage(
                            error,
                        )}`,
                    );
                }

                Sentry.captureException(
                    new S3Error(
                        `Failed to upload results to s3. ${getErrorMessage(
                            error,
                        )}`,
                        {
                            key,
                        },
                    ),
                );

                throw error;
            }
        });
    }

    async getResultsMetadata(key: string) {
        return wrapSentryTransaction(
            's3.getResultsMetadata',
            { key },
            async () => {
                if (!this.configuration || !this.s3) {
                    throw new MissingConfigError('S3 configuration is not set');
                }

                try {
                    const command = new HeadObjectCommand({
                        Bucket: this.configuration.bucket,
                        Key: `${key}.json`,
                    });
                    return await this.s3.send(command);
                } catch (error) {
                    if (error instanceof NotFound) {
                        return undefined;
                    }

                    if (error instanceof S3ServiceException) {
                        Logger.error(
                            `Failed to get results metadata from s3. ${error.name} - ${error.message}`,
                        );
                    } else {
                        Logger.error(
                            `Failed to get results metadata from s3. ${getErrorMessage(
                                error,
                            )}`,
                        );
                    }

                    Sentry.captureException(
                        new S3Error(
                            `Failed to get results metadata from s3. ${getErrorMessage(
                                error,
                            )}`,
                            {
                                key,
                            },
                        ),
                    );

                    throw error;
                }
            },
        );
    }

    async getResults(key: string, extension: string = 'json') {
        return wrapSentryTransaction('s3.getResults', { key }, async (span) => {
            if (!this.configuration || !this.s3) {
                throw new MissingConfigError('S3 configuration is not set');
            }

            try {
                const command = new GetObjectCommand({
                    Bucket: this.configuration.bucket,
                    Key: `${key}.${extension}`,
                });
                return await this.s3.send(command);
            } catch (error) {
                if (error instanceof S3ServiceException) {
                    Logger.error(
                        `Failed to get results from s3. ${error.name} - ${error.message}`,
                    );
                } else {
                    Logger.error(
                        `Failed to get results from s3. ${getErrorMessage(
                            error,
                        )}`,
                    );
                }

                Sentry.captureException(
                    new S3Error(
                        `Failed to get results from s3. ${getErrorMessage(
                            error,
                        )}`,
                        {
                            key,
                        },
                    ),
                );

                throw error;
            }
        });
    }
}
