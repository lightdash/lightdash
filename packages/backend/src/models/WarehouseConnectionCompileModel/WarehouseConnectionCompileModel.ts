import {
    NotFoundError,
    SingleConnectionProjectError,
    type DbtSourceBindings,
    type WarehouseCatalog,
} from '@lightdash/common';
import { type Knex } from 'knex';

const WAREHOUSE_CONNECTIONS_TABLE = 'warehouse_connections';
const MANIFESTS_TABLE = 'warehouse_connection_manifests';
const CATALOG_CACHE_TABLE = 'warehouse_connection_catalog_cache';
const DBT_SOURCES_TABLE = 'project_dbt_sources';

type DbCompileConnection = {
    warehouse_connection_uuid: string;
    name: string;
    is_original: boolean;
    list_all_databases: boolean;
    additional_databases: string[];
    created_at: Date;
};

type DbDbtSourceBinding = {
    project_uuid: string;
    project_dbt_source_uuid: string;
    warehouse_connection_uuid: string | null;
    updated_at: Date;
};

export type CompileConnection = {
    warehouseConnectionUuid: string;
    name: string;
    isOriginal: boolean;
    listAllDatabases: boolean;
    additionalDatabases: string[];
};

type WarehouseConnectionCompileModelArguments = {
    database: Knex;
};

export class WarehouseConnectionCompileModel {
    private readonly database: Knex;

    constructor(args: WarehouseConnectionCompileModelArguments) {
        this.database = args.database;
    }

    async getCompileConnections(
        projectUuid: string,
    ): Promise<CompileConnection[]> {
        const rows = await this.database<DbCompileConnection>(
            WAREHOUSE_CONNECTIONS_TABLE,
        )
            .select(
                'warehouse_connection_uuid',
                'name',
                'is_original',
                'list_all_databases',
                'additional_databases',
            )
            .where('project_uuid', projectUuid)
            .orderBy([
                { column: 'is_original', order: 'desc' },
                { column: 'created_at', order: 'asc' },
            ]);
        return rows.map((row) => ({
            warehouseConnectionUuid: row.warehouse_connection_uuid,
            name: row.name,
            isOriginal: row.is_original,
            listAllDatabases: row.list_all_databases,
            additionalDatabases: row.additional_databases,
        }));
    }

    async getDbtSourceBindings(
        projectUuid: string,
    ): Promise<DbtSourceBindings> {
        const project = await this.database('projects')
            .select<{ connection_mode: string }[]>('connection_mode')
            .where('project_uuid', projectUuid)
            .first();
        if (!project) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
        if (project.connection_mode !== 'multi') {
            throw new SingleConnectionProjectError();
        }
        const [connections, sources] = await Promise.all([
            this.getCompileConnections(projectUuid),
            this.database<DbDbtSourceBinding>(DBT_SOURCES_TABLE)
                .select('project_dbt_source_uuid', 'warehouse_connection_uuid')
                .where('project_uuid', projectUuid)
                .orderBy('precedence'),
        ]);
        return {
            connections: connections.map(
                ({ warehouseConnectionUuid, name, isOriginal }) => ({
                    warehouseConnectionUuid,
                    name,
                    isOriginal,
                }),
            ),
            sources: sources.map((source) => ({
                projectDbtSourceUuid: source.project_dbt_source_uuid,
                warehouseConnectionUuid: source.warehouse_connection_uuid,
            })),
        };
    }

    async getCatalogCache(
        projectUuid: string,
        warehouseConnectionUuid: string,
    ): Promise<WarehouseCatalog | undefined> {
        const row = await this.database(CATALOG_CACHE_TABLE)
            .innerJoin(
                WAREHOUSE_CONNECTIONS_TABLE,
                `${WAREHOUSE_CONNECTIONS_TABLE}.warehouse_connection_uuid`,
                `${CATALOG_CACHE_TABLE}.warehouse_connection_uuid`,
            )
            .select<{ warehouse: WarehouseCatalog }[]>(
                `${CATALOG_CACHE_TABLE}.warehouse`,
            )
            .where(`${WAREHOUSE_CONNECTIONS_TABLE}.project_uuid`, projectUuid)
            .where(
                `${CATALOG_CACHE_TABLE}.warehouse_connection_uuid`,
                warehouseConnectionUuid,
            )
            .first();
        return row?.warehouse;
    }

    private async assertConnectionInProject(
        database: Knex,
        projectUuid: string,
        warehouseConnectionUuid: string,
    ): Promise<{ isOriginal: boolean }> {
        const row = await database<DbCompileConnection>(
            WAREHOUSE_CONNECTIONS_TABLE,
        )
            .select('is_original')
            .where('project_uuid', projectUuid)
            .where('warehouse_connection_uuid', warehouseConnectionUuid)
            .first();
        if (!row) {
            throw new NotFoundError('Connection not found');
        }
        return { isOriginal: row.is_original };
    }

    async saveCompileArtifacts(
        projectUuid: string,
        warehouseConnectionUuid: string,
        artifacts: {
            manifest: Buffer | null;
            catalog: WarehouseCatalog | null;
        },
    ): Promise<void> {
        await this.assertConnectionInProject(
            this.database,
            projectUuid,
            warehouseConnectionUuid,
        );
        if (artifacts.manifest !== null) {
            await this.database(MANIFESTS_TABLE)
                .insert({
                    warehouse_connection_uuid: warehouseConnectionUuid,
                    manifest: artifacts.manifest,
                    created_at: this.database.fn.now(),
                })
                .onConflict('warehouse_connection_uuid')
                .merge(['manifest', 'created_at']);
        } else {
            await this.database(MANIFESTS_TABLE)
                .where('warehouse_connection_uuid', warehouseConnectionUuid)
                .delete();
        }
        if (artifacts.catalog !== null) {
            await this.database(CATALOG_CACHE_TABLE)
                .insert({
                    warehouse_connection_uuid: warehouseConnectionUuid,
                    warehouse: JSON.stringify(artifacts.catalog),
                    created_at: this.database.fn.now(),
                })
                .onConflict('warehouse_connection_uuid')
                .merge(['warehouse', 'created_at']);
        }
    }

    async bindDbtSource(
        projectUuid: string,
        projectDbtSourceUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const project = await trx('projects')
                .select<{ connection_mode: string }[]>('connection_mode')
                .where('project_uuid', projectUuid)
                .forUpdate()
                .first();
            if (!project) {
                throw new NotFoundError(
                    `Cannot find project with id: ${projectUuid}`,
                );
            }
            if (project.connection_mode !== 'multi') {
                throw new SingleConnectionProjectError();
            }
            const binding =
                warehouseConnectionUuid === null ||
                (
                    await this.assertConnectionInProject(
                        trx,
                        projectUuid,
                        warehouseConnectionUuid,
                    )
                ).isOriginal
                    ? null
                    : warehouseConnectionUuid;
            const updated = await trx<DbDbtSourceBinding>(DBT_SOURCES_TABLE)
                .where('project_uuid', projectUuid)
                .where('project_dbt_source_uuid', projectDbtSourceUuid)
                .update({
                    warehouse_connection_uuid: binding,
                    updated_at: new Date(),
                });
            if (updated === 0) {
                throw new NotFoundError(
                    `Cannot find dbt source with id: ${projectDbtSourceUuid}`,
                );
            }
        });
    }
}
