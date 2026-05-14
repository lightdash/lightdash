import { S3, type S3ClientConfig } from '@aws-sdk/client-s3';
import {
    createCredentialChain,
    fromContainerMetadata,
    fromEnv,
    fromIni,
    fromInstanceMetadata,
    fromTokenFile,
} from '@aws-sdk/credential-providers';
import Logger from '../../logging/logger';

export type S3BaseConfiguration =
    | {
          region?: string;
          endpoint?: string;
          forcePathStyle?: boolean;
          accessKey?: string;
          secretKey?: string;
          expirationTime?: number;
          /**
           * Ordered list of credential sources to use for AWS SDK credential resolution.
           * If undefined or empty, do NOT set explicit credentials so the SDK default
           * resolution is used. When provided with valid entries, an explicit chain is
           * built in the given order.
           */
          useCredentialsFrom?: string[];
      }
    | undefined;

/**
 * Resolves S3 credentials from explicit keys, a credential chain, or SDK defaults.
 * Returns the credentials property to assign to an S3ClientConfig, or undefined
 * to let the SDK use its default resolution.
 */
export function resolveS3Credentials(config: {
    accessKey?: string;
    secretKey?: string;
    useCredentialsFrom?: string[];
}): S3ClientConfig['credentials'] | undefined {
    if (config.accessKey && config.secretKey) {
        Logger.debug('Using S3 storage with access key credentials');
        return {
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretKey,
        };
    }

    const requestedSources = config.useCredentialsFrom;
    const providerLabels: string[] = [];
    const providers: Array<ReturnType<typeof fromEnv>> = [];

    if (requestedSources && requestedSources.length > 0) {
        for (const srcRaw of requestedSources) {
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
            `Using S3 storage with IAM role credentials (credential chain): ${providerLabels.join(
                ' -> ',
            )}`,
        );
        return createCredentialChain(...providers);
    }

    // Do not set credentials to preserve default AWS SDK resolution
    Logger.debug(
        'Using S3 storage with default AWS SDK credential resolution (no explicit chain); set S3_USE_CREDENTIALS_FROM to customize',
    );
    return undefined;
}

/**
 * Base class that sets up the AWS S3 client and handles credentials logic.
 * - If explicit accessKey/secretKey are provided, uses them.
 * - Else, if useCredentialsFrom is provided and has valid entries, builds an explicit credential chain in that order.
 * - Else, leaves credentials unset so the AWS SDK default resolution is used.
 */
export class S3BaseClient {
    protected readonly s3: S3 | undefined;

    constructor(configuration: S3BaseConfiguration) {
        if (
            !configuration ||
            !configuration.endpoint ||
            !configuration.region
        ) {
            // Not configured; leave s3 undefined
            Logger.debug('Missing S3 bucket configuration');
            return;
        }

        const { endpoint, region, forcePathStyle } = configuration;

        const s3Config: S3ClientConfig = {
            region,
            apiVersion: '2006-03-01',
            endpoint,
            forcePathStyle,
        };

        const credentials = resolveS3Credentials(configuration);
        if (credentials) {
            s3Config.credentials = credentials;
        }

        this.s3 = new S3(s3Config);
    }
}
