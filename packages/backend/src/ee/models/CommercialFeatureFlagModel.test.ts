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

describe('CommercialFeatureFlagModel data apps', () => {
    let tracker: Tracker;
    const featureFlagId = FeatureFlags.EnableDataApps;
    const organizationUuid = 'organization-uuid';
    const user = { userUuid: 'user-uuid', organizationUuid };
    const runtime = {
        ...lightdashConfigMock.appRuntime,
        sandboxProvider: 'e2b' as const,
        e2bApiKey: 'e2b-key',
    };
    const gatedCopilot = {
        ...lightdashConfigMock.ai,
        copilot: {
            ...lightdashConfigMock.ai.copilot,
            enabled: true,
            requiresFeatureFlag: true,
        },
    };

    // Overrides are keyed by `${flag_id}:${user_uuid or organization_uuid}`
    const respond = ({
        overrides = {},
        organizationCreatedAt = '2024-01-01T00:00:00Z',
    }: {
        overrides?: Record<string, boolean>;
        organizationCreatedAt?: string;
    }) => {
        tracker.on.select('feature_flag_overrides').response((query) => {
            const enabled =
                overrides[`${query.bindings[0]}:${query.bindings[1]}`];
            return enabled === undefined ? undefined : { enabled };
        });
        tracker.on.select('feature_flags').response({ default_enabled: null });
        tracker.on
            .select('organizations')
            .response({ created_at: organizationCreatedAt });
    };

    const getDataApps = (config: Partial<typeof lightdashConfigMock> = {}) =>
        createModel({ appRuntime: runtime, ai: gatedCopilot, ...config })
            .get({ featureFlagId, user })
            .then(({ enabled }) => enabled);

    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    it('is off without a sandbox runtime, without querying anything', async () => {
        respond({
            overrides: {
                [`${CommercialFeatureFlags.AiCopilot}:${organizationUuid}`]: true,
            },
        });
        await expect(
            getDataApps({
                appRuntime: { ...runtime, e2bApiKey: null },
            }),
        ).resolves.toBe(false);
        expect(tracker.history.select).toHaveLength(0);
    });

    it('is on for orgs with the AI copilot flag', async () => {
        respond({
            overrides: {
                [`${CommercialFeatureFlags.AiCopilot}:${organizationUuid}`]: true,
            },
        });
        await expect(getDataApps()).resolves.toBe(true);
    });

    it('is on for orgs created inside the AI trial window', async () => {
        respond({ organizationCreatedAt: '2026-04-08T00:00:00Z' });
        await expect(getDataApps()).resolves.toBe(true);
    });

    it('ignores a data apps override for an org without AI', async () => {
        respond({
            overrides: { [`${featureFlagId}:${organizationUuid}`]: true },
        });
        await expect(getDataApps()).resolves.toBe(false);
    });

    it('is off on instances without AI, whatever the org age', async () => {
        respond({ organizationCreatedAt: '2026-04-08T00:00:00Z' });
        await expect(
            getDataApps({
                ai: {
                    ...gatedCopilot,
                    copilot: { ...gatedCopilot.copilot, enabled: false },
                },
            }),
        ).resolves.toBe(false);
    });

    it('is on for every org on dedicated instances with AI', async () => {
        respond({});
        await expect(
            getDataApps({
                ai: {
                    ...gatedCopilot,
                    copilot: {
                        ...gatedCopilot.copilot,
                        requiresFeatureFlag: false,
                    },
                },
            }),
        ).resolves.toBe(true);
    });
});
