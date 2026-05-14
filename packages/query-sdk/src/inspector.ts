/**
 * Element inspector ("click-to-edit") runtime that lives inside the sandboxed
 * iframe. The Lightdash parent window enables it via postMessage; on click,
 * this module captures a human-readable label for the clicked element and
 * posts it back. The parent inserts that label as a pill at the prompt
 * editor cursor so the user can compose targeted edits like:
 *
 *     [button "Total Revenue" @src/Toolbar.tsx:42] make this blue
 *     [div "$2.4M" @src/Dashboard.tsx:88] rename to Net Revenue
 *
 * Claude opens the file at `<path>:<line>` directly. When the loc is missing
 * (DOM node injected outside JSX, or pre-transform build), it falls back to
 * grepping `/app/src/` for the quoted text.
 */

type EnableMessage = { type: 'lightdash:inspect:enable' };
type DisableMessage = { type: 'lightdash:inspect:disable' };

export type InspectSelectedMessage = {
    type: 'lightdash:inspect:selected';
    label: string;
};

/**
 * Announced by the iframe SDK on mount so the parent can detect that the
 * inspector is wired up. Older SDKs (loaded by resumed sandboxes) never
 * send this, so the parent leaves the Inspect button hidden for them.
 */
export type InspectAvailableMessage = {
    type: 'lightdash:inspect:available';
};

const OVERLAY_ID = 'lightdash-inspector-overlay';
const LABEL_ID = 'lightdash-inspector-label';
const HIGHLIGHT_COLOR = '#7c3aed';
const MAX_TEXT_LEN = 40;
const ANCESTOR_TEXT_LOOKBACK = 3;

function isOurOwnElement(el: Element | null): boolean {
    if (!el) return false;
    return el.id === OVERLAY_ID || el.id === LABEL_ID;
}

/**
 * Builds a label like `[tag "text" @src/path:line]` for a clicked element.
 *
 * The `@<path>:<line>` suffix is the primary key — it comes from a build-
 * time JSX transform (see sandbox `vite.config.js`) that stamps every
 * element with `data-loc="<rel-path>:<line>"`. With prop spreading, the
 * caller's call site wins over any nested component's own loc, so the
 * value reflects the user-facing source. The visible text and tag stay in
 * the label so the user can confirm they clicked what they meant to click.
 *
 * Falls back to tag-only for elements without text — class names from
 * shadcn/Tailwind are utility-heavy and not grep-useful, so we don't
 * bother emitting them.
 */
function buildLabel(el: Element): string {
    const tag = el.tagName.toLowerCase();

    let text = '';
    let cur: Element | null = el;
    for (let i = 0; i < ANCESTOR_TEXT_LOOKBACK && cur; i += 1) {
        const raw = (cur.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (raw) {
            text = raw.length > MAX_TEXT_LEN
                ? `${raw.slice(0, MAX_TEXT_LEN)}…`
                : raw;
            break;
        }
        cur = cur.parentElement;
    }

    // Walk up to the closest ancestor that carries a build-time source loc.
    // For elements whose call site lives in user code, this is set on the
    // element itself; for icon SVGs and other library-rendered children it
    // lives on a wrapping ancestor.
    const locEl = el.closest('[data-loc]');
    const loc = locEl?.getAttribute('data-loc') ?? '';

    // Inner double quotes would break the bracketed format — replace with
    // single quotes so the label is always well-formed and grep-friendly.
    const safe = text ? text.replace(/"/g, "'") : '';
    const head = safe ? `${tag} "${safe}"` : tag;

    return loc ? `[${head} @${loc}]` : `[${head}]`;
}

let overlayBox: HTMLDivElement | null = null;
let overlayLabel: HTMLDivElement | null = null;

function ensureOverlay(): { box: HTMLDivElement; label: HTMLDivElement } {
    if (overlayBox && overlayLabel) {
        return { box: overlayBox, label: overlayLabel };
    }
    const box = document.createElement('div');
    box.id = OVERLAY_ID;
    Object.assign(box.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483647',
        border: `2px solid ${HIGHLIGHT_COLOR}`,
        borderRadius: '4px',
        background: 'rgba(124, 58, 237, 0.12)',
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0)',
        display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    const label = document.createElement('div');
    label.id = LABEL_ID;
    Object.assign(label.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483647',
        background: HIGHLIGHT_COLOR,
        color: 'white',
        font: '11px ui-sans-serif, system-ui, sans-serif',
        padding: '2px 6px',
        borderRadius: '3px',
        whiteSpace: 'nowrap',
        maxWidth: '320px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    document.body.appendChild(box);
    document.body.appendChild(label);
    overlayBox = box;
    overlayLabel = label;
    return { box, label };
}

function hideOverlay() {
    if (overlayBox) overlayBox.style.display = 'none';
    if (overlayLabel) overlayLabel.style.display = 'none';
}

function positionOverlay(el: Element, labelText: string) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
        hideOverlay();
        return;
    }
    const { box, label } = ensureOverlay();
    box.style.display = 'block';
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    label.textContent = labelText;
    label.style.display = 'block';
    label.style.top = `${Math.max(0, rect.top - 22)}px`;
    label.style.left = `${rect.left}px`;
}

let enabled = false;
let currentTarget: Element | null = null;
let parentWindow: Window | null = null;
let listenersAttached = false;
let messageListenerAttached = false;

function onPointerMove(e: PointerEvent) {
    if (!enabled) return;
    const target = e.target as Element | null;
    if (!target || isOurOwnElement(target)) return;
    if (target === currentTarget) return;
    currentTarget = target;
    positionOverlay(target, buildLabel(target));
}

function onClick(e: MouseEvent) {
    if (!enabled) return;
    const target = e.target as Element | null;
    if (!target || isOurOwnElement(target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
    }
    const label = buildLabel(target);
    parentWindow?.postMessage(
        {
            type: 'lightdash:inspect:selected',
            label,
        } satisfies InspectSelectedMessage,
        '*',
    );
}

function onScrollOrResize() {
    if (enabled && currentTarget) {
        positionOverlay(currentTarget, buildLabel(currentTarget));
    }
}

function setEnabled(next: boolean) {
    if (enabled === next) return;
    enabled = next;
    if (enabled) {
        document.documentElement.style.cursor = 'crosshair';
    } else {
        document.documentElement.style.cursor = '';
        currentTarget = null;
        hideOverlay();
    }
}

function attachListeners() {
    if (listenersAttached) return;
    listenersAttached = true;
    // Capture phase — we need to see events before the app's own handlers.
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize, true);
}

/**
 * Mounts the inspector. Listens for `lightdash:inspect:enable` /
 * `lightdash:inspect:disable` from the parent window and posts back a
 * `lightdash:inspect:selected` event when the user clicks an element while
 * inspect mode is active. Idempotent — safe to call multiple times.
 */
export function mountInspector(parent: Window): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }
    parentWindow = parent;
    attachListeners();

    // Announce capability so the parent can show the Inspect button. Older
    // SDKs running in resumed sandboxes don't send this, leaving the button
    // hidden — they keep working as before.
    parent.postMessage(
        { type: 'lightdash:inspect:available' } satisfies InspectAvailableMessage,
        '*',
    );

    if (messageListenerAttached) return;
    messageListenerAttached = true;
    window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as
            | EnableMessage
            | DisableMessage
            | { type?: unknown }
            | undefined;
        if (!data || typeof data.type !== 'string') return;
        if (data.type === 'lightdash:inspect:enable') {
            setEnabled(true);
        } else if (data.type === 'lightdash:inspect:disable') {
            setEnabled(false);
        }
    });
}
