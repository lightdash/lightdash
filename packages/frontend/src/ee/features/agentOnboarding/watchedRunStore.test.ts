const STORAGE_KEY = 'lightdash.agentOnboarding.watchedRun';

const run = {
    agentOnboardingRunUuid: 'run-uuid',
    projectUuid: 'project-uuid',
};

const importStore = async () => {
    vi.resetModules();
    return import('./watchedRunStore');
};

describe('watchedRunStore', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('hydrates from sessionStorage on init', async () => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(run));
        const store = await importStore();
        expect(store.getWatchedAgentOnboardingRunSnapshot()).toEqual(run);
    });

    it('returns null when the stored value is corrupt JSON', async () => {
        sessionStorage.setItem(STORAGE_KEY, '{not json');
        const store = await importStore();
        expect(store.getWatchedAgentOnboardingRunSnapshot()).toBeNull();
    });

    it('returns null when the stored value has the wrong shape', async () => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
        const store = await importStore();
        expect(store.getWatchedAgentOnboardingRunSnapshot()).toBeNull();
    });

    it('round-trips set and clear through sessionStorage', async () => {
        const store = await importStore();
        expect(store.getWatchedAgentOnboardingRunSnapshot()).toBeNull();

        store.setWatchedAgentOnboardingRun(run);
        expect(store.getWatchedAgentOnboardingRunSnapshot()).toEqual(run);
        expect(sessionStorage.getItem(STORAGE_KEY)).toEqual(
            JSON.stringify(run),
        );

        store.clearWatchedAgentOnboardingRun();
        expect(store.getWatchedAgentOnboardingRunSnapshot()).toBeNull();
        expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('notifies subscribers on change and stops after unsubscribe', async () => {
        const store = await importStore();
        const subscriber = vi.fn();
        const unsubscribe =
            store.subscribeToWatchedAgentOnboardingRun(subscriber);

        store.setWatchedAgentOnboardingRun(run);
        expect(subscriber).toHaveBeenCalledTimes(1);

        store.setWatchedAgentOnboardingRun(run);
        expect(subscriber).toHaveBeenCalledTimes(1);

        store.clearWatchedAgentOnboardingRun();
        expect(subscriber).toHaveBeenCalledTimes(2);

        unsubscribe();
        store.setWatchedAgentOnboardingRun(run);
        expect(subscriber).toHaveBeenCalledTimes(2);
    });

    it('keeps a stable snapshot reference between reads', async () => {
        const store = await importStore();
        store.setWatchedAgentOnboardingRun(run);
        expect(store.getWatchedAgentOnboardingRunSnapshot()).toBe(
            store.getWatchedAgentOnboardingRunSnapshot(),
        );
    });
});
