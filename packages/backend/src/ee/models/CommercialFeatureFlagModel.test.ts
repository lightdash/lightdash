import { CommercialFeatureFlags } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CommercialFeatureFlagModel } from './CommercialFeatureFlagModel';

const database = knex({ client: MockClient, dialect: 'pg' });

const createModel = (copilot = lightdashConfigMock.ai.copilot) =>
    new CommercialFeatureFlagModel({
        database,
        lightdashConfig: {
            ...lightdashConfigMock,
            ai: {
                ...lightdashConfigMock.ai,
                copilot,
            },
            enabledFeatureFlags: new Set<string>(),
            disabledFeatureFlags: new Set<string>(),
        },
    });

describe('CommercialFeatureFlagModel direct access', () => {
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('fails closed without a user and issues no flag queries', async () => {
        await expect(
            createModel().get({
                featureFlagId: CommercialFeatureFlags.DirectAccess,
            }),
        ).resolves.toEqual({
            id: CommercialFeatureFlags.DirectAccess,
            enabled: false,
        });
        expect(tracker.history.select).toHaveLength(0);
    });

    it('is default-off when no organization override can be resolved', async () => {
        tracker.on.select('feature_flags').response(undefined);

        await expect(
            createModel().get({
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

    it('enables through an organization-level override', async () => {
        tracker.on.select('feature_flags').responseOnce({
            flag_id: CommercialFeatureFlags.DirectAccess,
            default_enabled: null,
        });
        tracker.on.select('feature_flag_overrides').responseOnce({
            flag_id: CommercialFeatureFlags.DirectAccess,
            organization_uuid: 'organization-uuid',
            user_uuid: null,
            enabled: true,
        });

        await expect(
            createModel().get({
                featureFlagId: CommercialFeatureFlags.DirectAccess,
                user: {
                    userUuid: 'user-uuid',
                    organizationUuid: 'organization-uuid',
                },
            }),
        ).resolves.toEqual({
            id: CommercialFeatureFlags.DirectAccess,
            enabled: true,
        });
    });
});

describe('CommercialFeatureFlagModel AI copilot', () => {
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('fails closed without a user and issues no flag queries', async () => {
        await expect(
            createModel({
                ...lightdashConfigMock.ai.copilot,
                enabled: true,
                requiresFeatureFlag: true,
            }).get({
                featureFlagId: CommercialFeatureFlags.AiCopilot,
            }),
        ).resolves.toEqual({
            id: CommercialFeatureFlags.AiCopilot,
            enabled: false,
        });
        expect(tracker.history.select).toHaveLength(0);
    });
});
