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

describe('CommercialFeatureFlagModel live sources', () => {
    let tracker: Tracker;
    const featureFlagId = FeatureFlags.ApiQuerySources;
    const userUuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const organizationUuid = 'organization-uuid';
    const user = { userUuid, organizationUuid };

    // Overrides are keyed by `${flag_id}:${user_uuid or organization_uuid}`
    const respond = ({
        overrides = {},
        liveSource = false,
        defaultEnabled = null,
    }: {
        overrides?: Record<string, boolean>;
        liveSource?: boolean;
        defaultEnabled?: boolean | null;
    }) => {
        tracker.on.select('feature_flag_overrides').response((query) => {
            const enabled =
                overrides[`${query.bindings[0]}:${query.bindings[1]}`];
            return enabled === undefined ? undefined : { enabled };
        });
        tracker.on
            .select('external_connections')
            .response(
                liveSource ? { external_connection_uuid: 'conn' } : undefined,
            );
        tracker.on
            .select('feature_flags')
            .response({ default_enabled: defaultEnabled });
    };

    const getLiveSources = (config: Partial<typeof lightdashConfigMock> = {}) =>
        createModel(config)
            .get({ featureFlagId, user })
            .then(({ enabled }) => enabled);

    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    it('turns on for orgs on the new onboarding', async () => {
        respond({
            overrides: {
                [`${FeatureFlags.NewOnboarding}:${organizationUuid}`]: true,
            },
        });
        await expect(getLiveSources()).resolves.toBe(true);
    });

    it('ignores a user override of the new onboarding', async () => {
        respond({
            overrides: { [`${FeatureFlags.NewOnboarding}:${userUuid}`]: true },
        });
        await expect(getLiveSources()).resolves.toBe(false);
    });

    it('stays on for orgs that already have a live source', async () => {
        respond({ liveSource: true });
        await expect(getLiveSources()).resolves.toBe(true);
    });

    it('keeps an org override that turns it off', async () => {
        respond({
            overrides: { [`${featureFlagId}:${organizationUuid}`]: false },
            liveSource: true,
        });
        await expect(
            getLiveSources({
                enabledFeatureFlags: new Set([FeatureFlags.NewOnboarding]),
            }),
        ).resolves.toBe(false);
    });

    it('follows the flag default otherwise', async () => {
        respond({});
        await expect(getLiveSources()).resolves.toBe(false);
        tracker.reset();
        respond({ defaultEnabled: true });
        await expect(getLiveSources()).resolves.toBe(true);
    });
});
