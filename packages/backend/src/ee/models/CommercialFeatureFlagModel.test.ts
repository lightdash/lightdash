import { CommercialFeatureFlags } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CommercialFeatureFlagModel } from './CommercialFeatureFlagModel';

const database = knex({ client: MockClient, dialect: 'pg' });

const createModel = (config: Partial<typeof lightdashConfigMock> = {}) =>
    new CommercialFeatureFlagModel({
        database,
        lightdashConfig: {
            ...lightdashConfigMock,
            enabledFeatureFlags: new Set<string>(),
            disabledFeatureFlags: new Set<string>(),
            ...config,
        },
    });

describe('CommercialFeatureFlagModel pre-aggregates', () => {
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    const withInfra = (enabled: boolean) =>
        createModel({
            preAggregates: { ...lightdashConfigMock.preAggregates, enabled },
        });

    it('is off without the instance infra and never asks the database', async () => {
        await expect(
            withInfra(false).get({
                featureFlagId: CommercialFeatureFlags.PreAggregates,
                user: { organizationUuid: 'organization-uuid' },
            }),
        ).resolves.toEqual({
            id: CommercialFeatureFlags.PreAggregates,
            enabled: false,
        });
        expect(tracker.history.select).toHaveLength(0);
    });

    it('is on by default when the infra is configured', async () => {
        tracker.on.select('feature_flags').responseOnce(undefined);

        await expect(
            withInfra(true).get({
                featureFlagId: CommercialFeatureFlags.PreAggregates,
                user: { organizationUuid: 'organization-uuid' },
            }),
        ).resolves.toEqual({
            id: CommercialFeatureFlags.PreAggregates,
            enabled: true,
        });
    });

    it('lets an organization override switch it off', async () => {
        tracker.on.select('feature_flags').responseOnce({
            flag_id: CommercialFeatureFlags.PreAggregates,
            default_enabled: null,
        });
        tracker.on.select('feature_flag_overrides').responseOnce({
            flag_id: CommercialFeatureFlags.PreAggregates,
            organization_uuid: 'organization-uuid',
            user_uuid: null,
            enabled: false,
        });

        await expect(
            withInfra(true).get({
                featureFlagId: CommercialFeatureFlags.PreAggregates,
                user: { organizationUuid: 'organization-uuid' },
            }),
        ).resolves.toEqual({
            id: CommercialFeatureFlags.PreAggregates,
            enabled: false,
        });
    });
});
