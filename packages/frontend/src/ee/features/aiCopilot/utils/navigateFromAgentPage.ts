// Set on AiAgentPageLayout
const AGENT_PAGE_SELECTOR = '[data-ai-agent-page]';
const PAGE_SPINNER_SELECTOR = '[data-testid="page-spinner"]';
// The page stays frozen on the chat until then, so a slow load cannot hold it long
const MAX_FROZEN_MS = 1000;

const hasDestinationRendered = () =>
    document.querySelector(AGENT_PAGE_SELECTOR) === null &&
    document.querySelector(PAGE_SPINNER_SELECTOR) === null;

const waitUntil = (isReady: () => boolean) =>
    new Promise<void>((resolve) => {
        if (isReady()) {
            resolve();
            return;
        }
        const observer = new MutationObserver(() => {
            if (isReady()) done();
        });
        const timer = window.setTimeout(done, MAX_FROZEN_MS);
        function done() {
            observer.disconnect();
            window.clearTimeout(timer);
            resolve();
        }
        observer.observe(document.body, { childList: true, subtree: true });
    });

/**
 * Crossfades from the agent page to the page `go` opens, snapshotting it once
 * it has rendered rather than its loading spinner.
 */
export const navigateFromAgentPage = (go: () => void | Promise<void>) => {
    if (typeof document.startViewTransition !== 'function') {
        void go();
        return;
    }
    document.startViewTransition(() =>
        Promise.race([
            (async () => {
                await go();
                await waitUntil(hasDestinationRendered);
            })(),
            new Promise<void>((resolve) =>
                window.setTimeout(resolve, MAX_FROZEN_MS),
            ),
        ]),
    );
};
