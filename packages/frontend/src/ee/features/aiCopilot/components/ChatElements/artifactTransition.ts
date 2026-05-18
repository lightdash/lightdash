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

// Three swappable morph styles. Default is `lift`; flip via the
// floating dev picker (see ArtifactMorphPicker) or from the browser
// console: `setArtifactMorph('snap' | 'lift' | 'expand')`. Selection
// persists across reloads via localStorage.
export type ArtifactMorphStyle = 'lift' | 'snap' | 'expand';
const MORPH_STYLES: readonly ArtifactMorphStyle[] = [
    'snap',
    'lift',
    'expand',
] as const;
const DEFAULT_MORPH_STYLE: ArtifactMorphStyle = 'lift';
const MORPH_STORAGE_KEY = 'lightdash.artifactMorph';

function isMorphStyle(value: unknown): value is ArtifactMorphStyle {
    return (
        typeof value === 'string' &&
        (MORPH_STYLES as readonly string[]).includes(value)
    );
}

function readStoredMorphStyle(): ArtifactMorphStyle {
    if (typeof window === 'undefined') return DEFAULT_MORPH_STYLE;
    try {
        const stored = window.localStorage.getItem(MORPH_STORAGE_KEY);
        return isMorphStyle(stored) ? stored : DEFAULT_MORPH_STYLE;
    } catch {
        return DEFAULT_MORPH_STYLE;
    }
}

const morphListeners = new Set<() => void>();
let currentMorphStyle: ArtifactMorphStyle = DEFAULT_MORPH_STYLE;

function applyMorphStyle(style: ArtifactMorphStyle) {
    currentMorphStyle = style;
    if (typeof document !== 'undefined') {
        document.documentElement.dataset.artifactMorph = style;
    }
    try {
        window.localStorage.setItem(MORPH_STORAGE_KEY, style);
    } catch {
        // ignore quota / privacy-mode failures
    }
    morphListeners.forEach((fn) => fn());
}

if (typeof document !== 'undefined') {
    applyMorphStyle(readStoredMorphStyle());
}

if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).setArtifactMorph = (
        style: ArtifactMorphStyle,
    ) => {
        applyMorphStyle(style);
    };
}

export const ARTIFACT_MORPH_STYLES = MORPH_STYLES;

export function useArtifactMorphStyle(): [
    ArtifactMorphStyle,
    (style: ArtifactMorphStyle) => void,
] {
    const value = useSyncExternalStore(
        (fn) => {
            morphListeners.add(fn);
            return () => {
                morphListeners.delete(fn);
            };
        },
        () => currentMorphStyle,
        () => currentMorphStyle,
    );
    return [value, applyMorphStyle];
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
    // Snap variant intentionally skips view transitions: the morph
    // stretches snapshots to fill the interpolating group rect, which
    // squishes the panel into the button on close at fast durations.
    // Plain CSS entrance on the panel is cleaner for this style.
    if (
        currentMorphStyle === 'snap' ||
        typeof doc.startViewTransition !== 'function'
    ) {
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
