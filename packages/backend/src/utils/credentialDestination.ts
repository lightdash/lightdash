import {
    assertUnreachable,
    DbtProjectType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DbtProjectConfig,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { normalizeDatabricksHostLenient } from '../controllers/authentication/strategies/databricksStrategy';

export const DEFAULT_DBT_CLOUD_DISCOVERY_ENDPOINT =
    'https://metadata.cloud.getdbt.com/graphql';
export const DEFAULT_GITHUB_HOST_DOMAIN = 'github.com';
export const DEFAULT_GITLAB_HOST_DOMAIN = 'gitlab.com';
export const DEFAULT_BITBUCKET_HOST_DOMAIN = 'bitbucket.org';

export const normalizeCredentialHost = (host: string | undefined): string =>
    host?.trim().toLowerCase().replace(/\.$/, '') ?? '';

const normalizeUrl = (value: string): URL | undefined => {
    try {
        const url = new URL(value);
        url.hostname = normalizeCredentialHost(url.hostname);
        return url;
    } catch {
        return undefined;
    }
};

export const normalizeCredentialUrlOrigin = (value: string): string =>
    normalizeUrl(value)?.origin.toLowerCase() ?? value.trim().toLowerCase();

const normalizeCredentialBaseUrl = (value: string | undefined): string => {
    if (!value?.trim()) {
        return '';
    }
    return normalizeUrl(value)?.href ?? value.trim();
};

const normalizeStorageUri = (value: string): string =>
    normalizeUrl(value)?.href ?? value.trim();

const getDbtCredentialDestination = (config: DbtProjectConfig): unknown[] => {
    switch (config.type) {
        case DbtProjectType.DBT_CLOUD_IDE:
            return [
                normalizeCredentialUrlOrigin(
                    config.discovery_api_endpoint ||
                        DEFAULT_DBT_CLOUD_DISCOVERY_ENDPOINT,
                ),
            ];
        case DbtProjectType.GITHUB:
            return [
                normalizeCredentialHost(
                    config.host_domain || DEFAULT_GITHUB_HOST_DOMAIN,
                ),
            ];
        case DbtProjectType.GITLAB:
            return [
                normalizeCredentialHost(
                    config.host_domain || DEFAULT_GITLAB_HOST_DOMAIN,
                ),
            ];
        case DbtProjectType.BITBUCKET:
            return [
                normalizeCredentialHost(
                    config.host_domain || DEFAULT_BITBUCKET_HOST_DOMAIN,
                ),
            ];
        case DbtProjectType.AZURE_DEVOPS:
        case DbtProjectType.DBT:
        case DbtProjectType.NONE:
        case DbtProjectType.MANIFEST:
            return [];
        default:
            return assertUnreachable(config, 'Unknown dbt project type');
    }
};

export const hasSameDbtCredentialDestination = (
    incompleteConfig: DbtProjectConfig,
    completeConfig: DbtProjectConfig,
): boolean =>
    incompleteConfig.type === completeConfig.type &&
    isEqual(
        getDbtCredentialDestination(incompleteConfig),
        getDbtCredentialDestination(completeConfig),
    );

const getSshTunnelDestination = (credentials: {
    useSshTunnel?: boolean;
    sshTunnelHost?: string;
    sshTunnelPort?: number;
}): unknown[] =>
    credentials.useSshTunnel
        ? [
              true,
              normalizeCredentialHost(credentials.sshTunnelHost),
              credentials.sshTunnelPort ?? 22,
          ]
        : [false];

const getDucklakeCatalogDestination = (
    credentials: Extract<
        CreateWarehouseCredentials,
        { type: WarehouseTypes.DUCKDB }
    > & { connectionType: DuckdbConnectionType.DUCKLAKE },
): unknown[] => {
    switch (credentials.catalog.type) {
        case DucklakeCatalogType.POSTGRES:
            return [
                credentials.catalog.type,
                normalizeCredentialHost(credentials.catalog.host),
                credentials.catalog.port,
            ];
        case DucklakeCatalogType.SQLITE:
        case DucklakeCatalogType.DUCKDB:
            return [credentials.catalog.type];
        default:
            return assertUnreachable(
                credentials.catalog,
                'Unknown DuckLake catalog type',
            );
    }
};

const getDucklakeDataPathDestination = (
    credentials: Extract<
        CreateWarehouseCredentials,
        { type: WarehouseTypes.DUCKDB }
    > & { connectionType: DuckdbConnectionType.DUCKLAKE },
): unknown[] => {
    switch (credentials.dataPath.type) {
        case DucklakeDataPathType.S3:
            return [
                credentials.dataPath.type,
                normalizeStorageUri(credentials.dataPath.url),
                normalizeCredentialBaseUrl(credentials.dataPath.endpoint),
                normalizeCredentialHost(credentials.dataPath.region),
                credentials.dataPath.forcePathStyle,
                credentials.dataPath.useSsl,
            ];
        case DucklakeDataPathType.GCS:
            return [
                credentials.dataPath.type,
                normalizeStorageUri(credentials.dataPath.url),
            ];
        case DucklakeDataPathType.AZURE:
            return [
                credentials.dataPath.type,
                normalizeStorageUri(credentials.dataPath.url),
                normalizeCredentialHost(credentials.dataPath.accountName),
            ];
        case DucklakeDataPathType.LOCAL:
            return [credentials.dataPath.type];
        default:
            return assertUnreachable(
                credentials.dataPath,
                'Unknown DuckLake data path type',
            );
    }
};

const getWarehouseCredentialDestination = (
    config: CreateWarehouseCredentials,
): unknown[] => {
    switch (config.type) {
        case WarehouseTypes.BIGQUERY:
            return [normalizeCredentialBaseUrl(config.accessUrl)];
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
            return [
                normalizeCredentialHost(config.host),
                config.port,
                ...getSshTunnelDestination(config),
            ];
        case WarehouseTypes.SNOWFLAKE:
            return [
                normalizeCredentialHost(config.account),
                normalizeCredentialBaseUrl(config.accessUrl),
            ];
        case WarehouseTypes.DATABRICKS:
            return [normalizeDatabricksHostLenient(config.serverHostName)];
        case WarehouseTypes.TRINO:
            return [
                normalizeCredentialHost(config.host),
                config.port,
                config.http_scheme.toLowerCase(),
            ];
        case WarehouseTypes.CLICKHOUSE:
            return [
                normalizeCredentialHost(config.host),
                config.port,
                config.secure ?? false,
            ];
        case WarehouseTypes.ATHENA:
            return [normalizeCredentialHost(config.region)];
        case WarehouseTypes.DUCKDB:
            if (config.connectionType === DuckdbConnectionType.DUCKLAKE) {
                return [
                    config.connectionType,
                    getDucklakeCatalogDestination(config),
                    getDucklakeDataPathDestination(config),
                ];
            }
            return [config.connectionType];
        default:
            return assertUnreachable(config, 'Unknown warehouse type');
    }
};

export const hasSameWarehouseCredentialDestination = (
    incompleteConfig: CreateWarehouseCredentials,
    completeConfig: CreateWarehouseCredentials,
): boolean =>
    incompleteConfig.type === completeConfig.type &&
    isEqual(
        getWarehouseCredentialDestination(incompleteConfig),
        getWarehouseCredentialDestination(completeConfig),
    );
