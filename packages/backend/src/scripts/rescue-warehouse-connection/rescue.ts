import { NotFoundError, ParameterError } from '@lightdash/common';
import { type Knex } from 'knex';
import { WarehouseConnectionRouter } from '../../models/WarehouseConnectionRouter/WarehouseConnectionRouter';

export type RescueWarehouseConnectionArgs = {
    projectUuid: string;
    warehouseConnectionUuid: string;
    engineer: string;
    ticket: string;
    execute: boolean;
};

export type RescueWarehouseConnectionCounts = {
    explores: number;
    dbtSources: number;
    sqlChartVersions: number;
    userCredentialPreferences: number;
};

export type RescueWarehouseConnectionReport = {
    executed: boolean;
    connectionName: string;
    counts: RescueWarehouseConnectionCounts;
    routeAfter: 'single' | 'multi';
};

const count = async (query: Knex.QueryBuilder): Promise<number> => {
    const [row] = await query.count<{ count: string }[]>({ count: '*' });
    return Number(row?.count ?? 0);
};

export const rescueWarehouseConnection = async (
    database: Knex,
    args: RescueWarehouseConnectionArgs,
): Promise<RescueWarehouseConnectionReport> => {
    const engineer = args.engineer.trim();
    const ticket = args.ticket.trim();
    if (engineer.length === 0 || ticket.length === 0) {
        throw new ParameterError('Name the engineer and the ticket');
    }
    return database.transaction(async (transaction) => {
        const project = await transaction('projects')
            .select('project_uuid')
            .where('project_uuid', args.projectUuid)
            .forNoKeyUpdate()
            .first();
        if (!project) {
            throw new NotFoundError(
                `Cannot find project with id: ${args.projectUuid}`,
            );
        }
        const connection = await transaction('warehouse_connections')
            .select<{ name: string }[]>('name')
            .where('project_uuid', args.projectUuid)
            .where('warehouse_connection_uuid', args.warehouseConnectionUuid)
            .where('is_original', false)
            .first();
        if (!connection) {
            throw new NotFoundError(
                'The project has no extra connection with this uuid',
            );
        }
        const bound = (table: string) =>
            transaction(table).where(
                'warehouse_connection_uuid',
                args.warehouseConnectionUuid,
            );
        const counts: RescueWarehouseConnectionCounts = {
            explores: await count(
                bound('cached_explore').where('project_uuid', args.projectUuid),
            ),
            dbtSources: await count(
                bound('project_dbt_sources').where(
                    'project_uuid',
                    args.projectUuid,
                ),
            ),
            sqlChartVersions: await count(bound('saved_sql_versions')),
            userCredentialPreferences: await count(
                bound('warehouse_connection_user_credentials_preference'),
            ),
        };
        if (!args.execute) {
            return {
                executed: false,
                connectionName: connection.name,
                counts,
                routeAfter: await new WarehouseConnectionRouter({
                    database: transaction,
                }).getRoute(args.projectUuid),
            };
        }
        await bound('saved_sql_versions').update({
            warehouse_connection_uuid: null,
        });
        await bound('project_dbt_sources')
            .where('project_uuid', args.projectUuid)
            .update({ warehouse_connection_uuid: null });
        await bound('cached_explore')
            .where('project_uuid', args.projectUuid)
            .delete();
        await transaction('warehouse_connections')
            .where('project_uuid', args.projectUuid)
            .where('warehouse_connection_uuid', args.warehouseConnectionUuid)
            .where('is_original', false)
            .delete();
        await transaction('project_connection_mode_events').insert({
            project_uuid: args.projectUuid,
            actor_user_uuid: null,
            event: 'rescued_by_engineering',
            plan: JSON.stringify({
                warehouseConnectionUuid: args.warehouseConnectionUuid,
                connectionName: connection.name,
                engineer,
                ticket,
                counts,
            }),
        });
        return {
            executed: true,
            connectionName: connection.name,
            counts,
            routeAfter: await new WarehouseConnectionRouter({
                database: transaction,
            }).getRoute(args.projectUuid),
        };
    });
};
