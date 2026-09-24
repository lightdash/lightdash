import {
    assertUnreachable,
    DuckdbConnectionType,
    NotFoundError,
    ParameterError,
    WAREHOUSE_LISTED_DATABASES_LIMIT,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type WarehouseConnection,
    type WarehouseDatabaseListing,
    type WarehouseListedDatabase,
} from '@lightdash/common';
import {
    canConnectToPostgresDatabaseName,
    unopenablePostgresDatabaseMessage,
} from '@lightdash/warehouses';

const DATABASE_LISTING_WAREHOUSE_TYPES: WarehouseTypes[] = [
    WarehouseTypes.POSTGRES,
    WarehouseTypes.ATHENA,
];

export const supportsConnectionDatabaseListing = (
    warehouseType: WarehouseTypes,
): boolean => DATABASE_LISTING_WAREHOUSE_TYPES.includes(warehouseType);

const getCredentialsDatabase = (
    credentials: CreateWarehouseCredentials,
): string | undefined => {
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            return credentials.project;
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
            return credentials.dbname;
        case WarehouseTypes.CLICKHOUSE:
            return '';
        case WarehouseTypes.SNOWFLAKE:
            return credentials.database.toLowerCase();
        case WarehouseTypes.DATABRICKS:
            return credentials.catalog || 'DEFAULT';
        case WarehouseTypes.ATHENA:
            return credentials.database;
        case WarehouseTypes.DUCKDB:
            if (credentials.connectionType === DuckdbConnectionType.ANALYTICS) {
                return 'memory';
            }
            if (credentials.connectionType === DuckdbConnectionType.DUCKLAKE) {
                return credentials.catalogAlias ?? 'ducklake';
            }
            if (credentials.connectionType === DuckdbConnectionType.EMBEDDED) {
                return credentials.dataset;
            }
            return credentials.database;
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

export const getDefaultListedDatabase = (
    credentials: CreateWarehouseCredentials,
): WarehouseListedDatabase => {
    const database = getCredentialsDatabase(credentials);
    if (database === undefined) {
        throw new NotFoundError('Database not found in warehouse credentials');
    }
    switch (credentials.type) {
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.CLICKHOUSE:
            return {
                name: credentials.schema,
                database,
                schema: credentials.schema,
                isDefault: true,
            };
        case WarehouseTypes.BIGQUERY:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.DATABRICKS:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.DUCKDB:
            return { name: database, database, schema: null, isDefault: true };
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

const toAdditionalListedDatabase = (
    credentials: CreateWarehouseCredentials,
    name: string,
): WarehouseListedDatabase => {
    if (credentials.type === WarehouseTypes.ATHENA) {
        return {
            name,
            database: credentials.database,
            schema: name,
            isDefault: false,
        };
    }
    return { name, database: name, schema: null, isDefault: false };
};

export const listConnectionDatabases = async ({
    connection,
    credentials,
    listAllDatabases,
}: {
    connection: Pick<
        WarehouseConnection,
        'listAllDatabases' | 'additionalDatabases'
    >;
    credentials: CreateWarehouseCredentials;
    listAllDatabases: () => Promise<WarehouseDatabaseListing>;
}): Promise<WarehouseDatabaseListing> => {
    const defaultDatabase = getDefaultListedDatabase(credentials);
    if (!supportsConnectionDatabaseListing(credentials.type)) {
        return {
            databases: [defaultDatabase],
            truncated: false,
            limit: WAREHOUSE_LISTED_DATABASES_LIMIT,
        };
    }
    if (connection.listAllDatabases) return listAllDatabases();

    const names = new Set([defaultDatabase.name]);
    connection.additionalDatabases.forEach((name) => {
        const trimmed = name.trim();
        if (trimmed !== '') names.add(trimmed);
    });
    const databases = [...names].map((name) =>
        name === defaultDatabase.name
            ? defaultDatabase
            : toAdditionalListedDatabase(credentials, name),
    );
    return {
        databases: databases.slice(0, WAREHOUSE_LISTED_DATABASES_LIMIT),
        truncated: databases.length > WAREHOUSE_LISTED_DATABASES_LIMIT,
        limit: WAREHOUSE_LISTED_DATABASES_LIMIT,
    };
};

export const findListedDatabase = (
    listing: WarehouseDatabaseListing,
    listedDatabaseName: string,
): WarehouseListedDatabase => {
    const listedDatabase = listing.databases.find(
        ({ name }) => name === listedDatabaseName,
    );
    if (!listedDatabase) {
        throw new NotFoundError(
            `Warehouse database "${listedDatabaseName}" not found`,
        );
    }
    return listedDatabase;
};

export const findListedCatalogDatabase = (
    listing: WarehouseDatabaseListing,
    databaseName: string,
): WarehouseListedDatabase => {
    const listedDatabase = listing.databases.find(
        ({ database }) => database === databaseName,
    );
    if (!listedDatabase) {
        throw new NotFoundError(
            `Warehouse database "${databaseName}" not found`,
        );
    }
    return listedDatabase;
};

export const credentialsForListedDatabase = (
    credentials: CreateWarehouseCredentials,
    listedDatabase: WarehouseListedDatabase,
): CreateWarehouseCredentials => {
    if (
        credentials.type !== WarehouseTypes.POSTGRES ||
        listedDatabase.database === credentials.dbname
    ) {
        return credentials;
    }
    if (!canConnectToPostgresDatabaseName(listedDatabase.database)) {
        throw new ParameterError(
            unopenablePostgresDatabaseMessage(listedDatabase.database),
        );
    }
    return { ...credentials, dbname: listedDatabase.database };
};
