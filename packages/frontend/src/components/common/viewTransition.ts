import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, type To } from 'react-router';

const CARD_SELECTOR = '[data-onboarding-card]';
const MAX_FROZEN_MS = 300;

const canTransition = () => typeof document.startViewTransition === 'function';

/** Runs a state update inside a view transition, when the browser has them */
export const withViewTransition = (update: () => void) => {
    if (!canTransition()) {
        update();
        return;
    }
    document.startViewTransition(() => flushSync(update));
};

// Routes often show a spinner first; snapshotting that loses the card morph
const waitForNextCard = (previous: Element) =>
    new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const check = () => {
            const card = document.querySelector(CARD_SELECTOR);
            const isReady = card !== null && card !== previous;
            if (isReady || performance.now() - startedAt > MAX_FROZEN_MS) {
                resolve();
                return;
            }
            requestAnimationFrame(check);
        };
        check();
    });

/** Navigates between onboarding cards, morphing one card into the next */
export const useOnboardingNavigate = () => {
    const navigate = useNavigate();
    return useCallback(
        (to: To | number) => {
            const go = () =>
                typeof to === 'number' ? navigate(to) : navigate(to);
            const previous = document.querySelector(CARD_SELECTOR);
            if (!canTransition() || previous === null) {
                void go();
                return;
            }
            // The page is frozen until this resolves, so a slow chunk load must not hold it
            document.startViewTransition(() =>
                Promise.race([
                    (async () => {
                        await go();
                        await waitForNextCard(previous);
                    })(),
                    new Promise<void>((resolve) =>
                        window.setTimeout(resolve, MAX_FROZEN_MS),
                    ),
                ]),
            );
        },
        [navigate],
    );
};
