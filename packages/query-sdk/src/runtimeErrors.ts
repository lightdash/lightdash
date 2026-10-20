import { documentNavigationId } from './documentNavigationId';

let activeCleanup: (() => void) | null = null;
let reported = false;

/** Reports one generic runtime error per document without reading error contents. */
export function mountRuntimeErrorObserver(targetWindow: Window): () => void {
    if (typeof window === 'undefined' || reported) return () => {};

    activeCleanup?.();

    const report = () => {
        if (reported) return;
        reported = true;
        try {
            targetWindow.postMessage(
                {
                    type: 'lightdash:sdk:runtime-error',
                    ...(documentNavigationId
                        ? { navigationId: documentNavigationId }
                        : {}),
                },
                '*',
            );
        } catch {
            // Technical telemetry must never affect the running app.
        }
    };
    const handleError = (event: Event) => {
        // Resource-load failures are not JavaScript runtime exceptions.
        if (event instanceof ErrorEvent) report();
    };
    const cleanup = () => {
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', report);
        if (activeCleanup === cleanup) activeCleanup = null;
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', report);
    activeCleanup = cleanup;
    return cleanup;
}
