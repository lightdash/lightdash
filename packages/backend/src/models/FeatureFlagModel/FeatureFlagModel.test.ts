import { FeatureFlags } from '@lightdash/common';
import { Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from './FeatureFlagModel';

// Minimal stub — tests below don't exercise the database layer
const databaseStub = {} as Knex;

// Throws on any query — used to verify DB errors are swallowed by the model
const throwingDatabase = (() => {
    throw new Error('invalid input syntax for type uuid');
}) as unknown as Knex;

const buildModel = (
    configOverrides: Partial<LightdashConfig> = {},
    database: Knex = databaseStub,
) =>
    new FeatureFlagModel({
        database,
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

        it('returns disabled for any flag listed in LIGHTDASH_DISABLE_FEATURE_FLAGS', async () => {
            const model = buildModel({
                disabledFeatureFlags: new Set(['killed-flag']),
            });

            const result = await model.get({
                featureFlagId: 'killed-flag',
            });

            expect(result).toEqual({ id: 'killed-flag', enabled: false });
        });

        it('disable-allowlist forces off even when a config handler would enable', async () => {
            // Self-hoster kill switch wins over default-on flags.
            const model = buildModel({
                disabledFeatureFlags: new Set([FeatureFlags.EditYamlInUi]),
                editYamlInUi: { enabled: true },
            });

            const result = await model.get({
                featureFlagId: FeatureFlags.EditYamlInUi,
            });

            expect(result.enabled).toBe(false);
        });

        it('enable-allowlist takes precedence over disable-allowlist if both set', async () => {
            // If a flag is in both lists (operator misconfig), enable wins —
            // matches the order of checks in get().
            const model = buildModel({
                enabledFeatureFlags: new Set(['conflicting-flag']),
                disabledFeatureFlags: new Set(['conflicting-flag']),
            });

            const result = await model.get({
                featureFlagId: 'conflicting-flag',
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
        it('resolves config-driven flags without hitting the DB', async () => {
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

    describe('database error resilience', () => {
        // Reproduces the embed-account regression: a non-UUID userUuid
        // (e.g. `external::…`) makes Postgres throw 22P02 on the override
        // lookup. The model must swallow that and resolve to disabled
        // rather than 500ing.
        it('does not throw when EnableTimezoneSupport DB lookup fails', async () => {
            const model = buildModel({}, throwingDatabase);

            const result = await model.get({
                featureFlagId: FeatureFlags.EnableTimezoneSupport,
                user: {
                    userUuid: 'external::not-a-uuid',
                    organizationUuid: 'org-uuid',
                    organizationName: 'Org',
                },
            });

            expect(result).toEqual({
                id: FeatureFlags.EnableTimezoneSupport,
                enabled: false,
            });
        });

        it('does not throw when EnableDataApps DB lookup fails', async () => {
            const model = buildModel({}, throwingDatabase);

            const result = await model.get({
                featureFlagId: FeatureFlags.EnableDataApps,
                user: {
                    userUuid: 'external::not-a-uuid',
                    organizationUuid: 'org-uuid',
                    organizationName: 'Org',
                },
            });

            expect(result).toEqual({
                id: FeatureFlags.EnableDataApps,
                enabled: false,
            });
        });
    });
});
