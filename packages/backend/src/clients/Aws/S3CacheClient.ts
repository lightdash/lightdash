import {
    GetObjectCommand,
    HeadObjectCommand,
    NotFound,
    PutObjectCommand,
    PutObjectCommandInput,
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
import { S3BaseClient } from './S3BaseClient';

export type S3CacheClientArguments = {
    lightdashConfig: LightdashConfig;
};

export class S3CacheClient extends S3BaseClient {
    configuration: LightdashConfig['results']['s3'];

    constructor({ lightdashConfig }: S3CacheClientArguments) {
        super(lightdashConfig.results.s3);
        this.configuration = lightdashConfig.results.s3;

        if (this.s3) {
            Logger.debug('Initialized S3 results cache client');
        }
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
