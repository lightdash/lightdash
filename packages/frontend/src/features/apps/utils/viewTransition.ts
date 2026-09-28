import { flushSync } from 'react-dom';

type DocumentWithViewTransition = Document & {
    startViewTransition?: (callback: () => void) => unknown;
};

// Runs a layout-changing state update inside a native View Transition so the
// browser morphs the before/after frames. flushSync makes React commit inside
// the callback, which the browser invokes asynchronously after the caller.
export const withViewTransition = (update: () => void): void => {
    const doc: DocumentWithViewTransition = document;
    if (typeof doc.startViewTransition === 'function') {
        doc.startViewTransition(() => flushSync(update));
    } else {
        update();
    }
};
