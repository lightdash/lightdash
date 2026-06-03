import { CommercialFeatureFlags } from '@lightdash/common';
import { Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    DbFeatureFlag,
    DbFeatureFlagOverride,
    FeatureFlagOverridesTableName,
    FeatureFlagsTableName,
} from '../../database/entities/featureFlags';
import { CommercialFeatureFlagModel } from './CommercialFeatureFlagModel';

type FakeRows = {
    flag?: Partial<DbFeatureFlag>;
    orgOverride?: Partial<DbFeatureFlagOverride>;
};

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
                if (
                    table === FeatureFlagOverridesTableName &&
                    filters.has('organization_uuid') &&
                    filters.has('user_uuid:null')
                ) {
                    return Promise.resolve(rows.orgOverride);
                }
                return Promise.resolve(undefined);
            },
        };
        return builder;
    };
    return ((table: string) => makeBuilder(table)) as unknown as Knex;
};

const buildModel = ({
    database,
    preAggregatesEnabled,
}: {
    database: Knex;
    preAggregatesEnabled: boolean;
}) =>
    new CommercialFeatureFlagModel({
        database,
        lightdashConfig: {
            ...lightdashConfigMock,
            enabledFeatureFlags: new Set<string>(),
            disabledFeatureFlags: new Set<string>(),
            preAggregates: {
                ...lightdashConfigMock.preAggregates,
                enabled: preAggregatesEnabled,
            },
        },
    });

const user = {
    userUuid: '',
    organizationUuid: 'org-uuid',
    organizationName: 'Org',
};

describe('CommercialFeatureFlagModel', () => {
    describe('PreAggregates', () => {
        it('falls back to the env-derived config when no DB flag exists', async () => {
            const model = buildModel({
                database: buildFakeDatabase({}),
                preAggregatesEnabled: true,
            });

            await expect(
                model.get({
                    featureFlagId: CommercialFeatureFlags.PreAggregates,
                    user,
                }),
            ).resolves.toEqual({
                id: CommercialFeatureFlags.PreAggregates,
                enabled: true,
            });
        });

        it('falls back to the env-derived config when DB default is null', async () => {
            const model = buildModel({
                database: buildFakeDatabase({
                    flag: { default_enabled: null },
                }),
                preAggregatesEnabled: false,
            });

            await expect(
                model.get({
                    featureFlagId: CommercialFeatureFlags.PreAggregates,
                    user,
                }),
            ).resolves.toEqual({
                id: CommercialFeatureFlags.PreAggregates,
                enabled: false,
            });
        });

        it('uses the DB default when present', async () => {
            const model = buildModel({
                database: buildFakeDatabase({
                    flag: { default_enabled: false },
                }),
                preAggregatesEnabled: true,
            });

            await expect(
                model.get({
                    featureFlagId: CommercialFeatureFlags.PreAggregates,
                    user,
                }),
            ).resolves.toEqual({
                id: CommercialFeatureFlags.PreAggregates,
                enabled: false,
            });
        });

        it('uses the org override before the DB default', async () => {
            const model = buildModel({
                database: buildFakeDatabase({
                    flag: { default_enabled: false },
                    orgOverride: { enabled: true },
                }),
                preAggregatesEnabled: false,
            });

            await expect(
                model.get({
                    featureFlagId: CommercialFeatureFlags.PreAggregates,
                    user,
                }),
            ).resolves.toEqual({
                id: CommercialFeatureFlags.PreAggregates,
                enabled: true,
            });
        });
    });
});
