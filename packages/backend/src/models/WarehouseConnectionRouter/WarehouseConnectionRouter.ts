import { NotImplementedError, type ConnectionRoute } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { type Knex } from 'knex';
import { DatabaseError } from 'pg';
import Logger from '../../logging/logger';

export type ConnectionBinding =
    | { kind: 'explore'; exploreName: string }
    | { kind: 'sqlChart'; savedSqlUuid: string }
    | { kind: 'connection'; warehouseConnectionUuid: string | null }
    | { kind: 'original' };

const UNDEFINED_COLUMN = '42703';

const isMissingConnectionModeColumn = (error: unknown): boolean =>
    error instanceof DatabaseError &&
    error.code === UNDEFINED_COLUMN &&
    error.message.includes('connection_mode');

export class WarehouseConnectionRouter {
    private readonly database: Knex;

    private connectionModeColumnMissing = false;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async withConnectionModeColumn<T>(
        run: (includeConnectionMode: boolean) => PromiseLike<T>,
    ): Promise<T> {
        if (this.connectionModeColumnMissing) return run(false);
        try {
            return await run(true);
        } catch (error) {
            if (!isMissingConnectionModeColumn(error)) throw error;
            this.connectionModeColumnMissing = true;
            Logger.warn(
                'projects.connection_mode is missing; every project routes single until the connection modes migration runs',
            );
            return run(false);
        }
    }

    async routeFor(
        projectUuid: string,
        connectionMode: string | undefined,
    ): Promise<ConnectionRoute> {
        if (connectionMode !== 'multi') return 'single';
        const extraConnection = await this.database('warehouse_connections')
            .select('warehouse_connection_uuid')
            .where('project_uuid', projectUuid)
            .where('is_original', false)
            .first();
        return extraConnection ? 'multi' : 'single';
    }

    async getRoute(projectUuid: string): Promise<ConnectionRoute> {
        const connectionMode = await this.withConnectionModeColumn(
            async (includeConnectionMode) => {
                if (!includeConnectionMode) return undefined;
                const project = await this.database('projects')
                    .select<{ connection_mode: string }[]>('connection_mode')
                    .where('project_uuid', projectUuid)
                    .first();
                return project?.connection_mode;
            },
        );
        return this.routeFor(projectUuid, connectionMode);
    }

    async requireSingleRoute(
        projectUuid: string,
        binding: ConnectionBinding,
    ): Promise<ConnectionRoute> {
        const route = await this.getRoute(projectUuid);
        Sentry.setTag('warehouse.route', route);
        Sentry.setTag('warehouse.binding_kind', binding.kind);
        Sentry.getActiveSpan()?.setAttributes({
            'warehouse.route': route,
            'warehouse.binding_kind': binding.kind,
        });
        if (route === 'multi') {
            throw new NotImplementedError(
                'Multiple connections are not available',
            );
        }
        return route;
    }
}
