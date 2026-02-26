import { type LightdashConfig } from '../../config/parseConfig';

export type DuckdbRuntimeConfig = {
    endpoint: string;
    region?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle: boolean;
    useSsl: boolean;
};

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
    lightdashConfig: Pick<LightdashConfig, 'results'>,
): DuckdbRuntimeConfig | undefined => {
    const resultsS3Config = lightdashConfig.results.s3;

    if (!resultsS3Config) {
        return undefined;
    }

    const { endpoint, useSsl } = parseDuckdbS3Endpoint(
        resultsS3Config.endpoint,
    );

    return {
        endpoint,
        region: resultsS3Config.region,
        accessKey: resultsS3Config.accessKey,
        secretKey: resultsS3Config.secretKey,
        forcePathStyle: resultsS3Config.forcePathStyle === true,
        useSsl,
    };
};
