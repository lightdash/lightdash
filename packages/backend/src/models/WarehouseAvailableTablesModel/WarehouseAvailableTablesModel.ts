import { WarehouseCatalog } from '@lightdash/common';
import { Knex } from 'knex';
import { DbWarehouseAvailableTables } from '../../database/entities/warehouseAvailableTables';

export class WarehouseAvailableTablesModel {
    database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    static toWarehouseCatalog(
        rows: Pick<
            DbWarehouseAvailableTables,
            'database_name' | 'schema_name' | 'table_name'
        >[],
    ): WarehouseCatalog {
        return rows.reduce((acc, row) => {
            const {
                database_name: database,
                schema_name: schema,
                table_name: table,
            } = row;
            if (!acc[database]) {
                acc[database] = {};
            }
            if (!acc[database][schema]) {
                acc[database][schema] = {};
            }
            acc[database][schema][table] = {};
            return acc;
        }, {} as WarehouseCatalog);
    }

    async getTablesForUserWarehouseCredentials(
        userWarehouseCredentialsId: string,
    ) {
        const rows = await this.database(
            'warehouse_credentials_available_tables',
        )
            .where(
                'user_warehouse_credentials_uuid',
                userWarehouseCredentialsId,
            )
            .select(['database_name', 'schema_name', 'table_name']);
        return WarehouseAvailableTablesModel.toWarehouseCatalog(rows);
    }

    async getTablesForProjectWarehouseCredentials(projectUuid: string) {
        const rows = await this.database('projects')
            .join(
                'warehouse_credentials',
                'projects.project_id',
                'warehouse_credentials.project_id',
            )
            .join(
                'warehouse_credentials_available_tables',
                'warehouse_credentials.warehouse_credentials_id',
                'warehouse_credentials_available_tables.project_warehouse_credentials_id',
            )
            .where('project_uuid', projectUuid)
            .select(['database_name', 'schema_name', 'table_name']);
        return WarehouseAvailableTablesModel.toWarehouseCatalog(rows);
    }

    async createAvailableTablesForProjectWarehouseCredentials(
        warehouseCredentialsId: number,
        tables: { database: string; schema: string; table: string }[],
    ) {
        const rows = tables.map(({ database, schema, table }) => ({
            database_name: database,
            schema_name: schema,
            table_name: table,
            project_warehouse_credentials_id: warehouseCredentialsId,
            user_warehouse_credentials_uuid: null,
        }));
        await this.database('warehouse_credentials_available_tables').insert(
            rows,
        );
    }

    async createAvailableTablesForUserWarehouseCredentials(
        userWarehouseCredentialsUuid: string,
        tables: { database: string; schema: string; table: string }[],
    ) {
        const rows = tables.map(({ database, schema, table }) => ({
            database_name: database,
            schema_name: schema,
            table_name: table,
            project_warehouse_credentials_id: null,
            user_warehouse_credentials_uuid: userWarehouseCredentialsUuid,
        }));
        await this.database('warehouse_credentials_available_tables').insert(
            rows,
        );
    }
}
