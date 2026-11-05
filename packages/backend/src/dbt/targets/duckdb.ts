import {
    AnyType,
    assertUnreachable,
    CreateWarehouseCredentials,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    ParameterError,
    WarehouseTypes,
} from '@lightdash/common';
import type {
    DbtTargetPolicy,
    DbtTargetResult,
} from '../../services/WarehouseClientFactory/CredentialResolver';
import {
    ambientIdentityTarget,
    DEFAULT_THREADS,
    envVar,
    envVarReference,
} from './helpers';

export const duckdbTarget = (
    credentials: Extract<
        CreateWarehouseCredentials,
        { type: WarehouseTypes.DUCKDB }
    >,
    policy: DbtTargetPolicy,
): DbtTargetResult => {
    if (
        policy.explicitCredentials &&
        credentials.connectionType === DuckdbConnectionType.DUCKLAKE
    ) {
        const data = credentials.dataPath;
        switch (data.type) {
            case DucklakeDataPathType.S3:
                if (!(data.accessKeyId && data.secretAccessKey))
                    return ambientIdentityTarget('DuckLake S3');
                break;
            case DucklakeDataPathType.GCS:
                if (!(data.hmacKeyId && data.hmacSecret))
                    return ambientIdentityTarget('DuckLake GCS');
                break;
            case DucklakeDataPathType.AZURE:
                if (
                    !(
                        data.connectionString ||
                        (data.accountName && data.accountKey)
                    )
                )
                    return ambientIdentityTarget('DuckLake Azure');
                break;
            case DucklakeDataPathType.LOCAL:
                break;
            default:
                return assertUnreachable(
                    data,
                    'Unknown DuckLake data path type',
                );
        }
    }
    if (credentials.connectionType === DuckdbConnectionType.MOTHERDUCK) {
        return {
            kind: 'target',
            target: {
                type: 'duckdb',
                path: `md:${credentials.database}`,
                schema: credentials.schema,
                threads: credentials.threads || DEFAULT_THREADS,
                extensions: ['motherduck'],
                settings: {
                    motherduck_token: envVarReference('token'),
                },
            },
            environment: {
                [envVar('token')]: credentials.token,
            },
        };
    }
    if (
        credentials.connectionType === DuckdbConnectionType.EMBEDDED ||
        credentials.connectionType === DuckdbConnectionType.ANALYTICS
    ) {
        throw new ParameterError(
            'Embedded DuckDB credentials cannot be used for dbt compilation',
        );
    }
    const alias = credentials.catalogAlias ?? 'ducklake';
    const extensions: string[] = ['ducklake'];
    const environment: Record<string, string> = {};
    const secrets: Record<string, AnyType>[] = [];
    const CATALOG_SECRET = 'ld_ducklake_catalog';
    const DATA_SECRET = 'ld_ducklake_data';
    const DUCKLAKE_SECRET = 'ld_ducklake';

    let catalogIsPostgres = false;
    let inlineCatalogPath: string | null = null;
    switch (credentials.catalog.type) {
        case DucklakeCatalogType.POSTGRES: {
            extensions.push('postgres');
            catalogIsPostgres = true;
            environment[envVar('catalog_user')] = credentials.catalog.user;
            environment[envVar('catalog_password')] =
                credentials.catalog.password;
            secrets.push({
                name: CATALOG_SECRET,
                type: 'postgres',
                host: credentials.catalog.host,
                port: credentials.catalog.port,
                database: credentials.catalog.database,
                user: envVarReference('catalog_user'),
                password: envVarReference('catalog_password'),
            });
            break;
        }
        case DucklakeCatalogType.SQLITE:
            extensions.push('sqlite');
            inlineCatalogPath = `ducklake:sqlite:${credentials.catalog.path}`;
            break;
        case DucklakeCatalogType.DUCKDB:
            inlineCatalogPath = `ducklake:${credentials.catalog.path}`;
            break;
        default:
            return assertUnreachable(
                credentials.catalog,
                'Unknown DuckLake catalog type',
            );
    }

    let dataPathValue: string;
    switch (credentials.dataPath.type) {
        case DucklakeDataPathType.S3: {
            extensions.push('httpfs');
            dataPathValue = credentials.dataPath.url;
            const s3: Record<string, AnyType> = {
                name: DATA_SECRET,
                type: 's3',
                scope: credentials.dataPath.url,
            };
            if (credentials.dataPath.region)
                s3.region = credentials.dataPath.region;
            if (credentials.dataPath.endpoint)
                s3.endpoint = credentials.dataPath.endpoint;
            if (credentials.dataPath.forcePathStyle !== undefined)
                s3.url_style = credentials.dataPath.forcePathStyle
                    ? 'path'
                    : 'vhost';
            if (credentials.dataPath.useSsl !== undefined)
                s3.use_ssl = credentials.dataPath.useSsl;
            if (
                credentials.dataPath.accessKeyId &&
                credentials.dataPath.secretAccessKey
            ) {
                environment[envVar('s3_key')] =
                    credentials.dataPath.accessKeyId;
                environment[envVar('s3_secret')] =
                    credentials.dataPath.secretAccessKey;
                s3.key_id = envVarReference('s3_key');
                s3.secret = envVarReference('s3_secret');
            } else {
                s3.provider = 'credential_chain';
            }
            secrets.push(s3);
            break;
        }
        case DucklakeDataPathType.GCS: {
            extensions.push('httpfs');
            dataPathValue = credentials.dataPath.url;
            const gcs: Record<string, AnyType> = {
                name: DATA_SECRET,
                type: 'gcs',
                scope: credentials.dataPath.url,
            };
            if (
                credentials.dataPath.hmacKeyId &&
                credentials.dataPath.hmacSecret
            ) {
                environment[envVar('gcs_key')] = credentials.dataPath.hmacKeyId;
                environment[envVar('gcs_secret')] =
                    credentials.dataPath.hmacSecret;
                gcs.key_id = envVarReference('gcs_key');
                gcs.secret = envVarReference('gcs_secret');
            } else {
                gcs.provider = 'credential_chain';
            }
            secrets.push(gcs);
            break;
        }
        case DucklakeDataPathType.AZURE: {
            extensions.push('azure');
            dataPathValue = credentials.dataPath.url;
            const az: Record<string, AnyType> = {
                name: DATA_SECRET,
                type: 'azure',
                scope: credentials.dataPath.url,
            };
            if (credentials.dataPath.connectionString) {
                environment[envVar('azure_connection_string')] =
                    credentials.dataPath.connectionString;
                az.connection_string = envVarReference(
                    'azure_connection_string',
                );
            } else if (
                credentials.dataPath.accountName &&
                credentials.dataPath.accountKey
            ) {
                environment[envVar('azure_account_key')] =
                    credentials.dataPath.accountKey;
                az.account_name = credentials.dataPath.accountName;
                az.account_key = envVarReference('azure_account_key');
            } else if (credentials.dataPath.accountName) {
                az.account_name = credentials.dataPath.accountName;
                az.provider = 'credential_chain';
            }
            secrets.push(az);
            break;
        }
        case DucklakeDataPathType.LOCAL:
            dataPathValue = credentials.dataPath.path;
            break;
        default:
            return assertUnreachable(
                credentials.dataPath,
                'Unknown DuckLake data path type',
            );
    }

    let attachPath: string;
    const attachEntry: Record<string, AnyType> = { alias };
    if (catalogIsPostgres) {
        secrets.push({
            name: DUCKLAKE_SECRET,
            type: 'ducklake',
            metadata_path: '',
            data_path: dataPathValue,
            metadata_parameters: {
                TYPE: 'postgres',
                SECRET: CATALOG_SECRET,
            },
        });
        attachPath = `ducklake:${DUCKLAKE_SECRET}`;
    } else {
        attachPath = inlineCatalogPath!;
        attachEntry.options = { data_path: dataPathValue };
    }
    attachEntry.path = attachPath;

    const target: Record<string, AnyType> = {
        type: 'duckdb',
        path: ':memory:',
        database: alias,
        schema: credentials.schema,
        threads: credentials.threads || DEFAULT_THREADS,
        extensions: Array.from(new Set(extensions)),
        settings: {
            autoinstall_known_extensions: true,
            autoload_known_extensions: true,
        },
        attach: [attachEntry],
    };
    if (secrets.length > 0) target.secrets = secrets;
    return { kind: 'target', target, environment };
};
