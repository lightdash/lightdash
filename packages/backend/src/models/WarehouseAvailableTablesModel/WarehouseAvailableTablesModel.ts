import {
    NotFoundError,
    WarehouseCatalog,
    WarehouseTables,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbWarehouseAvailableTables,
    WarehouseAvailableTablesTableName,
} from '../../database/entities/warehouseAvailableTables';

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
        const rows = await this.database(WarehouseAvailableTablesTableName)
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
                WarehouseAvailableTablesTableName,
                'warehouse_credentials.warehouse_credentials_id',
                `${WarehouseAvailableTablesTableName}.project_warehouse_credentials_id`,
            )
            .where('project_uuid', projectUuid)
            .select(['database', 'schema', 'table']);
        return WarehouseAvailableTablesModel.toWarehouseCatalog(rows);
    }

    async createAvailableTablesForProjectWarehouseCredentials(
        projectUuid: string,
        tables: WarehouseTables,
    ) {
        const warehouseCredentialsId = await this.database(
            'warehouse_credentials',
        )
            .join(
                'projects',
                'projects.project_id',
                'warehouse_credentials.project_id',
            )
            .where('project_uuid', projectUuid)
            .select('warehouse_credentials_id')
            .first();

        if (!warehouseCredentialsId) {
            throw new NotFoundError('Warehouse credentials not found');
        }
        const rows = tables.map(({ database, schema, table }) => ({
            database,
            schema,
            table,
            project_warehouse_credentials_id:
                warehouseCredentialsId.warehouse_credentials_id,
            user_warehouse_credentials_uuid: null,
        }));

        await this.database.transaction(async (trx) => {
            await trx(WarehouseAvailableTablesTableName)
                .where(
                    'project_warehouse_credentials_id',
                    warehouseCredentialsId.warehouse_credentials_id,
                )
                .del();

            if (rows.length !== 0) {
                await trx(WarehouseAvailableTablesTableName).insert(rows);
            }
        });
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
        await this.database.transaction(async (trx) => {
            await trx(WarehouseAvailableTablesTableName)
                .where(
                    'user_warehouse_credentials_uuid',
                    userWarehouseCredentialsUuid,
                )
                .del();
            if (rows.length !== 0) {
                await trx(WarehouseAvailableTablesTableName).insert(rows);
            }
        });
    }
}
