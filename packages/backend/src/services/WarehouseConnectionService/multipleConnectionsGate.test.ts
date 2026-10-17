import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import {
    getMultipleConnectionsBlockReason,
    ROLLOUT_REASON,
    WAREHOUSE_TYPE_REASON,
} from './multipleConnectionsGate';

const account = fromSession(defaultSessionUser, 'session-cookie');

describe('multiple connections gate', () => {
    it.each([true, false])(
        'keeps the rollout gate for a Trino primary with mixed types enabled and rollout %s',
        async (enabled) => {
            const featureFlagService = {
                get: vi
                    .fn<FeatureFlagService['get']>()
                    .mockImplementation(async ({ featureFlagId }) => ({
                        id: featureFlagId,
                        enabled:
                            featureFlagId ===
                            FeatureFlags.MixedWarehouseConnections
                                ? true
                                : enabled,
                    })),
            };
            const reason = await getMultipleConnectionsBlockReason(
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
                    originalWarehouseType: WarehouseTypes.TRINO,
                },
            );
            expect(reason).toBe(enabled ? null : ROLLOUT_REASON);
            expect(featureFlagService.get).toHaveBeenCalledWith({
                user: {
                    userUuid: account.user.userUuid,
                    organizationUuid: 'organization-uuid',
                },
                featureFlagId: FeatureFlags.MultiConnectionProjects,
            });
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
