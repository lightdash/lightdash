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
import { WarehouseConnectionIdentityModel } from '../WarehouseConnectionIdentityModel/WarehouseConnectionIdentityModel';

export type ConnectionBinding =
    | { kind: 'explore'; exploreName: string }
    | { kind: 'sqlChart'; savedSqlUuid: string }
    | { kind: 'query'; queryUuid: string }
    | { kind: 'connection'; warehouseConnectionUuid: string | null }
    | { kind: 'original' };

export type CredentialReadTarget =
    | { kind: 'original' }
    | { kind: 'extra'; warehouseConnectionUuid: string };

export type ConnectionRouteWithOriginal = {
    route: ConnectionRoute;
    originalWarehouseConnectionUuid: string | null;
};

export type ResolvedCredentialRead = ConnectionRouteWithOriginal & {
    target: CredentialReadTarget;
};

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

    private readonly identityModel: WarehouseConnectionIdentityModel;

    private hasWarnedMissingColumn = false;

    constructor({ database }: { database: Knex }) {
        this.database = database;
        this.identityModel = new WarehouseConnectionIdentityModel({
            database,
        });
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

    private async routeWithOriginalFor(
        projectUuid: string,
        connectionMode: string | undefined,
    ): Promise<ConnectionRouteWithOriginal> {
        if (connectionMode !== 'multi') {
            return { route: 'single', originalWarehouseConnectionUuid: null };
        }
        const connections = await this.database('warehouse_connections')
            .select<
                { warehouse_connection_uuid: string; is_original: boolean }[]
            >('warehouse_connection_uuid', 'is_original')
            .where('project_uuid', projectUuid);
        const original = connections.find(
            (connection) => connection.is_original,
        );
        return {
            route: connections.some((connection) => !connection.is_original)
                ? 'multi'
                : 'single',
            originalWarehouseConnectionUuid:
                original?.warehouse_connection_uuid ?? null,
        };
    }

    async routeFor(
        projectUuid: string,
        connectionMode: string | undefined,
    ): Promise<ConnectionRoute> {
        return (await this.routeWithOriginalFor(projectUuid, connectionMode))
            .route;
    }

    async getRouteWithOriginal(
        projectUuid: string,
    ): Promise<ConnectionRouteWithOriginal> {
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
        return this.routeWithOriginalFor(projectUuid, connectionMode);
    }

    async getRoute(projectUuid: string): Promise<ConnectionRoute> {
        return (await this.getRouteWithOriginal(projectUuid)).route;
    }

    async getTaggedRoute(
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
        return route;
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
        return (await this.resolveCredentialReadWithRoute(projectUuid, binding))
            .target;
    }

    async resolveCredentialReadWithRoute(
        projectUuid: string,
        binding: ConnectionBinding,
    ): Promise<ResolvedCredentialRead> {
        const { route, originalWarehouseConnectionUuid } =
            await this.getRouteWithOriginal(projectUuid);
        Sentry.setTag('warehouse.route', route);
        Sentry.setTag('warehouse.binding_kind', binding.kind);
        Sentry.getActiveSpan()?.setAttributes({
            'warehouse.route': route,
            'warehouse.binding_kind': binding.kind,
        });
        if (route === 'single') {
            return {
                route,
                target: ORIGINAL_CONNECTION,
                originalWarehouseConnectionUuid,
            };
        }
        let target: CredentialReadTarget;
        switch (binding.kind) {
            case 'original':
                target = ORIGINAL_CONNECTION;
                break;
            case 'connection':
                target = await this.resolveConnectionBinding(
                    projectUuid,
                    binding.warehouseConnectionUuid,
                );
                break;
            case 'explore':
                target = await this.resolveExploreBinding(
                    projectUuid,
                    binding.exploreName,
                );
                break;
            case 'sqlChart':
                target = await this.resolveConnectionBinding(
                    projectUuid,
                    await this.identityModel.getSqlChartWarehouseConnectionUuid(
                        projectUuid,
                        binding.savedSqlUuid,
                    ),
                );
                break;
            case 'query':
                target = await this.resolveConnectionBinding(
                    projectUuid,
                    await this.identityModel.getQueryWarehouseConnectionUuid(
                        projectUuid,
                        binding.queryUuid,
                    ),
                );
                break;
            default:
                return assertUnreachable(binding, 'Unknown connection binding');
        }
        return { route, target, originalWarehouseConnectionUuid };
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
