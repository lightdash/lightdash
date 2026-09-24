import {
    NotFoundError,
    type PartitionColumn,
    type WarehouseTables,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { WarehouseAvailableTablesModel } from '../WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';

const WAREHOUSE_CONNECTION_TABLES_TABLE = 'warehouse_connection_tables';

export type WarehouseConnectionTablesScope = {
    projectUuid: string;
    warehouseConnectionUuid: string;
    userWarehouseCredentialsUuid: string | null;
};

type DbWarehouseConnectionTable = {
    warehouse_connection_table_uuid: string;
    warehouse_connection_uuid: string;
    user_warehouse_credentials_uuid: string | null;
    listed_database: string;
    database: string;
    schema: string;
    table: string;
    partition_column: PartitionColumn | null;
    table_type: string | null;
};

export class WarehouseConnectionTablesModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private static scoped(
        query: Knex.QueryBuilder,
        scope: WarehouseConnectionTablesScope,
    ) {
        query.where('warehouse_connection_uuid', scope.warehouseConnectionUuid);
        if (scope.userWarehouseCredentialsUuid === null) {
            query.whereNull('user_warehouse_credentials_uuid');
        } else {
            query.where(
                'user_warehouse_credentials_uuid',
                scope.userWarehouseCredentialsUuid,
            );
        }
        return query;
    }

    private static async lockConnection(
        trx: Knex.Transaction,
        scope: WarehouseConnectionTablesScope,
    ): Promise<void> {
        const connection = await trx('warehouse_connections')
            .select('warehouse_connection_uuid')
            .where('warehouse_connection_uuid', scope.warehouseConnectionUuid)
            .where('project_uuid', scope.projectUuid)
            .forNoKeyUpdate()
            .first();
        if (!connection) throw new NotFoundError('Connection not found');
    }

    async getTables(
        scope: WarehouseConnectionTablesScope,
        listedDatabase: string,
    ): Promise<WarehouseTablesCatalog | null> {
        const rows = await WarehouseConnectionTablesModel.scoped(
            this.database(WAREHOUSE_CONNECTION_TABLES_TABLE),
            scope,
        )
            .whereExists((connection) =>
                connection
                    .select('warehouse_connection_uuid')
                    .from('warehouse_connections')
                    .whereRaw(
                        'warehouse_connections.warehouse_connection_uuid = warehouse_connection_tables.warehouse_connection_uuid',
                    )
                    .where('project_uuid', scope.projectUuid),
            )
            .where('listed_database', listedDatabase)
            .select<
                Pick<
                    DbWarehouseConnectionTable,
                    | 'database'
                    | 'schema'
                    | 'table'
                    | 'partition_column'
                    | 'table_type'
                >[]
            >('database', 'schema', 'table', 'partition_column', 'table_type');
        if (rows.length === 0) return null;
        return WarehouseAvailableTablesModel.toWarehouseCatalog(rows);
    }

    async replaceTables(
        scope: WarehouseConnectionTablesScope,
        listedDatabase: string,
        tables: WarehouseTables,
    ): Promise<void> {
        const rows = tables.map(
            ({ database, schema, table, partitionColumn, tableType }) => ({
                warehouse_connection_uuid: scope.warehouseConnectionUuid,
                user_warehouse_credentials_uuid:
                    scope.userWarehouseCredentialsUuid,
                listed_database: listedDatabase,
                database,
                schema,
                table,
                partition_column: partitionColumn ?? null,
                table_type: tableType ?? null,
            }),
        );
        await this.database.transaction(async (trx) => {
            await WarehouseConnectionTablesModel.lockConnection(trx, scope);
            await WarehouseConnectionTablesModel.scoped(
                trx(WAREHOUSE_CONNECTION_TABLES_TABLE),
                scope,
            )
                .where('listed_database', listedDatabase)
                .delete();
            if (rows.length > 0) {
                await trx.batchInsert(WAREHOUSE_CONNECTION_TABLES_TABLE, rows);
            }
        });
    }

    async clearTables(scope: WarehouseConnectionTablesScope): Promise<void> {
        await this.database.transaction(async (trx) => {
            await WarehouseConnectionTablesModel.lockConnection(trx, scope);
            await WarehouseConnectionTablesModel.scoped(
                trx(WAREHOUSE_CONNECTION_TABLES_TABLE),
                scope,
            ).delete();
        });
    }
}
