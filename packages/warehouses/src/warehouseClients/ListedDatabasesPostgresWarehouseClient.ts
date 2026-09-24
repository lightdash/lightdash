import {
    type CreatePostgresCredentials,
    type WarehouseCatalog,
} from '@lightdash/common';
import { PostgresWarehouseClient } from './PostgresWarehouseClient';

type CatalogRequest = {
    database: string;
    schema: string;
    table: string;
};

export type WarehouseListedDatabases = {
    listAllDatabases: boolean;
    additionalDatabases: string[];
};

const MISSING_DATABASE = '3D000';

const isMissingDatabaseError = (error: unknown, database: string) =>
    error instanceof Error &&
    ((error as { code?: string }).code === MISSING_DATABASE ||
        error.message.includes(`database "${database}" does not exist`));

export class ListedDatabasesPostgresWarehouseClient extends PostgresWarehouseClient {
    private readonly listedDatabases: WarehouseListedDatabases;

    private readonly onSkippedDatabase: (database: string) => void;

    constructor(
        credentials: CreatePostgresCredentials,
        listedDatabases: WarehouseListedDatabases,
        onSkippedDatabase: (database: string) => void,
    ) {
        super(credentials);
        this.listedDatabases = listedDatabases;
        this.onSkippedDatabase = onSkippedDatabase;
    }

    private isListedDatabase(database: string): boolean {
        if (database === this.credentials.dbname) return false;
        return (
            this.listedDatabases.listAllDatabases ||
            this.listedDatabases.additionalDatabases.includes(database)
        );
    }

    async getCatalog(requests: CatalogRequest[]): Promise<WarehouseCatalog> {
        return this.getCatalogForListedDatabases(requests);
    }

    async getCatalogForListedDatabases(
        requests: CatalogRequest[],
    ): Promise<WarehouseCatalog> {
        const requestsByListedDatabase = new Map<string, CatalogRequest[]>();
        const connectionRequests: CatalogRequest[] = [];
        requests.forEach((request) => {
            if (!this.isListedDatabase(request.database)) {
                connectionRequests.push(request);
                return;
            }
            const databaseRequests =
                requestsByListedDatabase.get(request.database) ?? [];
            databaseRequests.push(request);
            requestsByListedDatabase.set(request.database, databaseRequests);
        });
        const catalogs = await Promise.all([
            connectionRequests.length > 0
                ? super.getCatalog(connectionRequests)
                : {},
            ...[...requestsByListedDatabase].map(
                ([database, databaseRequests]) =>
                    this.getListedDatabaseCatalog(database, databaseRequests),
            ),
        ]);
        return Object.assign({}, ...catalogs);
    }

    private async getListedDatabaseCatalog(
        database: string,
        requests: CatalogRequest[],
    ): Promise<WarehouseCatalog> {
        const client = new PostgresWarehouseClient({
            ...this.credentials,
            dbname: database,
        });
        try {
            return await client.getCatalog(requests);
        } catch (error) {
            if (!isMissingDatabaseError(error, database)) throw error;
            this.onSkippedDatabase(database);
            return {};
        }
    }
}
