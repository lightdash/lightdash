import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import {
    ENTITLEMENT_REASON,
    getMultipleConnectionsBlockReason,
    ROLLOUT_REASON,
    WAREHOUSE_TYPE_REASON,
} from './multipleConnectionsGate';

const account = fromSession(defaultSessionUser, 'session-cookie');

describe('multiple connections gate', () => {
    const flagService = (flags: { multi: boolean; mixed: boolean }) => ({
        get: vi
            .fn<FeatureFlagService['get']>()
            .mockImplementation(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled:
                    featureFlagId === FeatureFlags.MixedWarehouseConnections
                        ? flags.mixed
                        : flags.multi,
            })),
    });
    const gate = (
        flags: { multi: boolean; mixed: boolean },
        licensed: boolean,
        originalWarehouseType: WarehouseTypes,
    ) =>
        getMultipleConnectionsBlockReason(
            {
                featureFlagService: flagService(flags),
                licenseService: {
                    canHoldMultipleConnections: vi
                        .fn()
                        .mockReturnValue(licensed),
                },
            },
            account,
            { organizationUuid: 'organization-uuid', originalWarehouseType },
        );

    it.each([WarehouseTypes.POSTGRES, WarehouseTypes.TRINO])(
        'enables extra connections for a %s primary with only the mixed flag',
        async (type) => {
            expect(await gate({ multi: false, mixed: true }, true, type)).toBe(
                null,
            );
        },
    );
    it('keeps the multi flag alone limited to same-type warehouses', async () => {
        expect(
            await gate(
                { multi: true, mixed: false },
                true,
                WarehouseTypes.POSTGRES,
            ),
        ).toBe(null);
        expect(
            await gate(
                { multi: true, mixed: false },
                true,
                WarehouseTypes.TRINO,
            ),
        ).toBe(WAREHOUSE_TYPE_REASON);
    });
    it('refuses extra connections when neither flag is enabled', async () => {
        expect(
            await gate(
                { multi: false, mixed: false },
                true,
                WarehouseTypes.POSTGRES,
            ),
        ).toBe(ROLLOUT_REASON);
    });
    it.each([
        { multi: true, mixed: false },
        { multi: false, mixed: true },
        { multi: true, mixed: true },
    ])(
        'requires the licence with multi $multi and mixed $mixed',
        async (flags) => {
            expect(await gate(flags, false, WarehouseTypes.POSTGRES)).toBe(
                ENTITLEMENT_REASON,
            );
        },
    );
    it('refuses a missing original connection before resolving rollout flags', async () => {
        const featureFlagService = { get: vi.fn<FeatureFlagService['get']>() };
        expect(
            await getMultipleConnectionsBlockReason(
                {
                    featureFlagService,
                    licenseService: {
                        canHoldMultipleConnections: vi
                            .fn()
                            .mockReturnValue(true),
                    },
                },
                account,
                {
                    organizationUuid: 'organization-uuid',
                    originalWarehouseType: null,
                },
            ),
        ).toBe(WAREHOUSE_TYPE_REASON);
        expect(featureFlagService.get).not.toHaveBeenCalled();
        expect(WAREHOUSE_TYPE_REASON).toBe(
            'Multiple connections are supported for Postgres, Athena, and Snowflake projects only.',
        );
    });
});

describe('multiple connections original type matrix', () => {
    it.each(
        Object.values(WarehouseTypes).flatMap((type) =>
            [false, true].map((enabled) => ({ type, enabled })),
        ),
    )('gates $type with mixed types $enabled', async ({ type, enabled }) => {
        const reason = await getMultipleConnectionsBlockReason(
            {
                featureFlagService: {
                    get: vi
                        .fn<FeatureFlagService['get']>()
                        .mockImplementation(async ({ featureFlagId }) => ({
                            id: featureFlagId,
                            enabled:
                                featureFlagId ===
                                FeatureFlags.MixedWarehouseConnections
                                    ? enabled
                                    : true,
                        })),
                },
                licenseService: { canHoldMultipleConnections: () => true },
            },
            account,
            { organizationUuid: 'org', originalWarehouseType: type },
        );
        expect(reason).toBe(
            enabled ||
                [
                    WarehouseTypes.POSTGRES,
                    WarehouseTypes.ATHENA,
                    WarehouseTypes.SNOWFLAKE,
                ].includes(type)
                ? null
                : WAREHOUSE_TYPE_REASON,
        );
    });
});
