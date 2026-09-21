import {
    isWarehouseTableType,
    NotFoundError,
    UnexpectedServerError,
    WarehouseCatalog,
    WarehouseTables,
    WarehouseTablesCatalog,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbWarehouseAvailableTables,
    WarehouseAvailableTablesTableName,
} from '../../database/entities/warehouseAvailableTables';
import { WarehouseCredentialTableName } from '../../database/entities/warehouseCredentials';

export class WarehouseAvailableTablesModel {
    database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    private async hasSupersededWarehouseCredentialsColumn(): Promise<boolean> {
        return this.database.schema.hasColumn(
            WarehouseCredentialTableName,
            'superseded_at',
        );
    }

    private async getProjectWarehouseCredentialsId(
        projectUuid: string,
    ): Promise<number> {
        const hasSupersededAt =
            await this.hasSupersededWarehouseCredentialsColumn();
        const query = this.database(WarehouseCredentialTableName)
            .join(
                'projects',
                'projects.project_id',
                `${WarehouseCredentialTableName}.project_id`,
            )
            .where('projects.project_uuid', projectUuid);

        if (hasSupersededAt) {
            query.whereNull(`${WarehouseCredentialTableName}.superseded_at`);
        }

        const warehouseCredentials = await query
            .select<{ warehouse_credentials_id: number }[]>(
                `${WarehouseCredentialTableName}.warehouse_credentials_id`,
            )
            .limit(2);

        if (warehouseCredentials.length === 0) {
            throw new NotFoundError('Warehouse credentials not found');
        }

        if (warehouseCredentials.length > 1) {
            throw new UnexpectedServerError(
                'Could not save available tables because the project does not have exactly one active warehouse connection.',
            );
        }

        return warehouseCredentials[0].warehouse_credentials_id;
    }

    static toWarehouseCatalog(
        rows: Pick<
            DbWarehouseAvailableTables,
            'database' | 'schema' | 'table' | 'partition_column' | 'table_type'
        >[],
    ): WarehouseTablesCatalog {
        return rows.reduce((acc, row) => {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const { database, schema, table, partition_column, table_type } =
                row;
            if (!acc[database]) {
                acc[database] = {};
            }
            if (!acc[database][schema]) {
                acc[database][schema] = {};
            }
            acc[database][schema][table] = {
                partitionColumn: partition_column || undefined,
                // Rows cached before the column existed have no type
                tableType: isWarehouseTableType(table_type)
                    ? table_type
                    : undefined,
            };
            return acc;
        }, {} as WarehouseTablesCatalog);
    }

    async getTablesForUserWarehouseCredentials(
        userWarehouseCredentialsId: string,
    ) {
        const rows = await this.database(WarehouseAvailableTablesTableName)
            .where(
                'user_warehouse_credentials_uuid',
                userWarehouseCredentialsId,
            )
            .select([
                'database',
                'schema',
                'table',
                'partition_column',
                'table_type',
            ]);
        return WarehouseAvailableTablesModel.toWarehouseCatalog(rows);
    }

    async getTablesForProjectWarehouseCredentials(projectUuid: string) {
        const hasSupersededAt =
            await this.hasSupersededWarehouseCredentialsColumn();
        const query = this.database('projects')
            .join(
                WarehouseCredentialTableName,
                'projects.project_id',
                `${WarehouseCredentialTableName}.project_id`,
            )
            .join(
                WarehouseAvailableTablesTableName,
                `${WarehouseCredentialTableName}.warehouse_credentials_id`,
                `${WarehouseAvailableTablesTableName}.project_warehouse_credentials_id`,
            )
            .where('projects.project_uuid', projectUuid);

        if (hasSupersededAt) {
            query.whereNull(`${WarehouseCredentialTableName}.superseded_at`);
        }

        const rows = await query.select([
            'database',
            'schema',
            'table',
            'partition_column',
            'table_type',
        ]);
        return WarehouseAvailableTablesModel.toWarehouseCatalog(rows);
    }

    async createAvailableTablesForProjectWarehouseCredentials(
        projectUuid: string,
        tables: WarehouseTables,
    ) {
        const warehouseCredentialsId =
            await this.getProjectWarehouseCredentialsId(projectUuid);
        const rows = tables.map(
            ({ database, schema, table, partitionColumn, tableType }) => ({
                database,
                schema,
                table,
                project_warehouse_credentials_id: warehouseCredentialsId,
                user_warehouse_credentials_uuid: null,
                partition_column: partitionColumn || null,
                table_type: tableType,
            }),
        );

        await this.database.transaction(async (trx) => {
            await trx(WarehouseAvailableTablesTableName)
                .where(
                    'project_warehouse_credentials_id',
                    warehouseCredentialsId,
                )
                .del();

            if (rows.length !== 0) {
                await trx.batchInsert(WarehouseAvailableTablesTableName, rows);
            }
        });
    }

    async createAvailableTablesForUserWarehouseCredentials(
        userWarehouseCredentialsUuid: string,
        tables: WarehouseTables,
    ) {
        const rows = tables.map(
            ({ database, schema, table, partitionColumn, tableType }) => ({
                database,
                schema,
                table,
                partition_column: partitionColumn || null,
                table_type: tableType,
                project_warehouse_credentials_id: null,
                user_warehouse_credentials_uuid: userWarehouseCredentialsUuid,
            }),
        );
        await this.database.transaction(async (trx) => {
            await trx(WarehouseAvailableTablesTableName)
                .where(
                    'user_warehouse_credentials_uuid',
                    userWarehouseCredentialsUuid,
                )
                .del();
            if (rows.length !== 0) {
                await trx.batchInsert(WarehouseAvailableTablesTableName, rows);
            }
        });
    }
}
