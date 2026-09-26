import { S3, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import {
    createCredentialChain,
    fromContainerMetadata,
    fromEnv,
    fromHttp,
    fromIni,
    fromInstanceMetadata,
    fromTokenFile,
} from '@aws-sdk/credential-providers';
import Logger from '../../logging/logger';
import { applyGcpOAuth } from './gcpOAuth';
import { createObjectUrlSigner, type ObjectUrlSigner } from './ObjectUrlSigner';

/**
 * Selects how Lightdash authenticates requests to the object store.
 *
 * - `default`: sign requests with SigV4 and AWS credentials. Use this value
 *   for S3, RustFS, and GCS HMAC keys.
 * - `gcp_oauth`: send a Google OAuth bearer token. Use this value to reach GCS
 *   from a workload identity service account, which needs no static keys.
 *
 * This setting is not a credential source like `useCredentialsFrom`. It
 * replaces the signing algorithm.
 */
export type S3AuthMode = 'default' | 'gcp_oauth';

export type S3BaseConfiguration =
    | {
          region?: string;
          endpoint?: string;
          forcePathStyle?: boolean;
          accessKey?: string;
          secretKey?: string;
          expirationTime?: number;
          authMode?: S3AuthMode;
          /**
           * Ordered list of credential sources to use for AWS SDK credential resolution.
           * If undefined or empty, do NOT set explicit credentials so the SDK default
           * resolution is used. When provided with valid entries, an explicit chain is
           * built in the given order.
           */
          useCredentialsFrom?: string[];
      }
    | undefined;

/** Connection settings every S3 client in the backend is built from. */
export type S3ConnectionConfig = {
    region?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    accessKey?: string;
    secretKey?: string;
    authMode?: S3AuthMode;
    useCredentialsFrom?: string[];
};

/**
 * Resolves S3 credentials from explicit keys, a credential chain, or SDK defaults.
 * Returns the credentials property to assign to an S3ClientConfig, or undefined
 * to let the SDK use its default resolution.
 */
export function resolveS3Credentials(
    config: Pick<
        S3ConnectionConfig,
        'accessKey' | 'secretKey' | 'useCredentialsFrom'
    >,
): S3ClientConfig['credentials'] | undefined {
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
                    // Mirror the SDK's default remoteProvider: fromHttp supports the
                    // EKS Pod Identity endpoint, which fromContainerMetadata rejects.
                    // Gated on the env vars because fromHttp throws at construction
                    // when neither is set.
                    if (
                        process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
                        process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI
                    ) {
                        providers.push(fromHttp({}));
                        providerLabels.push('container_http');
                    }
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

export function buildS3ClientConfig(
    config: S3ConnectionConfig,
): S3ClientConfig {
    const clientConfig: S3ClientConfig = {
        region: config.region,
        endpoint: config.endpoint || undefined,
        forcePathStyle: config.forcePathStyle ?? false,
    };

    if (config.authMode === 'gcp_oauth') {
        if (config.accessKey && config.secretKey) {
            Logger.warn(
                'S3_AUTH_MODE is gcp_oauth but access key credentials are also set. The keys are ignored for request signing; unset S3_ACCESS_KEY and S3_SECRET_KEY',
            );
        }
        // The SDK resolves an identity even when it does not sign the
        // request, and it searches for AWS credentials when the caller sets
        // none. The SDK never uses these placeholder values.
        clientConfig.credentials = {
            accessKeyId: 'gcp-oauth',
            secretAccessKey: 'gcp-oauth',
        };
        // Returning the request unchanged stops SigV4 from running. The
        // bearer token that applyGcpOAuth adds is then the only
        // authentication on the request.
        clientConfig.signer = { sign: async (request) => request };
        // GCS accepts the SDK's checksum headers and then ignores them.
        // Calculating the checksums reads the whole payload and protects
        // nothing.
        clientConfig.requestChecksumCalculation = 'WHEN_REQUIRED';
        clientConfig.responseChecksumValidation = 'WHEN_REQUIRED';
        return clientConfig;
    }

    const credentials = resolveS3Credentials(config);
    if (credentials) {
        clientConfig.credentials = credentials;
    }

    return clientConfig;
}

/**
 * Constructs every S3 SDK client in the backend. Some authentication modes
 * need more than configuration. For example, `gcp_oauth` needs a middleware.
 * Routing every client through this function stops a new call site from
 * omitting that step.
 */
function createClient<TClient extends S3 | S3Client>(
    config: S3ConnectionConfig,
    construct: (clientConfig: S3ClientConfig) => TClient,
): TClient {
    const client = construct(buildS3ClientConfig(config));

    if (config.authMode === 'gcp_oauth') {
        applyGcpOAuth(client);
    }

    return client;
}

/**
 * Builds an S3 client for a bucket configuration. Callers that read and write
 * the same bucket must share this, or one can authenticate where another can't.
 */
export function createS3ClientFromConfig(config: S3ConnectionConfig): S3Client {
    return createClient(config, (clientConfig) => new S3Client(clientConfig));
}

/**
 * Base class that sets up the AWS S3 client and handles credentials logic.
 * - If explicit accessKey/secretKey are provided, uses them.
 * - Else, if useCredentialsFrom is provided and has valid entries, builds an explicit credential chain in that order.
 * - Else, leaves credentials unset so the AWS SDK default resolution is used.
 */
export class S3BaseClient {
    protected readonly s3: S3 | undefined;

    /** Undefined when `s3` is undefined, which happens when no bucket is configured. */
    protected readonly urlSigner: ObjectUrlSigner | undefined;

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

        this.s3 = createClient(
            configuration,
            (clientConfig) =>
                new S3({
                    ...clientConfig,
                    apiVersion: '2006-03-01',
                }),
        );
        this.urlSigner = createObjectUrlSigner(this.s3, configuration);
    }
}
