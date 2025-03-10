import {
    GetObjectCommand,
    HeadObjectCommand,
    NotFound,
    PutObjectCommand,
    PutObjectCommandInput,
    S3,
    S3ServiceException,
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

type S3CacheClientArguments = {
    lightdashConfig: LightdashConfig;
};

export class S3CacheClient {
    configuration: LightdashConfig['resultsCache']['s3'];

    private readonly s3?: S3;

    constructor({ lightdashConfig }: S3CacheClientArguments) {
        const endpoint = lightdashConfig.s3?.endpoint;
        this.configuration = lightdashConfig.resultsCache.s3;
        const { region, accessKey, secretKey } = this.configuration;

        if (endpoint && region) {
            const s3Config = {
                endpoint,
                region,
                apiVersion: '2006-03-01',
            };

            if (accessKey && secretKey) {
                Object.assign(s3Config, {
                    credentials: {
                        accessKeyId: accessKey,
                        secretAccessKey: secretKey,
                    },
                });
                Logger.debug(
                    'Using results cache S3 storage with access key credentials',
                );
            } else {
                Logger.debug(
                    'Using results cache S3 storage with IAM role credentials',
                );
            }

            this.s3 = new S3(s3Config);
        } else {
            Logger.debug('Missing results cache S3 bucket configuration');
        }
    }

    isEnabled(): boolean {
        return this.s3 !== undefined;
    }

    async uploadResults(
        key: string,
        results: PutObjectCommandInput['Body'],
        metadata: PutObjectCommandInput['Metadata'],
    ) {
        return wrapSentryTransaction('s3.uploadResults', { key }, async () => {
            if (!this.configuration.bucket || this.s3 === undefined) {
                throw new Error(
                    "Results caching is not enabled or is missing S3 configuration, can't upload results cache",
                );
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
                if (
                    this.configuration.bucket === undefined ||
                    this.s3 === undefined
                ) {
                    throw new MissingConfigError(
                        "Results caching is not enabled or is missing S3 configuration, can't get results cache metadata",
                    );
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

    async getResults(key: string) {
        return wrapSentryTransaction('s3.getResults', { key }, async (span) => {
            if (
                this.configuration.bucket === undefined ||
                this.s3 === undefined
            ) {
                throw new MissingConfigError(
                    "Results caching is not enabled or is missing S3 configuration, can't get results cache",
                );
            }
            try {
                const command = new GetObjectCommand({
                    Bucket: this.configuration.bucket,
                    Key: `${key}.json`,
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
