import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

type DocumentWithViewTransition = Document & {
    startViewTransition?: (callback: () => void) => {
        finished: Promise<void>;
        ready: Promise<void>;
        updateCallbackDone: Promise<void>;
        skipTransition: () => void;
    };
};

/**
 * Build the shared `view-transition-name` for a given artifact. Same
 * identifier on the button (when it's the morph source/target) and the
 * floating panel, so the browser pairs them across the snapshot.
 */
export function artifactVtName(
    artifactUuid: string,
    versionUuid: string,
): string {
    return `artifact-shell-${artifactUuid}-${versionUuid}`;
}

export function artifactKey(artifactUuid: string, versionUuid: string): string {
    return `${artifactUuid}-${versionUuid}`;
}

// Module-level mutable store: which artifact keys are participating in
// the in-flight view transition. Only those buttons opt into having a
// `view-transition-name`; everyone else stays out of the snapshot tree
// entirely (no name, no group, no animation).
let transitioningKeys: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function setTransitioningKeys(next: ReadonlySet<string>) {
    transitioningKeys = next;
    listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

function getSnapshot(): ReadonlySet<string> {
    return transitioningKeys;
}

/**
 * Reactive read for whether the given artifact key is part of the
 * currently-running view transition. Components return a stable
 * "no name" identifier when this is false so the browser ignores them.
 */
export function useIsArtifactTransitioning(key: string | null): boolean {
    const set = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return key != null && set.has(key);
}

/**
 * Wrap an artifact state change in a View Transitions snapshot so the
 * browser morphs the shared shell between the listed `involvedKeys`
 * (the clicked button, the currently-open one when switching, etc.).
 * Buttons that aren't in the set don't get a `view-transition-name`
 * and therefore don't animate. Falls back to a plain update on
 * browsers without `document.startViewTransition`.
 */
export function startArtifactTransition(
    involvedKeys: string[],
    update: () => void,
) {
    const doc = document as DocumentWithViewTransition;
    if (typeof doc.startViewTransition !== 'function') {
        update();
        return;
    }

    const keys = new Set(involvedKeys);

    // Force React to render the involved buttons WITH their vt-names
    // before the browser snapshots the old state.
    flushSync(() => {
        setTransitioningKeys(keys);
    });

    const transition = doc.startViewTransition(() => {
        flushSync(update);
    });

    void transition.finished.finally(() => {
        // Only clear if no newer transition has taken over the slot.
        if (transitioningKeys === keys) {
            flushSync(() => {
                setTransitioningKeys(new Set());
            });
        }
    });
}
