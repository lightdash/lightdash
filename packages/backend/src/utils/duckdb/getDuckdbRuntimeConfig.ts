import { assertUnreachable } from '@lightdash/common';
import { type DuckdbS3SessionConfig } from '@lightdash/warehouses';
import { getGcpAccessToken } from '../../clients/Aws/gcpOAuth';
import { type S3Config } from '../../config/parseConfig';

export type DuckdbRuntimeConfig = DuckdbS3SessionConfig;

const parseDuckdbS3Endpoint = (
    endpoint: string,
): Pick<DuckdbRuntimeConfig, 'endpoint' | 'useSsl'> => {
    const trimmedEndpoint = endpoint.trim();

    try {
        const parsedEndpoint = new URL(trimmedEndpoint);
        if (
            parsedEndpoint.protocol === 'http:' ||
            parsedEndpoint.protocol === 'https:'
        ) {
            return {
                endpoint: parsedEndpoint.host,
                useSsl: parsedEndpoint.protocol === 'https:',
            };
        }
    } catch {
        // Endpoint is not a full URL; treat it as host[:port] and default SSL on.
    }

    return {
        endpoint: trimmedEndpoint.replace(/\/+$/, ''),
        useSsl: true,
    };
};

export const getDuckdbRuntimeConfig = (
    s3Config: Omit<S3Config, 'expirationTime'> | undefined,
): DuckdbRuntimeConfig | undefined => {
    if (!s3Config) {
        return undefined;
    }

    const { endpoint, useSsl } = parseDuckdbS3Endpoint(s3Config.endpoint);

    const runtimeConfig = {
        endpoint,
        region: s3Config.region,
        accessKey: s3Config.accessKey,
        secretKey: s3Config.secretKey,
        forcePathStyle: s3Config.forcePathStyle === true,
        useSsl,
    };

    switch (s3Config.authMode) {
        case 'gcp_oauth':
            return {
                ...runtimeConfig,
                authMode: 'gcp_oauth',
                getAccessToken: getGcpAccessToken,
                scope: [`s3://${s3Config.bucket}/`],
            };
        case 'default':
        case undefined:
            return runtimeConfig;
        default:
            return assertUnreachable(
                s3Config.authMode,
                'Unsupported DuckDB storage auth mode',
            );
    }
};
