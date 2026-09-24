import {
    assertUnreachable,
    NotFoundError,
    NotImplementedError,
    type ConnectionRoute,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { type Knex } from 'knex';
import { DatabaseError } from 'pg';
import { validate as isUuid } from 'uuid';
import Logger from '../../logging/logger';

export type ConnectionBinding =
    | { kind: 'explore'; exploreName: string }
    | { kind: 'sqlChart'; savedSqlUuid: string }
    | { kind: 'connection'; warehouseConnectionUuid: string | null }
    | { kind: 'original' };

export type CredentialReadTarget =
    | { kind: 'original' }
    | { kind: 'extra'; warehouseConnectionUuid: string };

const ORIGINAL_CONNECTION: CredentialReadTarget = { kind: 'original' };

const UNDEFINED_COLUMN = '42703';

const MISSING_CONNECTION_MODE_COLUMN =
    /column (?:"?\w+"?\.)?"?connection_mode"? does not exist/;

const isMissingConnectionModeColumn = (error: unknown): boolean =>
    error instanceof DatabaseError &&
    error.code === UNDEFINED_COLUMN &&
    MISSING_CONNECTION_MODE_COLUMN.test(error.message);

export class WarehouseConnectionRouter {
    private readonly database: Knex;

    private hasWarnedMissingColumn = false;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async withConnectionModeColumn<T>(
        run: (includeConnectionMode: boolean) => PromiseLike<T>,
    ): Promise<T> {
        try {
            return await run(true);
        } catch (error) {
            if (!isMissingConnectionModeColumn(error)) throw error;
            if (!this.hasWarnedMissingColumn) {
                this.hasWarnedMissingColumn = true;
                Logger.warn(
                    'projects.connection_mode is missing; projects route single until the connection modes migration runs',
                );
            }
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

    async resolveCredentialRead(
        projectUuid: string,
        binding: ConnectionBinding,
    ): Promise<CredentialReadTarget> {
        const route = await this.getRoute(projectUuid);
        Sentry.setTag('warehouse.route', route);
        Sentry.setTag('warehouse.binding_kind', binding.kind);
        Sentry.getActiveSpan()?.setAttributes({
            'warehouse.route': route,
            'warehouse.binding_kind': binding.kind,
        });
        if (route === 'single') return ORIGINAL_CONNECTION;
        switch (binding.kind) {
            case 'original':
                return ORIGINAL_CONNECTION;
            case 'connection':
                return this.resolveConnectionBinding(
                    projectUuid,
                    binding.warehouseConnectionUuid,
                );
            case 'explore':
                return this.resolveExploreBinding(
                    projectUuid,
                    binding.exploreName,
                );
            case 'sqlChart':
                throw new NotImplementedError(
                    'Multiple connections are not available',
                );
            default:
                return assertUnreachable(binding, 'Unknown connection binding');
        }
    }

    private async resolveExploreBinding(
        projectUuid: string,
        exploreName: string,
    ): Promise<CredentialReadTarget> {
        const explore = await this.database('cached_explore')
            .select<{ warehouse_connection_uuid: string | null }[]>(
                'warehouse_connection_uuid',
            )
            .where('project_uuid', projectUuid)
            .where('name', exploreName)
            .first();
        if (!explore) throw new NotFoundError('Explore not found');
        return this.resolveConnectionBinding(
            projectUuid,
            explore.warehouse_connection_uuid,
        );
    }

    private async resolveConnectionBinding(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<CredentialReadTarget> {
        if (warehouseConnectionUuid === null) return ORIGINAL_CONNECTION;
        if (!isUuid(warehouseConnectionUuid)) {
            throw new NotFoundError('Connection not found');
        }
        const connection = await this.database('warehouse_connections')
            .select<{ is_original: boolean }[]>('is_original')
            .where('warehouse_connection_uuid', warehouseConnectionUuid)
            .where('project_uuid', projectUuid)
            .first();
        if (!connection) throw new NotFoundError('Connection not found');
        return connection.is_original
            ? ORIGINAL_CONNECTION
            : { kind: 'extra', warehouseConnectionUuid };
    }
}
