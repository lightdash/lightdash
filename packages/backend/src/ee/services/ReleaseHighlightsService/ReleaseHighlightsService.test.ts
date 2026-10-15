import {
    LightdashMode,
    type Account,
    type ReleaseHighlightsResult,
    type SessionUser,
} from '@lightdash/common';
import { toSessionUser } from '../../../auth/account';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { type RoadmapService } from '../RoadmapService/RoadmapService';
import { ReleaseHighlightsService } from './ReleaseHighlightsService';

const versions = vi.hoisted(() => ({
    from: '2.1.0',
    to: '2.2.0' as string | undefined,
}));
vi.mock('../../../version', () => ({
    get VERSION() {
        return versions.from;
    },
}));
vi.mock('../../../clients/DockerHub/DockerHub', () => ({
    getDockerHubVersion: () => versions.to,
}));

const account = {
    authentication: { type: 'session', source: 'session-cookie' },
    user: { userUuid: 'user', type: 'registered' },
    organization: {
        organizationUuid: 'org',
        name: 'Example org',
        createdAt: new Date('2026-10-14'),
    },
    isRegisteredUser: () => true,
} as Account;
const user: SessionUser = toSessionUser(
    account as Parameters<typeof toSessionUser>[0],
);
const candidates = [
    {
        id: 'pr-31000',
        version: '2.2.0',
        scope: 'charts',
        text: 'A feature',
        number: 31000,
        relatedNumbers: [31000],
        url: 'https://github.com/lightdash/lightdash/pull/31000',
    },
];
const ranked = [
    {
        candidateId: 'pr-31000',
        title: 'A feature',
        benefit: 'Make better charts',
    },
];
const cached = {
    fromVersion: '2.1.0',
    toVersion: '2.2.0',
    candidates,
    ranked,
    generatedAt: new Date('2026-10-14'),
};
const ready: Extract<ReleaseHighlightsResult, { status: 'ready' }> = {
    status: 'ready',
    fromVersion: '2.1.0',
    toVersion: '2.2.0',
    generatedAt: cached.generatedAt,
    highlights: [
        {
            title: 'A feature',
            benefit: 'Make better charts',
            url: candidates[0].url,
            version: '2.2.0',
            requestedByYourOrganization: false,
        },
    ],
};
const setup = (
    roadmapService: Pick<
        RoadmapService,
        'getShippedRequestedItems'
    > | null = null,
) => {
    const model = {
        get: vi.fn().mockResolvedValue(null),
        insert: vi.fn().mockImplementation(async () => {
            model.get.mockResolvedValue(cached);
        }),
    };
    const githubClient = {
        getFeatureCandidates: vi
            .fn()
            .mockResolvedValue({ status: 'ready', candidates }),
    };
    const aiService = {
        isAmbientAiEnabled: vi.fn().mockResolvedValue(true),
        generateReleaseHighlights: vi.fn().mockResolvedValue(ranked),
    };
    const lightdashConfig = {
        ...lightdashConfigMock,
        mode: LightdashMode.DEFAULT,
        updateCheck: { enabled: true },
    };
    const service = new ReleaseHighlightsService({
        model,
        githubClient,
        aiService,
        lightdashConfig,
        now: null,
        roadmapService,
    });
    return { service, model, githubClient, aiService, lightdashConfig };
};

beforeEach(() => {
    versions.from = '2.1.0';
    versions.to = '2.2.0';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14'));
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it('gates cloud before cache, AI or GitHub calls', async () => {
    const { service, lightdashConfig, model, githubClient, aiService } =
        setup();
    lightdashConfig.mode = LightdashMode.CLOUD_BETA;
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'not_self_hosted',
    });
    expect(model.get).not.toHaveBeenCalled();
    expect(aiService.isAmbientAiEnabled).not.toHaveBeenCalled();
    expect(githubClient.getFeatureCandidates).not.toHaveBeenCalled();
});

it('disabled update checks make zero fetches and skip all dependencies', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    const { service, lightdashConfig, model, githubClient, aiService } =
        setup();
    lightdashConfig.updateCheck.enabled = false;
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'update_check_disabled',
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(model.get).not.toHaveBeenCalled();
    expect(aiService.isAmbientAiEnabled).not.toHaveBeenCalled();
    expect(githubClient.getFeatureCandidates).not.toHaveBeenCalled();
});

it.each([undefined, '2.1.0', '2.0.9', 'v2.2.0', '2.2.0-beta', 'bad'])(
    'rejects an unavailable, old or invalid latest version: %s',
    async (version) => {
        versions.to = version;
        const { service, githubClient, aiService } = setup();
        expect(await service.getHighlights(account)).toEqual({
            status: 'unavailable',
            reason: 'up_to_date',
        });
        expect(githubClient.getFeatureCandidates).not.toHaveBeenCalled();
        expect(aiService.isAmbientAiEnabled).not.toHaveBeenCalled();
    },
);

it('rejects invalid running versions and compares numeric segments', async () => {
    const { service, aiService } = setup();
    versions.from = '2.1.0-dev';
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'up_to_date',
    });
    versions.from = '2.10.0';
    versions.to = '2.9.0';
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'up_to_date',
    });
    expect(aiService.isAmbientAiEnabled).not.toHaveBeenCalled();
});

it('checks AI availability even when there is a cached highlights', async () => {
    const { service, model, aiService, githubClient } = setup();
    model.get.mockResolvedValue(cached);
    aiService.isAmbientAiEnabled.mockResolvedValue(false);
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'ai_not_configured',
    });
    expect(model.get).not.toHaveBeenCalled();
    expect(githubClient.getFeatureCandidates).not.toHaveBeenCalled();
});

it('serves a cache hit without GitHub or generation', async () => {
    const { service, model, aiService, githubClient } = setup();
    model.get.mockResolvedValue(cached);
    expect(await service.getHighlights(account)).toEqual(ready);
    expect(githubClient.getFeatureCandidates).not.toHaveBeenCalled();
    expect(aiService.generateReleaseHighlights).not.toHaveBeenCalled();
});

it('generates and saves a cache miss and returns the persisted winner', async () => {
    const { service, model, aiService, githubClient } = setup();
    expect(await service.getHighlights(account)).toEqual(ready);
    expect(githubClient.getFeatureCandidates).toHaveBeenCalledWith(
        '2.1.0',
        '2.2.0',
    );
    expect(aiService.generateReleaseHighlights).toHaveBeenCalledWith(user, {
        fromVersion: '2.1.0',
        toVersion: '2.2.0',
        candidates,
    });
    expect(model.insert).toHaveBeenCalledWith(
        '2.1.0',
        '2.2.0',
        candidates,
        ranked,
    );
});

it('cools down failed generations and retries after fifteen minutes', async () => {
    const { service, model, aiService, githubClient } = setup();
    aiService.generateReleaseHighlights.mockRejectedValueOnce(
        new Error('Provider unavailable'),
    );
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'generation_failed',
    });
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'rate_limited',
    });
    expect(githubClient.getFeatureCandidates).toHaveBeenCalledTimes(1);
    expect(model.insert).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(await service.getHighlights(account)).toEqual(ready);
    expect(aiService.generateReleaseHighlights).toHaveBeenCalledTimes(2);
});

it('cools down an unavailable source without generating', async () => {
    const { service, githubClient, aiService } = setup();
    githubClient.getFeatureCandidates.mockResolvedValue({
        status: 'unavailable',
    });
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'source_unavailable',
    });
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'rate_limited',
    });
    expect(aiService.generateReleaseHighlights).not.toHaveBeenCalled();
    expect(githubClient.getFeatureCandidates).toHaveBeenCalledTimes(1);
});

it('deduplicates concurrent requests, including cache reads', async () => {
    const { service, githubClient, aiService, model } = setup();
    const results = await Promise.all(
        Array.from({ length: 8 }, () => service.getHighlights(account)),
    );
    expect(results).toEqual(Array.from({ length: 8 }, () => ready));
    expect(githubClient.getFeatureCandidates).toHaveBeenCalledTimes(1);
    expect(aiService.generateReleaseHighlights).toHaveBeenCalledTimes(1);
    expect(model.insert).toHaveBeenCalledTimes(1);
    expect(model.get).toHaveBeenCalledTimes(2);
});

it('caps attempts across ranges at ten per rolling hour and still serves cache hits', async () => {
    const { service, model, githubClient } = setup();
    githubClient.getFeatureCandidates.mockResolvedValue({
        status: 'unavailable',
    });
    const results = await Promise.all(
        Array.from({ length: 10 }, (_, patch) => {
            versions.to = `2.2.${patch}`;
            return service.getHighlights(account);
        }),
    );
    expect(results).toEqual(
        Array.from({ length: 10 }, () => ({
            status: 'unavailable',
            reason: 'source_unavailable',
        })),
    );
    versions.to = '2.3.0';
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'rate_limited',
    });
    expect(githubClient.getFeatureCandidates).toHaveBeenCalledTimes(10);
    model.get.mockResolvedValueOnce(cached);
    expect(await service.getHighlights(account)).toEqual(ready);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'source_unavailable',
    });
    expect(githubClient.getFeatureCandidates).toHaveBeenCalledTimes(11);
});

it('returns unavailable if the cache cannot be read', async () => {
    const { service, model, githubClient } = setup();
    model.get.mockRejectedValue(new Error('Database unavailable'));
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'generation_failed',
    });
    expect(githubClient.getFeatureCandidates).not.toHaveBeenCalled();
});

it('returns no_features without AI generation and cools down the empty range', async () => {
    const { service, githubClient, aiService, model } = setup();
    githubClient.getFeatureCandidates.mockResolvedValue({
        status: 'ready',
        candidates: [],
    });
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'no_features',
    });
    expect(aiService.generateReleaseHighlights).not.toHaveBeenCalled();
    expect(model.insert).not.toHaveBeenCalled();
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'rate_limited',
    });
    expect(githubClient.getFeatureCandidates).toHaveBeenCalledTimes(1);
});

it('returns no_features when AI finds no user-facing features', async () => {
    const { service, aiService, model } = setup();
    aiService.generateReleaseHighlights.mockResolvedValue([]);
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'no_features',
    });
    expect(model.insert).not.toHaveBeenCalled();
});

it('shares global generation across users and builds unflagged responses per request', async () => {
    const { service, aiService } = setup();
    const other = {
        ...account,
        user: { ...account.user, userUuid: 'other' },
        organization: {
            ...account.organization,
            organizationUuid: 'other-org',
        },
    } as Account;
    const results = await Promise.all([
        service.getHighlights(account),
        service.getHighlights(other),
    ]);
    expect(results).toEqual([ready, ready]);
    expect(aiService.generateReleaseHighlights).toHaveBeenCalledTimes(1);
    expect(await service.getHighlights(other)).toEqual(ready);
    expect(aiService.generateReleaseHighlights).toHaveBeenCalledTimes(1);
});

it('applies roadmap matches per organization without generating again on cache hits', async () => {
    const roadmapService = {
        getShippedRequestedItems: vi
            .fn()
            .mockResolvedValueOnce({
                status: 'ok',
                items: [{ title: 'Requested charts', numbers: [31000] }],
            })
            .mockResolvedValue({ status: 'ok', items: [] }),
    };
    const { service, model, aiService, githubClient } = setup(roadmapService);
    model.get.mockResolvedValue(cached);
    const other = {
        ...account,
        organization: {
            ...account.organization,
            organizationUuid: 'other-org',
        },
    } as Account;
    expect(await service.getHighlights(account)).toEqual({
        ...ready,
        highlights: [
            { ...ready.highlights[0], requestedByYourOrganization: true },
        ],
    });
    expect(await service.getHighlights(other)).toEqual(ready);
    expect(roadmapService.getShippedRequestedItems.mock.calls).toEqual([
        [account],
        [other],
    ]);
    expect(aiService.generateReleaseHighlights).not.toHaveBeenCalled();
    expect(githubClient.getFeatureCandidates).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
});

it.each(['unavailable', 'throw', 'reject'] as const)(
    'uses generic highlights when roadmap is %s',
    async (failure) => {
        const getShippedRequestedItems = vi.fn();
        if (failure === 'unavailable')
            getShippedRequestedItems.mockResolvedValue({
                status: 'unavailable',
            });
        else if (failure === 'throw')
            getShippedRequestedItems.mockImplementation(() => {
                throw new Error('Unavailable');
            });
        else
            getShippedRequestedItems.mockRejectedValue(
                new Error('Unavailable'),
            );
        const { service, model, aiService } = setup({
            getShippedRequestedItems,
        });
        model.get.mockResolvedValue(cached);
        expect(await service.getHighlights(account)).toEqual(ready);
        expect(aiService.generateReleaseHighlights).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    },
);

it('limits roadmap waiting to three seconds and clears the timer', async () => {
    let resolveRoadmap: (value: {
        status: 'ok';
        items: { title: string; numbers: number[] }[];
    }) => void = () => {};
    const roadmapService = {
        getShippedRequestedItems: vi.fn().mockReturnValue(
            new Promise((resolve) => {
                resolveRoadmap = resolve;
            }),
        ),
    };
    const { service, model, aiService } = setup(roadmapService);
    model.get.mockResolvedValue(cached);
    const operation = service.getHighlights(account);
    await vi.advanceTimersByTimeAsync(2_999);
    let completed = false;
    void operation.then(() => {
        completed = true;
    });
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await operation).toEqual(ready);
    expect(vi.getTimerCount()).toBe(0);
    resolveRoadmap({
        status: 'ok',
        items: [{ title: 'Late charts', numbers: [31000] }],
    });
    expect(aiService.generateReleaseHighlights).not.toHaveBeenCalled();
});

it('does not request roadmap matches on an unavailable highlights path', async () => {
    const roadmapService = { getShippedRequestedItems: vi.fn() };
    const { service, aiService } = setup(roadmapService);
    aiService.isAmbientAiEnabled.mockResolvedValue(false);
    expect(await service.getHighlights(account)).toEqual({
        status: 'unavailable',
        reason: 'ai_not_configured',
    });
    expect(roadmapService.getShippedRequestedItems).not.toHaveBeenCalled();
});
