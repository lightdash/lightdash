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
 * Wrap an artifact state change in a View Transitions snapshot so the
 * browser morphs the shared "artifact shell" between its button and the
 * floating panel. Falls back to a plain update on browsers without
 * `document.startViewTransition`.
 */
export function startArtifactTransition(update: () => void) {
    const doc = document as DocumentWithViewTransition;
    if (typeof doc.startViewTransition !== 'function') {
        update();
        return;
    }
    doc.startViewTransition(() => {
        flushSync(update);
    });
}

/**
 * Build the shared `view-transition-name` for a given artifact. Same
 * identifier on the button (when closed) and the panel (when open) so
 * the browser pairs them across the snapshot.
 */
export function artifactVtName(
    artifactUuid: string,
    versionUuid: string,
): string {
    return `artifact-shell-${artifactUuid}-${versionUuid}`;
}
