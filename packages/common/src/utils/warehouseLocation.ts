import { ParameterError } from '../types/errors';
import {
    DuckdbConnectionType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type WarehouseCredentials,
    type WarehouseLocation,
} from '../types/projects';
import assertUnreachable from './assertUnreachable';

export const EMPTY_WAREHOUSE_LOCATION: WarehouseLocation = {
    database: null,
    schema: null,
};

export const hasWarehouseLocation = (location: WarehouseLocation): boolean =>
    location.database !== null || location.schema !== null;

/**
 * A blank field means the source inherits the project's location. Callers reach
 * this from an API body as well as the form, so normalise before storing: an
 * empty string stored as an override compiles to `""."table"` and fails.
 */
export const normalizeWarehouseLocation = (
    location: WarehouseLocation,
): WarehouseLocation => ({
    database: location.database?.trim() || null,
    schema: location.schema?.trim() || null,
});

/**
 * A null database means the warehouse has no level above the schema, so a
 * database override is not accepted for it.
 */
export const getWarehouseLocationLabels = (
    warehouseType: WarehouseTypes,
): { database: string | null; schema: string } => {
    switch (warehouseType) {
        case WarehouseTypes.BIGQUERY:
            return { database: 'GCP project', schema: 'Dataset' };
        case WarehouseTypes.DATABRICKS:
            return { database: 'Catalog', schema: 'Schema' };
        case WarehouseTypes.CLICKHOUSE:
            return { database: null, schema: 'Schema' };
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.DUCKDB:
            return { database: 'Database', schema: 'Schema' };
        default:
            return assertUnreachable(
                warehouseType,
                `Unknown warehouse type ${warehouseType}`,
            );
    }
};

/** The location a warehouse connection already points at. */
export const getWarehouseLocation = (
    credentials: CreateWarehouseCredentials | WarehouseCredentials,
): WarehouseLocation => {
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            return {
                database: credentials.project,
                schema: credentials.dataset,
            };
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.TRINO:
            return {
                database: credentials.dbname,
                schema: credentials.schema,
            };
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.ATHENA:
            return {
                database: credentials.database,
                schema: credentials.schema,
            };
        case WarehouseTypes.DATABRICKS:
            return {
                database: credentials.catalog ?? null,
                // this supposed to be a `schema` but changing it will break for existing customers
                schema: credentials.database,
            };
        case WarehouseTypes.CLICKHOUSE:
            return { database: null, schema: credentials.schema };
        case WarehouseTypes.DUCKDB:
            switch (credentials.connectionType) {
                case DuckdbConnectionType.MOTHERDUCK:
                    return {
                        database: credentials.database,
                        schema: credentials.schema,
                    };
                case DuckdbConnectionType.DUCKLAKE:
                    return {
                        database: credentials.catalogAlias ?? null,
                        schema: credentials.schema,
                    };
                case DuckdbConnectionType.EMBEDDED:
                    return {
                        database: null,
                        schema: credentials.schema ?? null,
                    };
                default:
                    return assertUnreachable(
                        credentials,
                        `Unknown DuckDB connection type`,
                    );
            }
        default:
            const { type } = credentials;
            return assertUnreachable(
                credentials,
                `Unknown warehouse type ${type}`,
            );
    }
};

const unsupportedDatabaseOverride = (warehouseType: WarehouseTypes): Error =>
    new ParameterError(
        `${warehouseType} tables are not qualified by a database, so a dbt source cannot override one`,
    );

/**
 * The project's warehouse credentials with the source's own database and schema,
 * for generating that source's dbt profile. Only the location changes: the
 * connection, and the client that runs queries, stay the project's.
 */
export const applyWarehouseLocation = (
    credentials: CreateWarehouseCredentials,
    location: WarehouseLocation,
): CreateWarehouseCredentials => {
    const { database, schema } = location;
    if (!hasWarehouseLocation(location)) {
        return credentials;
    }
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            return {
                ...credentials,
                project: database ?? credentials.project,
                dataset: schema ?? credentials.dataset,
            };
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.TRINO:
            return {
                ...credentials,
                dbname: database ?? credentials.dbname,
                schema: schema ?? credentials.schema,
            };
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.ATHENA:
            return {
                ...credentials,
                database: database ?? credentials.database,
                schema: schema ?? credentials.schema,
            };
        case WarehouseTypes.DATABRICKS:
            return {
                ...credentials,
                catalog: database ?? credentials.catalog,
                // this supposed to be a `schema` but changing it will break for existing customers
                database: schema ?? credentials.database,
            };
        case WarehouseTypes.CLICKHOUSE:
            if (database !== null) {
                throw unsupportedDatabaseOverride(credentials.type);
            }
            return {
                ...credentials,
                schema: schema ?? credentials.schema,
            };
        case WarehouseTypes.DUCKDB:
            switch (credentials.connectionType) {
                case DuckdbConnectionType.MOTHERDUCK:
                    return {
                        ...credentials,
                        database: database ?? credentials.database,
                        schema: schema ?? credentials.schema,
                    };
                case DuckdbConnectionType.DUCKLAKE:
                    return {
                        ...credentials,
                        catalogAlias: database ?? credentials.catalogAlias,
                        schema: schema ?? credentials.schema,
                    };
                case DuckdbConnectionType.EMBEDDED:
                    throw new ParameterError(
                        'Embedded DuckDB credentials cannot be used for dbt compilation',
                    );
                default:
                    return assertUnreachable(
                        credentials,
                        `Unknown DuckDB connection type`,
                    );
            }
        default:
            const { type } = credentials;
            return assertUnreachable(
                credentials,
                `Unknown warehouse type ${type}`,
            );
    }
};

/**
 * Reject a location a warehouse cannot express when the user saves it, not when
 * a deploy compiles with it hours later. Takes the connection rather than the
 * type because two DuckDB connections differ: embedded cannot compile dbt at
 * all, MotherDuck can.
 */
export const validateWarehouseLocation = (
    credentials: CreateWarehouseCredentials | WarehouseCredentials,
    location: WarehouseLocation,
): void => {
    if (!hasWarehouseLocation(location)) {
        return;
    }
    if (
        credentials.type === WarehouseTypes.DUCKDB &&
        credentials.connectionType === DuckdbConnectionType.EMBEDDED
    ) {
        throw new ParameterError(
            'Embedded DuckDB credentials cannot be used for dbt compilation, so a dbt source cannot set a location for them',
        );
    }
    if (
        location.database !== null &&
        getWarehouseLocationLabels(credentials.type).database === null
    ) {
        throw unsupportedDatabaseOverride(credentials.type);
    }
};
