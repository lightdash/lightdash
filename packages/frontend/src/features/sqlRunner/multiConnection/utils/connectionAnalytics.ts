import {
    type SqlRunnerWarehouseConnection,
    type WarehouseTypes,
} from '@lightdash/common';
import {
    type EventData,
    type SqlRunnerConnectionKind,
    type SqlRunnerShareLinkFailureReason,
} from '../../../../providers/Tracking/types';
import { type EventName } from '../../../../types/Events';

export type ConnectionAnalyticsProperties = {
    warehouseConnectionId: string | null;
    connectionKind: SqlRunnerConnectionKind | null;
    warehouseType: WarehouseTypes | null;
};

const connectionKindOf = (
    connection: Pick<SqlRunnerWarehouseConnection, 'isOriginal'>,
): SqlRunnerConnectionKind => (connection.isOriginal ? 'primary' : 'extra');

export const connectionAnalyticsProperties = (
    connection: SqlRunnerWarehouseConnection | undefined,
): ConnectionAnalyticsProperties =>
    connection
        ? {
              warehouseConnectionId: connection.warehouseConnectionUuid,
              connectionKind: connectionKindOf(connection),
              warehouseType: connection.warehouseType,
          }
        : {
              warehouseConnectionId: null,
              connectionKind: null,
              warehouseType: null,
          };

export const findConnectionByBinding = (
    connections: SqlRunnerWarehouseConnection[],
    binding: string | null,
): SqlRunnerWarehouseConnection | undefined =>
    connections.find((connection) =>
        binding === null
            ? connection.isOriginal
            : connection.warehouseConnectionUuid === binding,
    );

type ShareLinkOpenedProperties = Extract<
    EventData,
    { name: EventName.SQL_RUNNER_SHARE_LINK_OPENED }
>['properties'];

type ShareLinkOpenedInput = {
    organizationId: string | null;
    projectId: string;
    routesSingle: boolean;
    primaryWarehouseType: WarehouseTypes | null;
    sharedConnectionBinding: string | null | undefined;
    connections: SqlRunnerWarehouseConnection[] | undefined;
};

export const resolveSharedConnection = (
    connections: SqlRunnerWarehouseConnection[] | undefined,
    sharedConnectionBinding: string | null | undefined,
): SqlRunnerWarehouseConnection | undefined =>
    connections && sharedConnectionBinding !== undefined
        ? findConnectionByBinding(connections, sharedConnectionBinding)
        : undefined;

const shareLinkFailureReason = (
    connections: SqlRunnerWarehouseConnection[] | undefined,
    sharedConnectionBinding: string | null | undefined,
): SqlRunnerShareLinkFailureReason => {
    if (!connections) return 'connections_fetch_failed';
    if (sharedConnectionBinding === undefined) return 'connection_not_carried';
    return 'connection_not_found';
};

export const shareLinkOpenedProperties = ({
    organizationId,
    projectId,
    routesSingle,
    primaryWarehouseType,
    sharedConnectionBinding,
    connections,
}: ShareLinkOpenedInput): ShareLinkOpenedProperties => {
    const carriesConnection = sharedConnectionBinding !== undefined;
    if (routesSingle) {
        return {
            organizationId,
            projectId,
            connectionCount: 1,
            connectionRoute: 'single',
            carriesConnection,
            outcome: 'applied',
            failureReason: null,
            warehouseConnectionId: null,
            connectionKind: 'primary',
            warehouseType: primaryWarehouseType,
        };
    }
    const sharedConnection = resolveSharedConnection(
        connections,
        sharedConnectionBinding,
    );
    return {
        organizationId,
        projectId,
        connectionCount: connections?.length ?? null,
        connectionRoute: 'multi',
        carriesConnection,
        outcome: sharedConnection ? 'applied' : 'connection_unresolved',
        failureReason: sharedConnection
            ? null
            : shareLinkFailureReason(connections, sharedConnectionBinding),
        ...connectionAnalyticsProperties(sharedConnection),
        warehouseConnectionId:
            sharedConnection?.warehouseConnectionUuid ??
            sharedConnectionBinding ??
            null,
        connectionKind: sharedConnection
            ? connectionKindOf(sharedConnection)
            : sharedConnectionBinding === undefined
              ? null
              : sharedConnectionBinding === null
                ? 'primary'
                : 'extra',
    };
};

export const shareLinkLoadFailedProperties = ({
    organizationId,
    projectId,
    failureReason,
}: {
    organizationId: string | null;
    projectId: string | null;
    failureReason: SqlRunnerShareLinkFailureReason | null;
}): ShareLinkOpenedProperties => ({
    organizationId,
    projectId,
    connectionCount: null,
    connectionRoute: null,
    carriesConnection: false,
    outcome: 'load_failed',
    failureReason,
    ...connectionAnalyticsProperties(undefined),
});
