/**
 * Data-lineage runtime that lives inside the sandboxed iframe, alongside the
 * element inspector. Unlike the inspector (which maps a clicked element to its
 * source location for AI edits and draws a crosshair overlay), this maps a
 * clicked element to the *query* that produced it (via the build-/render-time
 * `data-ld-query` stamp) and can highlight where a given query renders.
 *
 * Protocol (parent <-> iframe), all over postMessage:
 *   iframe -> parent : lightdash:lineage:available           (on mount)
 *   parent -> iframe : lightdash:lineage:enable | :disable    (click-select mode)
 *   iframe -> parent : lightdash:lineage:selected {queryUuid} (on click, while enabled)
 *   parent -> iframe : lightdash:lineage:highlight {queryUuid|null}  (hover, any time)
 */

type LineageEnableMessage = { type: 'lightdash:lineage:enable' };
type LineageDisableMessage = { type: 'lightdash:lineage:disable' };
type LineageHighlightMessage = {
    type: 'lightdash:lineage:highlight';
    queryUuid: string | null;
};

export type LineageSelectedMessage = {
    type: 'lightdash:lineage:selected';
    queryUuid: string;
};

export type LineageAvailableMessage = {
    type: 'lightdash:lineage:available';
};

const HIGHLIGHT_OUTLINE = '2px solid #7c3aed';
const HIGHLIGHT_OFFSET = '2px';

/** queryUuid of the nearest stamped ancestor of `el`, or null. */
export function resolveLineageTarget(el: Element | null): string | null {
    const stamped = el?.closest?.('[data-ld-query]') ?? null;
    return stamped?.getAttribute('data-ld-query') ?? null;
}

let highlighted: HTMLElement[] = [];

export function clearHighlight(): void {
    for (const el of highlighted) {
        el.style.outline = '';
        el.style.outlineOffset = '';
    }
    highlighted = [];
}

export function applyHighlight(queryUuid: string | null): void {
    clearHighlight();
    if (!queryUuid) return;
    const nodes = document.querySelectorAll<HTMLElement>(
        `[data-ld-query="${queryUuid}"]`,
    );
    nodes.forEach((el) => {
        el.style.outline = HIGHLIGHT_OUTLINE;
        el.style.outlineOffset = HIGHLIGHT_OFFSET;
        highlighted.push(el);
    });
}

let enabled = false;
let parentWindow: Window | null = null;
let clickListenerAttached = false;
let messageListenerAttached = false;

function onClick(e: MouseEvent) {
    if (!enabled) return;
    const queryUuid = resolveLineageTarget(e.target as Element | null);
    if (!queryUuid) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
    }
    parentWindow?.postMessage(
        {
            type: 'lightdash:lineage:selected',
            queryUuid,
        } satisfies LineageSelectedMessage,
        '*',
    );
}

/**
 * Mounts the lineage runtime. Idempotent. Mirrors `mountInspector`.
 */
export function mountLineage(parent: Window): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }
    parentWindow = parent;
    if (!clickListenerAttached) {
        clickListenerAttached = true;
        // Capture phase so we see the click before the app's own handlers and
        // can suppress them while inspect-data mode is on.
        window.addEventListener('click', onClick, true);
    }

    parent.postMessage(
        { type: 'lightdash:lineage:available' } satisfies LineageAvailableMessage,
        '*',
    );

    if (messageListenerAttached) return;
    messageListenerAttached = true;
    window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as
            | LineageEnableMessage
            | LineageDisableMessage
            | LineageHighlightMessage
            | { type?: unknown }
            | undefined;
        if (!data || typeof data.type !== 'string') return;
        if (data.type === 'lightdash:lineage:enable') {
            enabled = true;
        } else if (data.type === 'lightdash:lineage:disable') {
            enabled = false;
        } else if (data.type === 'lightdash:lineage:highlight') {
            const q = (data as LineageHighlightMessage).queryUuid;
            applyHighlight(typeof q === 'string' ? q : null);
        }
    });
}
