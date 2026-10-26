import { CommercialFeatureFlags, ForbiddenError } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { parseConfig, type LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { CommercialFeatureFlagModel } from '../models/CommercialFeatureFlagModel';
import {
    assertScimEnabled,
    isScimEnabled,
    SCIM_NOT_ENABLED_MESSAGE,
} from './scimFeatureFlag';

const database = knex({ client: MockClient, dialect: 'pg' });

const ORG_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const buildFeatureFlagService = (
    config: Partial<LightdashConfig> = {},
): FeatureFlagService => {
    const lightdashConfig: LightdashConfig = {
        ...lightdashConfigMock,
        enabledFeatureFlags: new Set<string>(),
        disabledFeatureFlags: new Set<string>(),
        previewFeatureFlags: { enabled: false },
        ...config,
    };
    return new FeatureFlagService({
        lightdashConfig,
        featureFlagModel: new CommercialFeatureFlagModel({
            database,
            lightdashConfig,
        }),
    });
};

// Runs the real env parser so the self-host path is covered end to end.
const parseFlagEnv = (
    env: Record<string, string>,
): Pick<LightdashConfig, 'enabledFeatureFlags' | 'disabledFeatureFlags'> => {
    const originalEnv = process.env;
    process.env = {
        LIGHTDASH_SECRET: 'not very secret',
        S3_ENDPOINT: 'mock_endpoint',
        S3_BUCKET: 'mock_bucket',
        S3_REGION: 'mock_region',
        ...env,
    };
    try {
        const { enabledFeatureFlags, disabledFeatureFlags } = parseConfig();
        return { enabledFeatureFlags, disabledFeatureFlags };
    } finally {
        process.env = originalEnv;
    }
};

const mockScimRows = (
    tracker: Tracker,
    orgOverride: { organizationUuid: string; enabled: boolean } | undefined,
) => {
    tracker.on.select('feature_flags').response({
        flag_id: CommercialFeatureFlags.Scim,
        default_enabled: null,
    });
    tracker.on
        .select(
            ({ sql, bindings }) =>
                sql.includes('feature_flag_overrides') &&
                orgOverride !== undefined &&
                bindings.includes(orgOverride.organizationUuid),
        )
        .response(
            orgOverride && {
                flag_id: CommercialFeatureFlags.Scim,
                organization_uuid: orgOverride.organizationUuid,
                user_uuid: null,
                enabled: orgOverride.enabled,
            },
        );
    tracker.on.select('feature_flag_overrides').response(undefined);
};

describe('SCIM billing flag', () => {
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('is off without database or ENV configuration', async () => {
        mockScimRows(tracker, undefined);
        const service = buildFeatureFlagService();

        await expect(isScimEnabled(service, ORG_UUID)).resolves.toBe(false);
        await expect(assertScimEnabled(service, ORG_UUID)).rejects.toThrow(
            new ForbiddenError(SCIM_NOT_ENABLED_MESSAGE),
        );
    });

    it('is off when the flag row does not exist', async () => {
        tracker.on.select('feature_flags').response(undefined);
        const service = buildFeatureFlagService();

        await expect(isScimEnabled(service, ORG_UUID)).resolves.toBe(false);
    });

    it('is off without an organization', async () => {
        const service = buildFeatureFlagService({
            enabledFeatureFlags: new Set([CommercialFeatureFlags.Scim]),
        });

        await expect(assertScimEnabled(service, undefined)).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('is on for an organization the Console enabled in the database', async () => {
        mockScimRows(tracker, { organizationUuid: ORG_UUID, enabled: true });
        const service = buildFeatureFlagService();

        await expect(isScimEnabled(service, ORG_UUID)).resolves.toBe(true);
        await expect(
            assertScimEnabled(service, ORG_UUID),
        ).resolves.toBeUndefined();
    });

    it('stays off for other organizations when one organization is enabled', async () => {
        mockScimRows(tracker, { organizationUuid: ORG_UUID, enabled: true });
        const service = buildFeatureFlagService();

        await expect(isScimEnabled(service, OTHER_ORG_UUID)).resolves.toBe(
            false,
        );
    });

    it('is off for an organization the Console disabled in the database', async () => {
        mockScimRows(tracker, { organizationUuid: ORG_UUID, enabled: false });
        const service = buildFeatureFlagService();

        await expect(isScimEnabled(service, ORG_UUID)).resolves.toBe(false);
    });

    it('is on through LIGHTDASH_ENABLE_FEATURE_FLAGS without a database row', async () => {
        const service = buildFeatureFlagService(
            parseFlagEnv({
                LIGHTDASH_ENABLE_FEATURE_FLAGS: 'scim-token-management',
            }),
        );

        await expect(isScimEnabled(service, ORG_UUID)).resolves.toBe(true);
        expect(tracker.history.select).toHaveLength(0);
    });

    it('is on through the legacy SCIM_ENABLED env var without a database row', async () => {
        const service = buildFeatureFlagService(
            parseFlagEnv({ SCIM_ENABLED: 'true' }),
        );

        await expect(isScimEnabled(service, ORG_UUID)).resolves.toBe(true);
        expect(tracker.history.select).toHaveLength(0);
    });

    it('is off through LIGHTDASH_DISABLE_FEATURE_FLAGS even when the Console enabled it', async () => {
        mockScimRows(tracker, { organizationUuid: ORG_UUID, enabled: true });
        const service = buildFeatureFlagService(
            parseFlagEnv({
                LIGHTDASH_DISABLE_FEATURE_FLAGS: 'scim-token-management',
            }),
        );

        await expect(isScimEnabled(service, ORG_UUID)).resolves.toBe(false);
    });

    it('ignores user overrides', async () => {
        mockScimRows(tracker, undefined);
        const service = buildFeatureFlagService();

        await isScimEnabled(service, ORG_UUID);

        const overrideQueries = tracker.history.select.filter(({ sql }) =>
            sql.includes('feature_flag_overrides'),
        );
        expect(overrideQueries).toHaveLength(1);
        expect(overrideQueries[0].sql).not.toContain('user_uuid" =');
    });
});
