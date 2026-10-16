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
        'keeps the existing rollout gate for a Trino primary when enabled is %s',
        async (enabled) => {
            const featureFlagService = {
                get: vi.fn<FeatureFlagService['get']>().mockResolvedValue({
                    id: FeatureFlags.MultiConnectionProjects,
                    enabled,
                }),
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
    it('refuses BigQuery before resolving rollout flags', async () => {
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
                    originalWarehouseType: WarehouseTypes.BIGQUERY,
                },
            ),
        ).toBe(WAREHOUSE_TYPE_REASON);
        expect(featureFlagService.get).not.toHaveBeenCalled();
        expect(WAREHOUSE_TYPE_REASON).toContain('Trino');
    });
});
