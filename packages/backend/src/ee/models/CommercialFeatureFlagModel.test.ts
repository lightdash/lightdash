import { CommercialFeatureFlags } from '@lightdash/common';
import { Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { LightdashConfig } from '../../config/parseConfig';
import {
    FeatureFlagOverridesTableName,
    FeatureFlagsTableName,
} from '../../database/entities/featureFlags';
import { CommercialFeatureFlagModel } from './CommercialFeatureFlagModel';

vi.mock('../../models/FeatureFlagModel/flagCheckAggregator', () => ({
    record: vi.fn(),
}));

const user = {
    userUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organizationUuid: 'org-uuid',
};

// Fake Knex serving `feature_flags` rows by flag_id; no overrides.
const buildFakeDatabase = (flagDefaults: Record<string, boolean>): Knex => {
    const makeBuilder = (table: string) => {
        let flagId: string | undefined;
        const builder = {
            where(column: string, value?: string) {
                if (column === 'flag_id') flagId = value;
                return builder;
            },
            whereNull: () => builder,
            first() {
                if (table === FeatureFlagsTableName && flagId !== undefined) {
                    return Promise.resolve(
                        flagId in flagDefaults
                            ? {
                                  flag_id: flagId,
                                  default_enabled: flagDefaults[flagId],
                              }
                            : undefined,
                    );
                }
                if (table === FeatureFlagOverridesTableName) {
                    return Promise.resolve(undefined);
                }
                return Promise.resolve(undefined);
            },
        };
        return builder;
    };
    return ((table: string) => makeBuilder(table)) as unknown as Knex;
};

const buildModel = (
    flagDefaults: Record<string, boolean>,
    customRolesConfigEnabled = false,
) =>
    new CommercialFeatureFlagModel({
        database: buildFakeDatabase(flagDefaults),
        lightdashConfig: {
            ...lightdashConfigMock,
            enabledFeatureFlags: new Set<string>(),
            disabledFeatureFlags: new Set<string>(),
            customRoles: { enabled: customRolesConfigEnabled },
        } as unknown as LightdashConfig,
    });

describe('CommercialFeatureFlagModel – multiple-roles', () => {
    const featureFlagId = CommercialFeatureFlags.MultipleRoles;

    it('is disabled by default (no DB row)', async () => {
        const model = buildModel({});
        expect(await model.get({ user, featureFlagId })).toEqual({
            id: featureFlagId,
            enabled: false,
        });
    });

    it('is disabled without a user', async () => {
        const model = buildModel({ [featureFlagId]: true }, true);
        expect(await model.get({ featureFlagId })).toEqual({
            id: featureFlagId,
            enabled: false,
        });
    });

    it('stays disabled when enabled in DB but custom roles are unavailable', async () => {
        const model = buildModel({ [featureFlagId]: true });
        expect(await model.get({ user, featureFlagId })).toEqual({
            id: featureFlagId,
            enabled: false,
        });
    });

    it('is enabled when enabled in DB and custom roles are enabled by config', async () => {
        const model = buildModel({ [featureFlagId]: true }, true);
        expect(await model.get({ user, featureFlagId })).toEqual({
            id: featureFlagId,
            enabled: true,
        });
    });

    it('is enabled when enabled in DB and the CustomRoles flag is enabled', async () => {
        const model = buildModel({
            [featureFlagId]: true,
            [CommercialFeatureFlags.CustomRoles]: true,
        });
        expect(await model.get({ user, featureFlagId })).toEqual({
            id: featureFlagId,
            enabled: true,
        });
    });

    it('stays disabled when custom roles are available but the flag is off', async () => {
        const model = buildModel(
            { [CommercialFeatureFlags.CustomRoles]: true },
            true,
        );
        expect(await model.get({ user, featureFlagId })).toEqual({
            id: featureFlagId,
            enabled: false,
        });
    });
});
