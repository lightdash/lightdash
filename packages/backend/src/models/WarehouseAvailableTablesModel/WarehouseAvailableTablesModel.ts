import { WarehouseCatalog, WarehouseTables } from '@lightdash/common';
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
            'database' | 'schema' | 'table'
        >[],
    ): WarehouseCatalog {
        return rows.reduce((acc, row) => {
            const { database, schema, table } = row;
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
            .select(['database', 'schema', 'table']);
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
            .select(['database', 'schema', 'table']);
        return WarehouseAvailableTablesModel.toWarehouseCatalog(rows);
    }

    async createAvailableTablesForProjectWarehouseCredentials(
        warehouseCredentialsId: number,
        tables: WarehouseTables,
    ) {
        const rows = tables.map(({ database, schema, table }) => ({
            database,
            schema,
            table,
            project_warehouse_credentials_id: warehouseCredentialsId,
            user_warehouse_credentials_uuid: null,
        }));
        await this.database('warehouse_credentials_available_tables').insert(
            rows,
        );
    }

    async createAvailableTablesForUserWarehouseCredentials(
        userWarehouseCredentialsUuid: string,
        tables: WarehouseTables,
    ) {
        const rows = tables.map(({ database, schema, table }) => ({
            database,
            schema,
            table,
            project_warehouse_credentials_id: null,
            user_warehouse_credentials_uuid: userWarehouseCredentialsUuid,
        }));
        await this.database('warehouse_credentials_available_tables').insert(
            rows,
        );
    }
}
