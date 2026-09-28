import {
    WarehouseTypes,
    type SqlRunnerWarehouseConnection,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    connectionAnalyticsProperties,
    shareLinkLoadFailedProperties,
    shareLinkOpenedProperties,
} from './connectionAnalytics';

const primary: SqlRunnerWarehouseConnection = {
    warehouseConnectionUuid: 'primary-uuid',
    name: 'Warehouse',
    isOriginal: true,
    warehouseType: WarehouseTypes.POSTGRES,
};
const finance: SqlRunnerWarehouseConnection = {
    warehouseConnectionUuid: 'finance-uuid',
    name: 'Finance',
    isOriginal: false,
    warehouseType: WarehouseTypes.SNOWFLAKE,
};

const multiInput = {
    organizationId: 'org-uuid',
    projectId: 'project-uuid',
    routesSingle: false,
    primaryWarehouseType: WarehouseTypes.POSTGRES,
    connections: [primary, finance],
};

describe('connectionAnalyticsProperties', () => {
    it('describes an extra connection without its name', () => {
        const properties = connectionAnalyticsProperties(finance);

        expect(properties).toEqual({
            warehouseConnectionId: 'finance-uuid',
            connectionKind: 'extra',
            warehouseType: WarehouseTypes.SNOWFLAKE,
        });
        expect(JSON.stringify(properties)).not.toContain('Finance');
    });

    it('sends explicit nulls when there is no connection', () => {
        expect(connectionAnalyticsProperties(undefined)).toEqual({
            warehouseConnectionId: null,
            connectionKind: null,
            warehouseType: null,
        });
    });
});

describe('shareLinkOpenedProperties', () => {
    it('reports a carried extra connection as applied', () => {
        expect(
            shareLinkOpenedProperties({
                ...multiInput,
                sharedConnectionBinding: 'finance-uuid',
            }),
        ).toEqual({
            organizationId: 'org-uuid',
            projectId: 'project-uuid',
            connectionCount: 2,
            connectionRoute: 'multi',
            carriesConnection: true,
            outcome: 'applied',
            failureReason: null,
            warehouseConnectionId: 'finance-uuid',
            connectionKind: 'extra',
            warehouseType: WarehouseTypes.SNOWFLAKE,
        });
    });

    it('resolves a null binding to the primary connection', () => {
        expect(
            shareLinkOpenedProperties({
                ...multiInput,
                sharedConnectionBinding: null,
            }),
        ).toMatchObject({
            outcome: 'applied',
            carriesConnection: true,
            warehouseConnectionId: 'primary-uuid',
            connectionKind: 'primary',
        });
    });

    it.each([
        ['removed-uuid', 'connection_not_found', true],
        [undefined, 'connection_not_carried', false],
    ] as const)(
        'reports binding %s as unresolved with %s',
        (sharedConnectionBinding, failureReason, carriesConnection) => {
            expect(
                shareLinkOpenedProperties({
                    ...multiInput,
                    sharedConnectionBinding,
                }),
            ).toEqual({
                organizationId: 'org-uuid',
                projectId: 'project-uuid',
                connectionCount: 2,
                connectionRoute: 'multi',
                carriesConnection,
                outcome: 'connection_unresolved',
                failureReason,
                warehouseConnectionId: sharedConnectionBinding ?? null,
                connectionKind:
                    sharedConnectionBinding === undefined ? null : 'extra',
                warehouseType: null,
            });
        },
    );

    it('reports a failed connection list with an unknown count', () => {
        expect(
            shareLinkOpenedProperties({
                ...multiInput,
                connections: undefined,
                sharedConnectionBinding: 'finance-uuid',
            }),
        ).toMatchObject({
            connectionCount: null,
            outcome: 'connection_unresolved',
            failureReason: 'connections_fetch_failed',
        });
    });

    it('applies a single-route project on its primary connection', () => {
        expect(
            shareLinkOpenedProperties({
                ...multiInput,
                routesSingle: true,
                connections: undefined,
                sharedConnectionBinding: 'finance-uuid',
            }),
        ).toEqual({
            organizationId: 'org-uuid',
            projectId: 'project-uuid',
            connectionCount: 1,
            connectionRoute: 'single',
            carriesConnection: true,
            outcome: 'applied',
            failureReason: null,
            warehouseConnectionId: null,
            connectionKind: 'primary',
            warehouseType: WarehouseTypes.POSTGRES,
        });
    });
});

describe('shareLinkLoadFailedProperties', () => {
    it('keeps the failure reason and nulls every connection key', () => {
        expect(
            shareLinkLoadFailedProperties({
                organizationId: 'org-uuid',
                projectId: null,
                failureReason: 'share_parse_failed',
            }),
        ).toEqual({
            organizationId: 'org-uuid',
            projectId: null,
            connectionCount: null,
            connectionRoute: null,
            carriesConnection: false,
            outcome: 'load_failed',
            failureReason: 'share_parse_failed',
            warehouseConnectionId: null,
            connectionKind: null,
            warehouseType: null,
        });
    });
});
