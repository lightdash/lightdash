import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import { type Knex } from 'knex';
import { describe, expect, it, vi } from 'vitest';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import {
    ENTITLEMENT_REASON,
    getMultipleConnectionsBlockReason,
    ROLLOUT_REASON,
    WAREHOUSE_TYPE_REASON,
} from './multipleConnectionsGate';

const account = fromSession(defaultSessionUser, 'session-cookie');

const flagService = (multiConnectionProjectsEnabled: boolean) => ({
    get: vi
        .fn<FeatureFlagService['get']>()
        .mockImplementation(async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled:
                featureFlagId === FeatureFlags.MultiConnectionProjects &&
                multiConnectionProjectsEnabled,
        })),
});

const gate = (
    featureFlagService: Pick<FeatureFlagService, 'get'>,
    licensed: boolean,
    originalWarehouseType: WarehouseTypes | null,
) =>
    getMultipleConnectionsBlockReason(
        {
            featureFlagService,
            licenseService: {
                canHoldMultipleConnections: vi.fn().mockReturnValue(licensed),
            },
        },
        account,
        { organizationUuid: 'organization-uuid', originalWarehouseType },
    );

const envFlagModel = (flags: { enabled: string[]; disabled: string[] }) =>
    new FeatureFlagModel({
        database: (() => {
            throw new Error('no database in this test');
        }) as unknown as Knex,
        lightdashConfig: {
            ...lightdashConfigMock,
            previewFeatureFlags: { enabled: false },
            enabledFeatureFlags: new Set(flags.enabled),
            disabledFeatureFlags: new Set(flags.disabled),
        } as LightdashConfig,
    });

describe('multiple connections gate', () => {
    it.each(Object.values(WarehouseTypes))(
        'allows a %s primary with the multi flag on and the licence',
        async (type) => {
            expect(await gate(flagService(true), true, type)).toBe(null);
        },
    );
    it('reads only the multi-connection flag', async () => {
        const featureFlagService = flagService(true);
        await gate(featureFlagService, true, WarehouseTypes.TRINO);
        expect(featureFlagService.get).toHaveBeenCalledTimes(1);
        expect(featureFlagService.get).toHaveBeenCalledWith({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: 'organization-uuid',
            },
            featureFlagId: FeatureFlags.MultiConnectionProjects,
        });
    });
    it('refuses with the multi flag off', async () => {
        expect(
            await gate(flagService(false), true, WarehouseTypes.POSTGRES),
        ).toBe(ROLLOUT_REASON);
        expect(await gate(flagService(false), true, WarehouseTypes.TRINO)).toBe(
            ROLLOUT_REASON,
        );
    });
    it.each([
        { type: WarehouseTypes.POSTGRES, multi: true },
        { type: WarehouseTypes.TRINO, multi: true },
        { type: WarehouseTypes.TRINO, multi: false },
    ])(
        'requires the licence first for a $type primary with the multi flag $multi',
        async ({ type, multi }) => {
            const featureFlagService = flagService(multi);
            expect(await gate(featureFlagService, false, type)).toBe(
                ENTITLEMENT_REASON,
            );
            expect(featureFlagService.get).not.toHaveBeenCalled();
        },
    );
    it('refuses when LIGHTDASH_DISABLE_FEATURE_FLAGS lists the multi flag', async () => {
        const killed = envFlagModel({
            enabled: [],
            disabled: [FeatureFlags.MultiConnectionProjects],
        });
        expect(await gate(killed, true, WarehouseTypes.POSTGRES)).toBe(
            ROLLOUT_REASON,
        );
        expect(await gate(killed, true, WarehouseTypes.TRINO)).toBe(
            ROLLOUT_REASON,
        );
    });
    it('allows a Trino primary when LIGHTDASH_ENABLE_FEATURE_FLAGS lists the multi flag', async () => {
        const enabled = envFlagModel({
            enabled: [FeatureFlags.MultiConnectionProjects],
            disabled: [],
        });
        expect(await gate(enabled, true, WarehouseTypes.TRINO)).toBe(null);
    });
    it('refuses a missing original connection before resolving the flag', async () => {
        const featureFlagService = flagService(true);
        expect(await gate(featureFlagService, true, null)).toBe(
            WAREHOUSE_TYPE_REASON,
        );
        expect(featureFlagService.get).not.toHaveBeenCalled();
    });
});
