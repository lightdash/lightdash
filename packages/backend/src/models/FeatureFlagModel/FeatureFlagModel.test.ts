import { FeatureFlags } from '@lightdash/common';
import { Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from './FeatureFlagModel';

// Minimal stub — tests below don't exercise the database layer
const databaseStub = {} as Knex;

const buildModel = (configOverrides: Partial<LightdashConfig> = {}) =>
    new FeatureFlagModel({
        database: databaseStub,
        lightdashConfig: {
            ...lightdashConfigMock,
            enabledFeatureFlags: new Set<string>(),
            ...configOverrides,
        } as LightdashConfig,
    });

describe('FeatureFlagModel', () => {
    describe('env var override', () => {
        it('returns enabled for any flag listed in LIGHTDASH_ENABLE_FEATURE_FLAGS', async () => {
            const model = buildModel({
                enabledFeatureFlags: new Set(['my-custom-flag']),
            });

            const result = await model.get({
                featureFlagId: 'my-custom-flag',
            });

            expect(result).toEqual({ id: 'my-custom-flag', enabled: true });
        });

        it('does not require a user for env var override', async () => {
            const model = buildModel({
                enabledFeatureFlags: new Set(['no-user-flag']),
            });

            const result = await model.get({
                featureFlagId: 'no-user-flag',
            });

            expect(result.enabled).toBe(true);
        });
    });

    describe('resolution priority', () => {
        it('env var override takes precedence over config handlers', async () => {
            const model = buildModel({
                enabledFeatureFlags: new Set([FeatureFlags.EditYamlInUi]),
                editYamlInUi: { enabled: false },
            });

            const result = await model.get({
                featureFlagId: FeatureFlags.EditYamlInUi,
            });

            expect(result.enabled).toBe(true);
        });

        it('env var override takes precedence over config handlers that default to true', async () => {
            const model = buildModel({
                enabledFeatureFlags: new Set([FeatureFlags.UserGroupsEnabled]),
                groups: { enabled: false },
            });

            const result = await model.get({
                featureFlagId: FeatureFlags.UserGroupsEnabled,
            });

            expect(result.enabled).toBe(true);
        });
    });

    describe('config handler resolution', () => {
        it('resolves config-driven flags without PostHog or DB', async () => {
            const model = buildModel({
                editYamlInUi: { enabled: true },
            });

            const result = await model.get({
                featureFlagId: FeatureFlags.EditYamlInUi,
            });

            expect(result).toEqual({
                id: FeatureFlags.EditYamlInUi,
                enabled: true,
            });
        });

        it('respects config disabled state', async () => {
            const model = buildModel({
                editYamlInUi: { enabled: false },
            });

            const result = await model.get({
                featureFlagId: FeatureFlags.EditYamlInUi,
            });

            expect(result.enabled).toBe(false);
        });
    });
});
