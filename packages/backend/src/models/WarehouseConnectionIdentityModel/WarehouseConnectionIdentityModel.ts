import {
    ConflictError,
    NotFoundError,
    ParameterError,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { type Knex } from 'knex';

const WAREHOUSE_CONNECTIONS_TABLE = 'warehouse_connections';
const EVENTS_TABLE = 'project_connection_mode_events';

type DbWarehouseConnectionCopy = {
    warehouse_connection_uuid: string;
    project_uuid: string;
    is_original: boolean;
    name: string;
    warehouse_type: string | null;
    encrypted_credentials: Buffer | null;
    organization_warehouse_credentials_uuid: string | null;
    list_all_databases: boolean;
    additional_databases: string[];
    created_by_user_uuid: string | null;
};

export type ExploreWithBinding = {
    explore: Explore | ExploreError;
    warehouseConnectionUuid: string | null;
};

export class WarehouseConnectionMap {
    private readonly previewUuids: ReadonlyMap<string, string>;

    private readonly upstreamNames: ReadonlyMap<string, string>;

    constructor(
        previewUuids: ReadonlyMap<string, string>,
        upstreamNames: ReadonlyMap<string, string>,
    ) {
        this.previewUuids = previewUuids;
        this.upstreamNames = upstreamNames;
    }

    get uuids(): ReadonlyMap<string, string> {
        return this.previewUuids;
    }

    remap(warehouseConnectionUuid: string | null): string | null {
        if (warehouseConnectionUuid === null) return null;
        const previewUuid = this.previewUuids.get(warehouseConnectionUuid);
        if (previewUuid === undefined) {
            const name = this.upstreamNames.get(warehouseConnectionUuid);
            throw new ParameterError(
                name === undefined
                    ? `The preview has no copy of connection ${warehouseConnectionUuid}`
                    : `The preview has no copy of connection '${name}'. Connections are matched by name, so renaming a connection on the upstream project or on the preview breaks this mapping.`,
            );
        }
        return previewUuid;
    }
}

export const remapRowBinding = <Row extends object>(
    row: Row,
    warehouseConnectionMap: WarehouseConnectionMap | null,
): Row => {
    if (warehouseConnectionMap === null) return row;
    const binding =
        (row as { warehouse_connection_uuid?: string | null })
            .warehouse_connection_uuid ?? null;
    return {
        ...row,
        warehouse_connection_uuid: warehouseConnectionMap.remap(binding),
    };
};

export class WarehouseConnectionIdentityModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private async assertConnectionInProject(
        projectUuid: string,
        warehouseConnectionUuid: string,
    ): Promise<void> {
        const connection = await this.database(WAREHOUSE_CONNECTIONS_TABLE)
            .where('project_uuid', projectUuid)
            .where('warehouse_connection_uuid', warehouseConnectionUuid)
            .first('warehouse_connection_uuid');
        if (!connection) {
            throw new NotFoundError('Connection not found');
        }
    }

    async getSqlChartWarehouseConnectionUuid(
        projectUuid: string,
        savedSqlUuid: string,
    ): Promise<string | null> {
        const latestVersion = await this.database('saved_sql_versions')
            .innerJoin(
                'saved_sql',
                'saved_sql.saved_sql_uuid',
                'saved_sql_versions.saved_sql_uuid',
            )
            .where('saved_sql.saved_sql_uuid', savedSqlUuid)
            .where('saved_sql.project_uuid', projectUuid)
            .orderBy([
                { column: 'saved_sql_versions.created_at', order: 'desc' },
                {
                    column: 'saved_sql_versions.saved_sql_version_uuid',
                    order: 'desc',
                },
            ])
            .first<{ warehouse_connection_uuid: string | null } | undefined>(
                'saved_sql_versions.warehouse_connection_uuid',
            );
        if (!latestVersion) {
            throw new NotFoundError('Saved sql not found');
        }
        if (latestVersion.warehouse_connection_uuid === null) return null;
        await this.assertConnectionInProject(
            projectUuid,
            latestVersion.warehouse_connection_uuid,
        );
        return latestVersion.warehouse_connection_uuid;
    }

    async getQueryWarehouseConnectionUuid(
        projectUuid: string,
        queryUuid: string,
    ): Promise<string | null> {
        const query = await this.database('query_history')
            .where('query_uuid', queryUuid)
            .where('project_uuid', projectUuid)
            .first<{ warehouse_connection_uuid: string | null } | undefined>(
                'warehouse_connection_uuid',
            );
        if (!query) {
            throw new NotFoundError(
                `Query ${queryUuid} not found in project ${projectUuid}`,
            );
        }
        const warehouseConnectionUuid = query.warehouse_connection_uuid;
        if (warehouseConnectionUuid === null) return null;
        const connection = await this.database(WAREHOUSE_CONNECTIONS_TABLE)
            .where('project_uuid', projectUuid)
            .where('warehouse_connection_uuid', warehouseConnectionUuid)
            .first('warehouse_connection_uuid');
        if (connection) return warehouseConnectionUuid;
        const removal = await this.database(EVENTS_TABLE)
            .where('project_uuid', projectUuid)
            .where('event', 'connection_removed')
            .whereRaw(`plan->>'warehouseConnectionUuid' = ?`, [
                warehouseConnectionUuid,
            ])
            .orderBy('created_at', 'desc')
            .first<{ name: string | null } | undefined>(
                this.database.raw(`plan->>'name' as name`),
            );
        if (removal?.name) {
            throw new NotFoundError(`Connection '${removal.name}' was removed`);
        }
        throw new NotFoundError('Connection not found');
    }

    async getExploresWithBindings(
        projectUuid: string,
    ): Promise<ExploreWithBinding[]> {
        const rows = await this.database('cached_explore')
            .where('project_uuid', projectUuid)
            .orderBy('name')
            .select<
                {
                    explore: Explore | ExploreError;
                    warehouse_connection_uuid: string | null;
                }[]
            >('explore', 'warehouse_connection_uuid');
        return rows.map((row) => ({
            explore: row.explore,
            warehouseConnectionUuid: row.warehouse_connection_uuid,
        }));
    }

    private async assertSameOrganization(
        transaction: Knex.Transaction,
        upstreamProjectUuid: string,
        previewProjectUuid: string,
    ): Promise<void> {
        const projects = await transaction('projects')
            .whereIn('project_uuid', [upstreamProjectUuid, previewProjectUuid])
            .select<{ project_uuid: string; organization_id: number }[]>(
                'project_uuid',
                'organization_id',
            );
        if (projects.length !== 2) {
            throw new NotFoundError('Project not found');
        }
        if (projects[0].organization_id !== projects[1].organization_id) {
            throw new ParameterError(
                'A preview must be in the same organization as its upstream project',
            );
        }
    }

    async copyConnectionsToPreview(
        upstreamProjectUuid: string,
        previewProjectUuid: string,
    ): Promise<WarehouseConnectionMap> {
        return this.database.transaction(async (transaction) => {
            await this.assertSameOrganization(
                transaction,
                upstreamProjectUuid,
                previewProjectUuid,
            );
            await transaction('projects')
                .where('project_uuid', previewProjectUuid)
                .forNoKeyUpdate()
                .first('project_uuid');
            const existing = await transaction(WAREHOUSE_CONNECTIONS_TABLE)
                .where('project_uuid', previewProjectUuid)
                .first('warehouse_connection_uuid');
            if (existing) {
                throw new ConflictError(
                    'The preview already has warehouse connections',
                );
            }
            const upstreamConnections =
                await transaction<DbWarehouseConnectionCopy>(
                    WAREHOUSE_CONNECTIONS_TABLE,
                )
                    .where('project_uuid', upstreamProjectUuid)
                    .orderBy([
                        { column: 'is_original', order: 'desc' },
                        { column: 'created_at', order: 'asc' },
                    ])
                    .select(
                        'warehouse_connection_uuid',
                        'project_uuid',
                        'is_original',
                        'name',
                        'warehouse_type',
                        'encrypted_credentials',
                        'organization_warehouse_credentials_uuid',
                        'list_all_databases',
                        'additional_databases',
                        'created_by_user_uuid',
                    );
            const previewUuids = new Map<string, string>();
            const upstreamNames = new Map<string, string>();
            await upstreamConnections.reduce<Promise<void>>(
                async (previous, connection) => {
                    await previous;
                    const [copy] = await transaction(
                        WAREHOUSE_CONNECTIONS_TABLE,
                    )
                        .insert({
                            project_uuid: previewProjectUuid,
                            is_original: connection.is_original,
                            name: connection.name,
                            warehouse_type: connection.warehouse_type,
                            encrypted_credentials:
                                connection.encrypted_credentials,
                            organization_warehouse_credentials_uuid:
                                connection.organization_warehouse_credentials_uuid,
                            list_all_databases: connection.list_all_databases,
                            additional_databases:
                                connection.additional_databases,
                            created_by_user_uuid:
                                connection.created_by_user_uuid,
                        })
                        .returning<{ warehouse_connection_uuid: string }[]>(
                            'warehouse_connection_uuid',
                        );
                    if (!connection.is_original) {
                        previewUuids.set(
                            connection.warehouse_connection_uuid,
                            copy.warehouse_connection_uuid,
                        );
                        upstreamNames.set(
                            connection.warehouse_connection_uuid,
                            connection.name,
                        );
                    }
                },
                Promise.resolve(),
            );
            if (previewUuids.size > 0) {
                await transaction.raw(
                    `UPDATE projects SET connection_mode = 'multi' WHERE project_uuid = ?`,
                    [previewProjectUuid],
                );
            }
            return new WarehouseConnectionMap(previewUuids, upstreamNames);
        });
    }

    async getPreviewConnectionMap(
        upstreamProjectUuid: string,
        previewProjectUuid: string,
    ): Promise<WarehouseConnectionMap> {
        const rows = await this.database(WAREHOUSE_CONNECTIONS_TABLE)
            .whereIn('project_uuid', [upstreamProjectUuid, previewProjectUuid])
            .where('is_original', false)
            .select<
                {
                    warehouse_connection_uuid: string;
                    project_uuid: string;
                    name: string;
                }[]
            >('warehouse_connection_uuid', 'project_uuid', 'name');
        const previewUuidByName = new Map(
            rows
                .filter((row) => row.project_uuid === previewProjectUuid)
                .map((row) => [row.name, row.warehouse_connection_uuid]),
        );
        const upstreamRows = rows.filter(
            (row) => row.project_uuid === upstreamProjectUuid,
        );
        const previewUuids = new Map<string, string>();
        upstreamRows.forEach((row) => {
            const previewUuid = previewUuidByName.get(row.name);
            if (previewUuid !== undefined) {
                previewUuids.set(row.warehouse_connection_uuid, previewUuid);
            }
        });
        return new WarehouseConnectionMap(
            previewUuids,
            new Map(
                upstreamRows.map((row) => [
                    row.warehouse_connection_uuid,
                    row.name,
                ]),
            ),
        );
    }
}
