import {
    NotFoundError,
    type ExternalSource,
    type ExternalSourceConnection,
    type ExternalSourceStatus,
    type ExternalSourceTable,
    type ExternalSourceType,
    type ResultColumns,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ExternalSourcesTableName,
    ExternalSourceTablesTableName,
    type DbExternalSource,
    type DbExternalSourceTable,
    type DbExternalSourceUpdate,
} from '../../database/entities/externalSources';
import { type PreAggregateDuckdbLocator } from '../../utils/duckdb/duckdbSqlTables';

type ExternalSourceModelArguments = {
    database: Knex;
};

export class ExternalSourceModel {
    private readonly database: Knex;

    constructor(args: ExternalSourceModelArguments) {
        this.database = args.database;
    }

    /** API shape: the storage locator never leaves the backend. */
    private static mapTable(row: DbExternalSourceTable): ExternalSourceTable {
        return {
            tableUuid: row.external_source_table_uuid,
            sourceUuid: row.external_source_uuid,
            name: row.name,
            label: row.label,
            columns: row.columns,
            rowCount: row.row_count === null ? null : Number(row.row_count),
            totalBytes:
                row.total_bytes === null ? null : Number(row.total_bytes),
            version: row.version,
            lastIngestedAt: row.last_ingested_at,
        };
    }

    private static mapSource(
        row: DbExternalSource,
        tables: DbExternalSourceTable[],
    ): ExternalSource {
        return {
            sourceUuid: row.external_source_uuid,
            projectUuid: row.project_uuid,
            type: row.type,
            name: row.name,
            connection: row.connection,
            status: row.status,
            errorMessage: row.error_message,
            createdByUserUuid: row.created_by_user_uuid,
            lastRefreshedAt: row.last_refreshed_at,
            tables: tables.map(ExternalSourceModel.mapTable),
        };
    }

    async createSource(data: {
        projectUuid: string;
        type: ExternalSourceType;
        name: string;
        status: ExternalSourceStatus;
        connection: ExternalSourceConnection;
        createdByUserUuid: string;
    }): Promise<ExternalSource> {
        const [row] = await this.database(ExternalSourcesTableName)
            .insert({
                project_uuid: data.projectUuid,
                type: data.type,
                name: data.name,
                status: data.status,
                connection: data.connection,
                created_by_user_uuid: data.createdByUserUuid,
            })
            .returning('*');
        return ExternalSourceModel.mapSource(row, []);
    }

    private async getSourceRow(
        projectUuid: string,
        sourceUuid: string,
    ): Promise<DbExternalSource> {
        const row = await this.database(ExternalSourcesTableName)
            .where('project_uuid', projectUuid)
            .andWhere('external_source_uuid', sourceUuid)
            .first();
        if (!row) {
            throw new NotFoundError(
                `External source ${sourceUuid} not found in project`,
            );
        }
        return row;
    }

    private async getTableRows(
        sourceUuids: string[],
    ): Promise<DbExternalSourceTable[]> {
        if (sourceUuids.length === 0) return [];
        return this.database(ExternalSourceTablesTableName)
            .whereIn('external_source_uuid', sourceUuids)
            .orderBy('name');
    }

    async getSource(
        projectUuid: string,
        sourceUuid: string,
    ): Promise<ExternalSource> {
        const row = await this.getSourceRow(projectUuid, sourceUuid);
        const tables = await this.getTableRows([sourceUuid]);
        return ExternalSourceModel.mapSource(row, tables);
    }

    async listSources(projectUuid: string): Promise<ExternalSource[]> {
        const rows = await this.database(ExternalSourcesTableName)
            .where('project_uuid', projectUuid)
            .orderBy('name');
        const tables = await this.getTableRows(
            rows.map((row) => row.external_source_uuid),
        );
        const tablesBySource = tables.reduce<
            Record<string, DbExternalSourceTable[]>
        >((acc, table) => {
            acc[table.external_source_uuid] = [
                ...(acc[table.external_source_uuid] ?? []),
                table,
            ];
            return acc;
        }, {});
        return rows.map((row) =>
            ExternalSourceModel.mapSource(
                row,
                tablesBySource[row.external_source_uuid] ?? [],
            ),
        );
    }

    async findSourceByName(
        projectUuid: string,
        name: string,
    ): Promise<ExternalSource | undefined> {
        const row = await this.database(ExternalSourcesTableName)
            .where('project_uuid', projectUuid)
            .andWhere('name', name)
            .first();
        if (!row) return undefined;
        const tables = await this.getTableRows([row.external_source_uuid]);
        return ExternalSourceModel.mapSource(row, tables);
    }

    async updateSource(
        sourceUuid: string,
        update: DbExternalSourceUpdate,
    ): Promise<void> {
        await this.database(ExternalSourcesTableName)
            .where('external_source_uuid', sourceUuid)
            .update({ ...update, updated_at: new Date() });
    }

    async createTable(data: {
        sourceUuid: string;
        projectUuid: string;
        name: string;
        label: string;
    }): Promise<ExternalSourceTable> {
        const [row] = await this.database(ExternalSourceTablesTableName)
            .insert({
                external_source_uuid: data.sourceUuid,
                project_uuid: data.projectUuid,
                name: data.name,
                label: data.label,
            })
            .returning('*');
        return ExternalSourceModel.mapTable(row);
    }

    /** Atomically swap a table to a freshly ingested file. */
    async updateTableIngest(
        tableUuid: string,
        data: {
            columns: ResultColumns;
            locator: PreAggregateDuckdbLocator;
            rowCount: number | null;
            totalBytes: number | null;
            ingestVersion: number;
        },
    ): Promise<boolean> {
        return this.database.transaction(async (trx) => {
            const row = await trx(ExternalSourceTablesTableName)
                .where('external_source_table_uuid', tableUuid)
                .forUpdate()
                .first();
            if (!row) {
                throw new NotFoundError(
                    `External source table ${tableUuid} not found`,
                );
            }
            if (row.version > data.ingestVersion) {
                return false;
            }
            if (row.version === data.ingestVersion) {
                return true;
            }
            if (row.version !== data.ingestVersion - 1) {
                throw new Error(
                    `Cannot publish external source ingest version ${data.ingestVersion} after version ${row.version}`,
                );
            }
            await trx(ExternalSourceTablesTableName)
                .where('external_source_table_uuid', tableUuid)
                .update({
                    columns: data.columns,
                    locator: data.locator,
                    row_count: data.rowCount,
                    total_bytes: data.totalBytes,
                    version: data.ingestVersion,
                    last_ingested_at: new Date(),
                    updated_at: new Date(),
                });
            return true;
        });
    }

    async updateTableLabel(tableUuid: string, label: string): Promise<void> {
        await this.database(ExternalSourceTablesTableName)
            .where('external_source_table_uuid', tableUuid)
            .update({ label, updated_at: new Date() });
    }

    async deleteSource(projectUuid: string, sourceUuid: string): Promise<void> {
        await this.database(ExternalSourcesTableName)
            .where('project_uuid', projectUuid)
            .andWhere('external_source_uuid', sourceUuid)
            .delete();
    }

    /**
     * Backend-only shape for ingest and query execution: includes locators.
     */
    async getSourceRowsForIngest(projectUuid: string, sourceUuid: string) {
        const source = await this.getSourceRow(projectUuid, sourceUuid);
        const tables = await this.getTableRows([sourceUuid]);
        return { source, tables };
    }

    async findTableByUuid(
        projectUuid: string,
        tableUuid: string,
    ): Promise<DbExternalSourceTable | undefined> {
        return this.database(ExternalSourceTablesTableName)
            .where('project_uuid', projectUuid)
            .andWhere('external_source_table_uuid', tableUuid)
            .first();
    }

    async findTableForQuery(projectUuid: string, tableUuid: string) {
        const row = await this.database(ExternalSourceTablesTableName)
            .innerJoin(
                ExternalSourcesTableName,
                `${ExternalSourcesTableName}.external_source_uuid`,
                `${ExternalSourceTablesTableName}.external_source_uuid`,
            )
            .select(`${ExternalSourceTablesTableName}.*`)
            .select(
                `${ExternalSourcesTableName}.status as external_source_status`,
            )
            .where(`${ExternalSourceTablesTableName}.project_uuid`, projectUuid)
            .andWhere(`${ExternalSourcesTableName}.project_uuid`, projectUuid)
            .andWhere(
                `${ExternalSourceTablesTableName}.external_source_table_uuid`,
                tableUuid,
            )
            .first();
        return row as
            | (DbExternalSourceTable & {
                  external_source_status: ExternalSourceStatus;
              })
            | undefined;
    }
}
