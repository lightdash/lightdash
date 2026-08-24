import { CommercialFeatureFlags } from '@lightdash/common';
import { type Knex } from 'knex';
import { describe, expect, it } from 'vitest';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CommercialFeatureFlagModel } from './CommercialFeatureFlagModel';

describe('CommercialFeatureFlagModel direct access', () => {
    it('is default-off when no commercial override can be resolved', async () => {
        const emptyDatabase = (() => {
            const query = {
                where: () => query,
                whereNull: () => query,
                first: () => Promise.resolve(undefined),
            };
            return query;
        }) as unknown as Knex;
        const model = new CommercialFeatureFlagModel({
            database: emptyDatabase,
            lightdashConfig: {
                ...lightdashConfigMock,
                enabledFeatureFlags: new Set<string>(),
                disabledFeatureFlags: new Set<string>(),
            },
        });

        await expect(
            model.get({
                featureFlagId: CommercialFeatureFlags.DirectAccess,
                user: {
                    userUuid: 'user-uuid',
                    organizationUuid: 'organization-uuid',
                },
            }),
        ).resolves.toEqual({
            id: CommercialFeatureFlags.DirectAccess,
            enabled: false,
        });
    });
});
