/**
 * Data-lineage runtime that lives inside the sandboxed iframe, alongside the
 * element inspector. Unlike the inspector (which maps a clicked element to its
 * source location for AI edits and draws a crosshair overlay), this maps a
 * clicked element to the *query* that produced it (via the render-time
 * `data-ld-query` queryUuid and `data-ld-query-id` author-id stamps) and can
 * highlight where a given query renders.
 *
 * Protocol (parent <-> iframe), all over postMessage:
 *   iframe -> parent : lightdash:lineage:available           (once the app has stamps)
 *   parent -> iframe : lightdash:lineage:enable | :disable    (click-select mode)
 *   iframe -> parent : lightdash:lineage:selected {queryUuid, queryId} (on click, while enabled)
 *   parent -> iframe : lightdash:lineage:highlight {queryUuid, queryId?}  (hover, any time)
 */

const QUERY_UUID_ATTR = 'data-ld-query';
const QUERY_ID_ATTR = 'data-ld-query-id';
const STAMP_SELECTOR = `[${QUERY_UUID_ATTR}],[${QUERY_ID_ATTR}]`;

type LineageEnableMessage = { type: 'lightdash:lineage:enable' };
type LineageDisableMessage = { type: 'lightdash:lineage:disable' };
type LineageHighlightMessage = {
    type: 'lightdash:lineage:highlight';
    queryUuid: string | null;
    /** Absent from older hosts. */
    queryId?: string | null;
};

/** At least one of the two is non-null. */
export type LineageTarget = {
    queryUuid: string | null;
    queryId: string | null;
};

export type LineageSelectedMessage = {
    type: 'lightdash:lineage:selected';
} & LineageTarget;

export type LineageAvailableMessage = {
    type: 'lightdash:lineage:available';
    /** Number of stamped elements at announce time. Always ≥ 1 — the parent
     *  treats announces without it as legacy SDKs that announced with zero
     *  stamps, and keeps the Inspect-data toggle disabled. */
    stampCount: number;
};

const HIGHLIGHT_OUTLINE = '2px solid #7c3aed';
const HIGHLIGHT_OFFSET = '2px';

/** Stamps of the nearest stamped ancestor of `el`, or null. */
export function resolveLineageTarget(el: Element | null): LineageTarget | null {
    const stamped = el?.closest?.(STAMP_SELECTOR) ?? null;
    if (!stamped) return null;
    const queryUuid = stamped.getAttribute(QUERY_UUID_ATTR) || null;
    const queryId = stamped.getAttribute(QUERY_ID_ATTR) || null;
    return queryUuid || queryId ? { queryUuid, queryId } : null;
}

let highlighted: HTMLElement[] = [];

export function clearHighlight(): void {
    for (const el of highlighted) {
        el.style.outline = '';
        el.style.outlineOffset = '';
    }
    highlighted = [];
}

/** Outlines every element stamped with either the queryUuid or the queryId. */
export function applyHighlight(target: LineageTarget): void {
    clearHighlight();
    const { queryUuid, queryId } = target;
    if (!queryUuid && !queryId) return;
    document.querySelectorAll<HTMLElement>(STAMP_SELECTOR).forEach((el) => {
        const matches =
            (queryUuid !== null &&
                el.getAttribute(QUERY_UUID_ATTR) === queryUuid) ||
            (queryId !== null && el.getAttribute(QUERY_ID_ATTR) === queryId);
        if (!matches) return;
        el.style.outline = HIGHLIGHT_OUTLINE;
        el.style.outlineOffset = HIGHLIGHT_OFFSET;
        highlighted.push(el);
    });
}

let enabled = false;
let parentWindow: Window | null = null;
let clickListenerAttached = false;
let messageListenerAttached = false;
let availabilityAnnounced = false;
let stampObserver: MutationObserver | null = null;

// Only announce once the app actually has stamped elements — an unconditional
// announce enables the parent's Inspect-data toggle even when the generated
// app never spread `{...lineage}`, leaving a toggle that does nothing.
function announceIfStamped(): boolean {
    if (availabilityAnnounced) return true;
    const stampCount = document.querySelectorAll(STAMP_SELECTOR).length;
    if (stampCount === 0) return false;
    availabilityAnnounced = true;
    parentWindow?.postMessage(
        {
            type: 'lightdash:lineage:available',
            stampCount,
        } satisfies LineageAvailableMessage,
        '*',
    );
    return true;
}

function onClick(e: MouseEvent) {
    if (!enabled) return;
    const target = resolveLineageTarget(e.target as Element | null);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
    }
    parentWindow?.postMessage(
        {
            type: 'lightdash:lineage:selected',
            ...target,
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

    // Stamps render after data loads, so a one-shot check at mount isn't
    // enough — watch for the first stamp, then disconnect.
    if (!announceIfStamped() && !stampObserver) {
        stampObserver = new MutationObserver(() => {
            if (announceIfStamped()) {
                stampObserver?.disconnect();
                stampObserver = null;
            }
        });
        // documentElement (not body): body may not exist yet if the app's
        // module code runs before the parser reaches <body>.
        stampObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [QUERY_UUID_ATTR, QUERY_ID_ATTR],
        });
    }

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
            const { queryUuid, queryId } = data as LineageHighlightMessage;
            applyHighlight({
                queryUuid: typeof queryUuid === 'string' ? queryUuid : null,
                queryId: typeof queryId === 'string' ? queryId : null,
            });
        }
    });
}
