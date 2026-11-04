import { CommercialFeatureFlags, FeatureFlags } from '@lightdash/common';
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

const createGatedCopilotModel = () =>
    createModel({
        ai: {
            ...lightdashConfigMock.ai,
            copilot: {
                ...lightdashConfigMock.ai.copilot,
                enabled: true,
                requiresFeatureFlag: true,
            },
        },
    });

describe('CommercialFeatureFlagModel ai copilot', () => {
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('fails closed without a user and issues no flag queries', async () => {
        await expect(
            createGatedCopilotModel().get({
                featureFlagId: CommercialFeatureFlags.AiCopilot,
            }),
        ).resolves.toEqual({
            id: CommercialFeatureFlags.AiCopilot,
            enabled: false,
        });
        expect(tracker.history.select).toHaveLength(0);
    });

    it('resolves through the database when a user is present', async () => {
        tracker.on.select('feature_flags').responseOnce({
            flag_id: CommercialFeatureFlags.AiCopilot,
            default_enabled: null,
        });
        tracker.on.select('feature_flag_overrides').responseOnce({
            flag_id: CommercialFeatureFlags.AiCopilot,
            organization_uuid: 'organization-uuid',
            user_uuid: null,
            enabled: true,
        });

        await expect(
            createGatedCopilotModel().get({
                featureFlagId: CommercialFeatureFlags.AiCopilot,
                user: {
                    userUuid: 'user-uuid',
                    organizationUuid: 'organization-uuid',
                },
            }),
        ).resolves.toEqual({
            id: CommercialFeatureFlags.AiCopilot,
            enabled: true,
        });
    });
});

describe('CommercialFeatureFlagModel analytics rollout', () => {
    let tracker: Tracker;
    const featureFlagId = FeatureFlags.AnalyticsProject;
    const user = { organizationUuid: 'organization-uuid' };

    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    it('keeps analytics off without an existing rollout setting', async () => {
        tracker.on.select('feature_flags').responseOnce(undefined);
        await expect(
            createModel().get({ featureFlagId, user }),
        ).resolves.toEqual({ id: featureFlagId, enabled: false });
    });

    it.each([
        { defaultEnabled: true, override: undefined, expected: true },
        { defaultEnabled: false, override: true, expected: true },
        { defaultEnabled: true, override: false, expected: false },
    ])(
        'preserves default=$defaultEnabled and org override=$override',
        async ({ defaultEnabled, override, expected }) => {
            tracker.on.select('feature_flags').responseOnce({
                flag_id: featureFlagId,
                default_enabled: defaultEnabled,
            });
            tracker.on
                .select('feature_flag_overrides')
                .responseOnce(
                    override === undefined ? undefined : { enabled: override },
                );
            await expect(
                createModel().get({ featureFlagId, user }),
            ).resolves.toEqual({ id: featureFlagId, enabled: expected });
        },
    );

    it('allows instance enablement with the registered commercial model', async () => {
        await expect(
            createModel({ enabledFeatureFlags: new Set([featureFlagId]) }).get({
                featureFlagId,
                user,
            }),
        ).resolves.toEqual({ id: featureFlagId, enabled: true });
        expect(tracker.history.select).toHaveLength(0);
    });

    it('retains preview override precedence', async () => {
        tracker.on
            .select('feature_flag_overrides')
            .responseOnce({ enabled: false });
        await expect(
            createModel({
                enabledFeatureFlags: new Set([featureFlagId]),
                previewFeatureFlags: {
                    ...lightdashConfigMock.previewFeatureFlags,
                    enabled: true,
                },
            }).get({ featureFlagId, user }),
        ).resolves.toEqual({ id: featureFlagId, enabled: false });
    });
});
