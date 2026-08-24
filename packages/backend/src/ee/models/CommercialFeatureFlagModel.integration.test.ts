import {
    CommercialFeatureFlags,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    FeatureFlagOverridesTableName,
    FeatureFlagsTableName,
} from '../../database/entities/featureFlags';
import { OrganizationTableName } from '../../database/entities/organizations';
import { ProjectTableName } from '../../database/entities/projects';
import { getTestContext } from '../../vitest.setup.integration';
import { CommercialFeatureFlagModel } from './CommercialFeatureFlagModel';

describe('CommercialFeatureFlagModel direct access PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: CommercialFeatureFlagModel;
    let organizationUuid: string;

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new CommercialFeatureFlagModel({
            database: transaction,
            lightdashConfig: {
                ...lightdashConfigMock,
                enabledFeatureFlags: new Set<string>(),
                disabledFeatureFlags: new Set<string>(),
            },
        });
        const organization = await transaction(OrganizationTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .where(
                `${ProjectTableName}.project_uuid`,
                SEED_PROJECT.project_uuid,
            )
            .first(`${OrganizationTableName}.organization_uuid`);
        if (!organization) {
            throw new Error('Seed organization not found');
        }
        organizationUuid = organization.organization_uuid;
        await transaction(FeatureFlagsTableName)
            .insert({
                flag_id: CommercialFeatureFlags.DirectAccess,
                default_enabled: null,
            })
            .onConflict('flag_id')
            .merge({ default_enabled: null });
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    const getFlag = () =>
        model.get({
            featureFlagId: CommercialFeatureFlags.DirectAccess,
            user: {
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                organizationUuid,
            },
        });

    it('ignores a user-level override that would enable the flag', async () => {
        await transaction(FeatureFlagOverridesTableName).insert({
            flag_id: CommercialFeatureFlags.DirectAccess,
            user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            enabled: true,
        });

        await expect(getFlag()).resolves.toEqual({
            id: CommercialFeatureFlags.DirectAccess,
            enabled: false,
        });
    });

    it('keeps an organization disable authoritative over a user enable', async () => {
        await transaction(FeatureFlagOverridesTableName).insert([
            {
                flag_id: CommercialFeatureFlags.DirectAccess,
                user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                enabled: true,
            },
            {
                flag_id: CommercialFeatureFlags.DirectAccess,
                organization_uuid: organizationUuid,
                enabled: false,
            },
        ]);

        await expect(getFlag()).resolves.toEqual({
            id: CommercialFeatureFlags.DirectAccess,
            enabled: false,
        });
    });

    it('enables through an organization-level override only', async () => {
        await transaction(FeatureFlagOverridesTableName).insert({
            flag_id: CommercialFeatureFlags.DirectAccess,
            organization_uuid: organizationUuid,
            enabled: true,
        });

        await expect(getFlag()).resolves.toEqual({
            id: CommercialFeatureFlags.DirectAccess,
            enabled: true,
        });
    });
});
