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

// Three swappable morph styles. Edit the default below or flip at runtime
// from the browser console: `setArtifactMorph('snap')`.
export type ArtifactMorphStyle = 'lift' | 'snap' | 'expand';
const DEFAULT_MORPH_STYLE: ArtifactMorphStyle = 'lift';

if (typeof document !== 'undefined') {
    document.documentElement.dataset.artifactMorph = DEFAULT_MORPH_STYLE;
}
if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).setArtifactMorph = (
        style: ArtifactMorphStyle,
    ) => {
        document.documentElement.dataset.artifactMorph = style;
    };
}

/**
 * Build the shared `view-transition-name` for a given artifact. Used in
 * morph mode — same identifier on the involved button + panel.
 */
export function artifactVtName(
    artifactUuid: string,
    versionUuid: string,
): string {
    return `artifact-shell-${artifactUuid}-${versionUuid}`;
}

/**
 * Stable name used by the panel while switching between artifacts.
 * Identical name in old + new snapshots means the panel cross-fades in
 * place instead of triggering a dual button↔panel morph.
 */
export const ARTIFACT_PANEL_SWITCH_VT_NAME = 'artifact-panel-shell';

export function artifactKey(artifactUuid: string, versionUuid: string): string {
    return `${artifactUuid}-${versionUuid}`;
}

type TransitionMode = 'morph' | 'switch';

// Module-level mutable store: which artifact keys are participating in
// the in-flight view transition, and which kind of transition it is.
// Only buttons in the set opt into a `view-transition-name`; the panel
// reads the mode to decide between its per-artifact name and the stable
// switch name.
type TransitionState = {
    keys: ReadonlySet<string>;
    mode: TransitionMode;
};

const IDLE_STATE: TransitionState = {
    keys: new Set(),
    mode: 'morph',
};

let state: TransitionState = IDLE_STATE;
const listeners = new Set<() => void>();

function setState(next: TransitionState) {
    state = next;
    listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

function getSnapshot(): TransitionState {
    return state;
}

/**
 * Reactive read for whether the given artifact key is part of the
 * currently-running view transition.
 */
export function useIsArtifactTransitioning(key: string | null): boolean {
    const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return key != null && current.keys.has(key);
}

/**
 * Reactive read for the current transition mode. The panel uses this
 * to pick between its per-artifact name (morph mode) and the shared
 * switch name (subtle in-place cross-fade).
 */
export function useArtifactTransitionMode(): TransitionMode {
    const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return current.mode;
}

function withTransition(next: TransitionState, update: () => void) {
    const doc = document as DocumentWithViewTransition;
    if (typeof doc.startViewTransition !== 'function') {
        update();
        return;
    }

    flushSync(() => {
        setState(next);
    });

    const transition = doc.startViewTransition(() => {
        flushSync(update);
    });

    void transition.finished.finally(() => {
        // Only reset if no newer transition has taken over the slot.
        if (state === next) {
            flushSync(() => {
                setState(IDLE_STATE);
            });
        }
    });
}

/**
 * Open or close an artifact (button ↔ panel morph). Lists every
 * artifact whose shell is part of the morph — typically just the
 * clicked one for open/close, both the clicked and the previously-open
 * one when switching to a new artifact from a different button.
 *
 * Buttons not in `involvedKeys` stay out of the snapshot tree entirely
 * and don't animate.
 */
export function startArtifactMorph(involvedKeys: string[], update: () => void) {
    withTransition(
        {
            keys: new Set(involvedKeys),
            mode: 'morph',
        },
        update,
    );
}

/**
 * Subtler transition for switching the panel's content from one
 * artifact to another. The panel takes a stable `view-transition-name`
 * for the duration, so the browser cross-fades its content in place
 * instead of running two button↔panel morphs in opposite directions.
 */
export function startArtifactSwitch(update: () => void) {
    withTransition(
        {
            keys: new Set(),
            mode: 'switch',
        },
        update,
    );
}
