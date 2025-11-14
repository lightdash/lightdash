import { type S3ClientConfig } from '@aws-sdk/client-s3';
import {
    createCredentialChain,
    fromContainerMetadata,
    fromEnv,
    fromIni,
    fromInstanceMetadata,
    fromTokenFile,
} from '@aws-sdk/credential-providers';
import Logger from '../../logging/logger';

export type BuildS3CredentialsOptions = {
    /** Ordered list of credential sources, usually from env S3_USE_CREDENTIALS_FROM */
    useCredentialsFrom?: string[];
    /** Text used in logs to identify which S3 client is being configured */
    logPrefix: string;
};

/**
 * Builds an AWS credentials provider chain based on the provided list of sources.
 * - When the list contains valid entries, returns an explicit credential chain and logs the order.
 * - When the list is missing or invalid, returns undefined and logs that the default AWS SDK resolution will be used.
 */
export const buildS3CredentialsProvider = (
    options: BuildS3CredentialsOptions,
): S3ClientConfig['credentials'] | undefined => {
    const { useCredentialsFrom, logPrefix } = options;

    const providerLabels: string[] = [];
    const providers: Array<ReturnType<typeof fromEnv>> = [];

    if (useCredentialsFrom && useCredentialsFrom.length > 0) {
        for (const srcRaw of useCredentialsFrom) {
            const src = srcRaw.toLowerCase();
            switch (src) {
                case 'env':
                    providers.push(fromEnv());
                    providerLabels.push('env');
                    break;
                case 'token_file':
                case 'tokenfile':
                    providers.push(fromTokenFile());
                    providerLabels.push('token_file');
                    break;
                case 'ini':
                case 'init': // support common typo
                    providers.push(fromIni());
                    providerLabels.push('ini');
                    break;
                case 'container_metadata':
                case 'ecs':
                    providers.push(fromContainerMetadata());
                    providerLabels.push('container_metadata');
                    break;
                case 'instance_metadata':
                case 'ec2':
                    providers.push(fromInstanceMetadata());
                    providerLabels.push('instance_metadata');
                    break;
                default:
                    Logger.warn(
                        `S3_USE_CREDENTIALS_FROM includes unknown source: ${srcRaw} - ignoring`,
                    );
            }
        }
    }

    if (providers.length > 0) {
        Logger.debug(
            `Using ${logPrefix} with IAM role credentials (credential chain): ${providerLabels.join(
                ' -> ',
            )}`,
        );
        return createCredentialChain(...providers);
    }

    Logger.debug(
        `Using ${logPrefix} with default AWS SDK credential resolution (no explicit chain); set S3_USE_CREDENTIALS_FROM to customize`,
    );
    return undefined;
};
