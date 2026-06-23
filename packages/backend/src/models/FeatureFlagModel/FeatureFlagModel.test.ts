import { FeatureFlags } from '@lightdash/common';
import { Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { LightdashConfig } from '../../config/parseConfig';
import {
    DbFeatureFlag,
    DbFeatureFlagOverride,
    FeatureFlagOverridesTableName,
    FeatureFlagsTableName,
} from '../../database/entities/featureFlags';
import Logger from '../../logging/logger';
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

// A valid v4-shaped UUID. The model only runs the user-override lookup when
// userUuid matches its UUID_REGEX — anonymous embed accounts carry a
// non-UUID externalId and must skip straight to the org lookup.
const VALID_USER_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const dbUser = {
    userUuid: VALID_USER_UUID,
    organizationUuid: 'org-uuid',
};

type FakeRows = {
    flag?: Partial<DbFeatureFlag>;
    userOverride?: Partial<DbFeatureFlagOverride>;
    orgOverride?: Partial<DbFeatureFlagOverride>;
};

// Fake Knex serving preconfigured rows by table + where-clause — enough to
// exercise getFromDatabase()'s user-override > org-override > flag-default
// precedence without a real DB. `.first()` is the only terminal the model
// uses; the two override lookups are told apart by their filters (user
// lookup → where('user_uuid'), org lookup → whereNull('user_uuid')).
const buildFakeDatabase = (rows: FakeRows): Knex => {
    const makeBuilder = (table: string) => {
        const filters = new Set<string>();
        const builder = {
            where(column: string) {
                filters.add(column);
                return builder;
            },
            whereNull(column: string) {
                filters.add(`${column}:null`);
                return builder;
            },
            first() {
                if (table === FeatureFlagsTableName) {
                    return Promise.resolve(rows.flag);
                }
                if (table === FeatureFlagOverridesTableName) {
                    if (filters.has('user_uuid')) {
                        return Promise.resolve(rows.userOverride);
                    }
                    if (filters.has('user_uuid:null')) {
                        return Promise.resolve(rows.orgOverride);
                    }
                }
                return Promise.resolve(undefined);
            },
        };
        return builder;
    };
    return ((table: string) => makeBuilder(table)) as unknown as Knex;
};

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

    describe('database resolution', () => {
        const DB_FLAG = 'db-only-flag';

        it('prefers a user override over the org override', async () => {
            // Default off and the org override off — only the user override
            // (on) can yield `true`, which proves it takes priority.
            const model = buildModel(
                {},
                buildFakeDatabase({
                    flag: { default_enabled: false },
                    userOverride: { enabled: true },
                    orgOverride: { enabled: false },
                }),
            );

            const result = await model.get({
                featureFlagId: DB_FLAG,
                user: dbUser,
            });

            expect(result).toEqual({ id: DB_FLAG, enabled: true });
        });

        it('uses the org override when the user has none', async () => {
            const model = buildModel(
                {},
                buildFakeDatabase({
                    flag: { default_enabled: false },
                    userOverride: undefined,
                    orgOverride: { enabled: true },
                }),
            );

            const result = await model.get({
                featureFlagId: DB_FLAG,
                user: dbUser,
            });

            expect(result).toEqual({ id: DB_FLAG, enabled: true });
        });

        it('falls back to the flag default when no override matches', async () => {
            const model = buildModel(
                {},
                buildFakeDatabase({ flag: { default_enabled: true } }),
            );

            const result = await model.get({
                featureFlagId: DB_FLAG,
                user: dbUser,
            });

            expect(result).toEqual({ id: DB_FLAG, enabled: true });
        });
    });

    describe('default_enabled honoured over env fallback', () => {
        // ResultsCacheEnabled resolves to lightdashConfig.results.cacheEnabled
        // only when the DB has no opinion. A concrete default_enabled in the
        // DB wins, so `false` must beat an env fallback of `true`, while
        // `null` (no default set) falls through to it.
        const cacheEnabledConfig = {
            results: { ...lightdashConfigMock.results, cacheEnabled: true },
        };

        it('default_enabled:false overrides an env fallback of true', async () => {
            const model = buildModel(
                cacheEnabledConfig,
                buildFakeDatabase({ flag: { default_enabled: false } }),
            );

            const result = await model.get({
                featureFlagId: FeatureFlags.ResultsCacheEnabled,
                user: dbUser,
            });

            expect(result).toEqual({
                id: FeatureFlags.ResultsCacheEnabled,
                enabled: false,
            });
        });

        it('default_enabled:null falls through to the env fallback', async () => {
            const model = buildModel(
                cacheEnabledConfig,
                buildFakeDatabase({ flag: { default_enabled: null } }),
            );

            const result = await model.get({
                featureFlagId: FeatureFlags.ResultsCacheEnabled,
                user: dbUser,
            });

            expect(result).toEqual({
                id: FeatureFlags.ResultsCacheEnabled,
                enabled: true,
            });
        });
    });

    describe('database error resilience', () => {
        // Reproduces the embed-account regression: a non-UUID userUuid
        // (e.g. `external::…`) makes Postgres throw 22P02 on the override
        // lookup. The model must swallow that and resolve to disabled
        // rather than 500ing. Logger.warn is mocked so the expected warning
        // stays out of the test output (and is asserted on instead).
        let warnSpy: jest.SpyInstance;

        beforeEach(() => {
            warnSpy = jest.spyOn(Logger, 'warn').mockImplementation();
        });

        afterEach(() => {
            warnSpy.mockRestore();
        });

        it('does not throw when EnableTimezoneSupport DB lookup fails', async () => {
            const model = buildModel({}, throwingDatabase);

            const result = await model.get({
                featureFlagId: FeatureFlags.EnableTimezoneSupport,
                user: {
                    userUuid: 'external::not-a-uuid',
                    organizationUuid: 'org-uuid',
                },
            });

            expect(result).toEqual({
                id: FeatureFlags.EnableTimezoneSupport,
                enabled: false,
            });
            expect(warnSpy).toHaveBeenCalled();
        });

        it('does not throw when EnableDataApps DB lookup fails', async () => {
            const model = buildModel({}, throwingDatabase);

            const result = await model.get({
                featureFlagId: FeatureFlags.EnableDataApps,
                user: {
                    userUuid: 'external::not-a-uuid',
                    organizationUuid: 'org-uuid',
                },
            });

            expect(result).toEqual({
                id: FeatureFlags.EnableDataApps,
                enabled: false,
            });
            expect(warnSpy).toHaveBeenCalled();
        });
    });
});
