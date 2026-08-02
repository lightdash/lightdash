/**
 * Last-resort crash guard.
 *
 * React ErrorBoundaries only catch errors thrown during *render*. A top-level
 * ReferenceError at module-evaluation time (e.g. a bad SDK call written outside
 * a component — the agent puts `const q = query(...)` at module scope) or an
 * async/event error escapes the boundary and would otherwise leave a blank
 * screen. This module registers global handlers that paint a fallback into
 * `#root` instead.
 *
 * IMPORTANT: it must be imported FIRST in `main.jsx` (before `./App`) so the
 * handlers are registered before the app module evaluates.
 */

function paintFallback(message: string): void {
    const root = document.getElementById('root');
    // If the app already rendered something, a later async error must NOT blow
    // it away — only step in when the app never mounted (empty root).
    if (!root || root.childElementCount > 0) return;

    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    Object.assign(box.style, {
        margin: '48px auto',
        maxWidth: '520px',
        padding: '20px 24px',
        borderRadius: '10px',
        border: '1px solid rgba(148,163,184,0.25)',
        background: 'rgba(148,163,184,0.06)',
        color: 'rgba(148,163,184,0.9)',
        font: '14px/1.6 ui-sans-serif, system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);
    box.textContent =
        'This app hit an error while loading and couldn’t render. If a linked ' +
        'chart’s definition changed in Lightdash, regenerate the app to update it.';
    root.appendChild(box);

    // eslint-disable-next-line no-console
    console.error('[lightdash] fatal app error:', message);
}

if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
        paintFallback(e.message || String(e.error));
    });
    window.addEventListener('unhandledrejection', (e) => {
        paintFallback(String(e.reason));
    });
}
