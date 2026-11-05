import { FeatureFlags } from '@lightdash/common';

let restoreFetch = () => {};

beforeAll(async () => {
    const { installStoryFetch } = await import('./storyApi');
    restoreFetch = installStoryFetch();
});

afterAll(() => restoreFetch());

describe('onboarding story API', () => {
    it('leaves window.fetch assignable and restores the previous fetch', async () => {
        const { installStoryFetch } = await import('./storyApi');
        const previous = window.fetch;
        const restore = installStoryFetch();
        const otherStub = vi.fn();
        window.fetch = otherStub;
        expect(window.fetch).toBe(otherStub);
        restore();
        expect(window.fetch).toBe(previous);
    });

    it('serves the stubbed health response', async () => {
        const response = await window.fetch('/api/v1/health');
        expect(response.ok).toBe(true);
        expect(await response.json()).toMatchObject({
            status: 'ok',
            results: { isAuthenticated: true },
        });
    });

    it('matches route parameters and ignores query strings', async () => {
        const enabled = await window.fetch(
            `/api/v1/feature-flag/${FeatureFlags.NewOnboarding}?refresh=true`,
        );
        expect(await enabled.json()).toEqual({
            status: 'ok',
            results: { id: FeatureFlags.NewOnboarding, enabled: true },
        });
        const disabled = await window.fetch('/api/v1/feature-flag/unknown');
        expect(await disabled.json()).toEqual({
            status: 'ok',
            results: { id: 'unknown', enabled: false },
        });
    });

    it('returns an array for navbar validation and notification requests', async () => {
        for (const path of [
            '/projects/project/validate',
            '/notifications?type=dashboard',
        ]) {
            const response = await window.fetch(`/api/v1${path}`);
            expect(await response.json()).toEqual({
                status: 'ok',
                results: [],
            });
        }
    });

    it('fails visibly for missing stubs instead of masking them as empty success', async () => {
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const response = await window.fetch('/api/v1/missing-route');
            expect(response.status).toBe(404);
            expect(await response.json()).toMatchObject({
                status: 'error',
                error: { name: 'NotFoundError' },
            });
        } finally {
            warning.mockRestore();
        }
    });
});

describe('agent run story fixtures', () => {
    it('keeps the running fixture mid-stage and the completed fixture ready for handoff', async () => {
        const { storyAgentRun } = await import('./agentRunFixture');
        expect(storyAgentRun(false)).toMatchObject({
            status: 'running',
            stage: 'deploying_semantic_layer',
            handoff: null,
            completedAt: null,
        });
        const completed = storyAgentRun(true);
        expect(completed.status).toBe('completed');
        expect(completed.events.at(-1)?.stage).toBe('handoff');
        expect(completed.handoff?.starterQuestions).toHaveLength(3);
        expect(completed.files.map(({ path }) => path)).toContain('handoff.md');
        expect(
            completed.events.every(
                (event, index) =>
                    index === 0 ||
                    Date.parse(event.createdAt) >=
                        Date.parse(completed.events[index - 1].createdAt),
            ),
        ).toBe(true);
    });
});
