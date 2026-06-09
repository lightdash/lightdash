import { type LightdashConfig } from '../../../config/parseConfig';

export type DuckdbRuntimeConfig = {
    endpoint: string;
    region?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle: boolean;
    useSsl: boolean;
    scope?: string;
};

export const getPreAggregateStoragePrefix = ({
    organizationUuid,
    projectUuid,
}: {
    organizationUuid: string;
    projectUuid: string;
}): string => `pre-aggregates/${organizationUuid}/${projectUuid}/`;

export const getPreAggregateStorageScope = ({
    bucket,
    organizationUuid,
    projectUuid,
}: {
    bucket: string;
    organizationUuid: string;
    projectUuid: string;
}): string =>
    `s3://${bucket}/${getPreAggregateStoragePrefix({
        organizationUuid,
        projectUuid,
    })}`;

export const isPreAggregateUriInScope = ({
    uri,
    bucket,
    organizationUuid,
    projectUuid,
}: {
    uri: string;
    bucket: string;
    organizationUuid: string;
    projectUuid: string;
}): boolean =>
    uri.startsWith(
        getPreAggregateStorageScope({
            bucket,
            organizationUuid,
            projectUuid,
        }),
    );

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
    s3Config: LightdashConfig['preAggregates']['s3'],
    options?: {
        scope?: string;
    },
): DuckdbRuntimeConfig | undefined => {
    if (!s3Config) {
        return undefined;
    }

    const { endpoint, useSsl } = parseDuckdbS3Endpoint(s3Config.endpoint);

    return {
        endpoint,
        region: s3Config.region,
        accessKey: s3Config.accessKey,
        secretKey: s3Config.secretKey,
        forcePathStyle: s3Config.forcePathStyle === true,
        useSsl,
        scope: options?.scope,
    };
};
