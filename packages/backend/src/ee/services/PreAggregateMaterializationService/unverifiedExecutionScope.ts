import {
    assertUnreachable,
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateDuckdbDucklakeCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { createHmac } from 'crypto';
import {
    getWarehouseCompatibilityContext,
    hashPreAggregateCompatibility,
} from './preAggregatePreparation';

export type UnverifiedExecutionScope =
    | { status: 'proven'; hash: string }
    | { status: 'unavailable' };

// DuckLake can fall back to ambient object-store credentials. Only explicit
// secrets or a local data path establish a generation-local execution proof.
const hasExplicitDucklakeAuthentication = (
    credentials: CreateDuckdbDucklakeCredentials,
): boolean => {
    const { catalog, dataPath } = credentials;
    let hasCatalogIdentity: boolean;
    switch (catalog.type) {
        case DucklakeCatalogType.POSTGRES:
            hasCatalogIdentity = Boolean(
                catalog.host && catalog.database && catalog.user,
            );
            break;
        case DucklakeCatalogType.SQLITE:
        case DucklakeCatalogType.DUCKDB:
            hasCatalogIdentity = Boolean(catalog.path);
            break;
        default:
            return assertUnreachable(catalog, 'Unknown DuckLake catalog');
    }
    if (!hasCatalogIdentity) return false;
    switch (dataPath.type) {
        case DucklakeDataPathType.S3:
            return Boolean(dataPath.accessKeyId && dataPath.secretAccessKey);
        case DucklakeDataPathType.GCS:
            return Boolean(dataPath.hmacKeyId && dataPath.hmacSecret);
        case DucklakeDataPathType.AZURE:
            return Boolean(
                dataPath.connectionString ||
                (dataPath.accountName && dataPath.accountKey),
            );
        case DucklakeDataPathType.LOCAL:
            return Boolean(dataPath.path);
        default:
            return assertUnreachable(dataPath, 'Unknown DuckLake data path');
    }
};

const hasExplicitActiveAuthentication = (
    credentials: CreateWarehouseCredentials,
): boolean => {
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            // ADC ignores keyfileContents. Only an actual authorized-user
            // refresh credential establishes an opaque identity here.
            return (
                credentials.authenticationType ===
                    BigqueryAuthenticationType.SSO &&
                credentials.keyfileContents.type === 'authorized_user' &&
                Boolean(
                    credentials.keyfileContents.client_id &&
                    credentials.keyfileContents.client_secret &&
                    credentials.keyfileContents.refresh_token,
                )
            );
        case WarehouseTypes.DATABRICKS: {
            const authenticationType =
                credentials.authenticationType ??
                DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN;
            switch (authenticationType) {
                case DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN:
                    return Boolean(credentials.personalAccessToken);
                case DatabricksAuthenticationType.OAUTH_U2M:
                    return Boolean(
                        credentials.refreshToken || credentials.token,
                    );
                case DatabricksAuthenticationType.OAUTH_M2M:
                    return Boolean(credentials.token);
                default:
                    return assertUnreachable(
                        authenticationType,
                        'Unknown Databricks authentication',
                    );
            }
        }
        case WarehouseTypes.ATHENA:
            return (
                (credentials.authenticationType ??
                    AthenaAuthenticationType.ACCESS_KEY) ===
                    AthenaAuthenticationType.ACCESS_KEY &&
                Boolean(credentials.accessKeyId && credentials.secretAccessKey)
            );
        case WarehouseTypes.REDSHIFT:
            return (
                (credentials.authenticationType ===
                    RedshiftAuthenticationType.IAM ||
                    credentials.authenticationType ===
                        RedshiftAuthenticationType.IAM_BROWSER) &&
                Boolean(credentials.accessKeyId && credentials.secretAccessKey)
            );
        case WarehouseTypes.DUCKDB:
            switch (credentials.connectionType) {
                case DuckdbConnectionType.MOTHERDUCK:
                    return Boolean(credentials.token);
                case DuckdbConnectionType.DUCKLAKE:
                    return hasExplicitDucklakeAuthentication(credentials);
                case DuckdbConnectionType.EMBEDDED:
                case DuckdbConnectionType.ANALYTICS:
                    return false;
                default:
                    return assertUnreachable(
                        credentials,
                        'Unknown DuckDB connection',
                    );
            }
        case WarehouseTypes.SNOWFLAKE:
            return (
                credentials.authenticationType ===
                    SnowflakeAuthenticationType.SSO &&
                Boolean(credentials.refreshToken || credentials.token)
            );
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.CLICKHOUSE:
            return false;
        default:
            return assertUnreachable(credentials, 'Unknown warehouse');
    }
};

const getExecutionCredentialSnapshot = (
    credentials: CreateWarehouseCredentials,
) => {
    if (
        credentials.type === WarehouseTypes.DATABRICKS &&
        credentials.authenticationType ===
            DatabricksAuthenticationType.OAUTH_U2M
    ) {
        // OAuth ignores a leftover PAT. An access token minted from the same
        // refresh grant retains its principal; compare the grant when present.
        const { personalAccessToken: _unusedPat, ...oauthCredentials } =
            credentials;
        if (credentials.refreshToken) {
            const { token: _rotatingAccessToken, ...refreshCredentials } =
                oauthCredentials;
            return refreshCredentials;
        }
        return oauthCredentials;
    }
    if (
        credentials.type === WarehouseTypes.BIGQUERY &&
        credentials.authenticationType === BigqueryAuthenticationType.SSO
    ) {
        const { access_token: _unusedAccessToken, ...refreshCredentials } =
            credentials.keyfileContents;
        return { ...credentials, keyfileContents: refreshCredentials };
    }
    if (
        credentials.type === WarehouseTypes.SNOWFLAKE &&
        credentials.authenticationType === SnowflakeAuthenticationType.SSO &&
        credentials.refreshToken
    ) {
        // Access tokens minted from the same refresh grant are interchangeable.
        const { token: _rotatingAccessToken, ...refreshCredentials } =
            credentials;
        return refreshCredentials;
    }
    return credentials;
};

/** A generation-local proof, never a semantic compatibility fingerprint.
 * Opaque credentials cannot prove rotation preserves the principal. Bind their
 * exact resolved snapshot to the actor and selected credential source instead.
 * Raw credentials stay in memory; the only returned value is a keyed digest. */
export const deriveUnverifiedExecutionScope = ({
    warehouseCredentials,
    actorId,
    credentialSourceId,
    secret,
}: {
    warehouseCredentials: CreateWarehouseCredentials;
    actorId: string;
    credentialSourceId: string;
    secret: string;
}): UnverifiedExecutionScope => {
    if (
        !actorId ||
        !credentialSourceId ||
        !secret ||
        getWarehouseCompatibilityContext(warehouseCredentials).verified ||
        !hasExplicitActiveAuthentication(warehouseCredentials)
    ) {
        return { status: 'unavailable' };
    }

    // Include the complete resolved snapshot: unknown auth may consume session
    // credentials or connection settings that a semantic allowlist omits.
    const snapshotHash = hashPreAggregateCompatibility({
        domain: 'lightdash.preaggregate.unverified-execution.v1',
        actorId,
        credentialSourceId,
        warehouseCredentials:
            getExecutionCredentialSnapshot(warehouseCredentials),
    });
    return {
        status: 'proven',
        hash: createHmac('sha256', secret).update(snapshotHash).digest('hex'),
    };
};

/** Retain existing refresh support when an adapter cannot expose its ambient
 * principal. This binds only the configured connection and actor, not the
 * ambient identity. Callers must keep compatibility null and serving/promotion
 * restricted to this publication; this can never establish deployment reuse. */
export const deriveLegacyExecutionScope = ({
    warehouseCredentials,
    actorId,
    credentialSourceId,
    secret,
}: {
    warehouseCredentials: CreateWarehouseCredentials;
    actorId: string;
    credentialSourceId: string;
    secret: string;
}): string =>
    createHmac('sha256', secret)
        .update(
            hashPreAggregateCompatibility({
                domain: 'lightdash.preaggregate.legacy-configuration.v1',
                actorId,
                credentialSourceId,
                warehouseCredentials,
            }),
        )
        .digest('hex');
