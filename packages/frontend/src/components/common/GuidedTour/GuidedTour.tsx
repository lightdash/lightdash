import { Box, Button, Group, Paper, Portal, Stack, Text } from '@mantine/core';
import { clsx } from 'clsx';
import type React from 'react';
import {
    type FC,
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { cardLayout } from './cardLayout';
import styles from './GuidedTour.module.css';

export type GuidedTourStep = {
    /** CSS selector resolved at step time; null renders a centered explainer. */
    target: string | null;
    title: string;
    body: ReactNode;
    /**
     * Route the step lives on. When the step is reached and `onNavigate` is
     * provided, the tour asks the host to go there first, so a walkthrough
     * can span pages (homepage, then a list page, then back).
     */
    route?: string;
    /**
     * Let the learner act on the page: no click-blocking layer, only the dim
     * and the spotlight ring. Used when the step is "do this", not "look at
     * this".
     */
    interactive?: boolean;
    /** Move to the next step as soon as the target element is clicked. */
    advanceOnTargetClick?: boolean;
    /**
     * The target is a text input: move on once the learner has typed
     * something into it and paused (three or more characters, then a beat
     * with no further typing).
     */
    advanceOnTargetInput?: boolean;
    /**
     * For a typed step: a value the card offers, with a button that fills
     * the field, so the learner can accept it or type their own.
     */
    suggestion?: string;
    /**
     * The click path to `target` (nav button, menu item, trigger, ...). While
     * `target` is not on the page, the spotlight sits on the deepest `via`
     * control that is, so it follows the learner along the path.
     */
    via?: string[];
    /**
     * Controls that lead to `target` on the instances that show them (a
     * chooser some configurations put before a form). While one is on the
     * page and `target` is not, the ring and the card's title move to it at
     * once; nothing waits, since the product says this is the way through.
     */
    detour?: { target: string; title: string }[];
    /**
     * Selector of the page's own "still working" surface for this step (a
     * streaming reply, a running query). While it is on the page the step is
     * not finished: the ring follows it, the card shows the product's own
     * status words (the last `[data-tour-status]` inside it) and the button
     * that moves on is held until the work is done.
     */
    busy?: string;
};

export type TourPoint = { x: number; y: number };

type GuidedTourProps = {
    steps: GuidedTourStep[];
    opened: boolean;
    onClose: () => void;
    /** Fired on Got it at the last step, before `onClose`; not on Skip. */
    onFinish?: () => void;
    /**
     * Fired when the user navigates to another step (Next/Back), with the new
     * step index. Not fired on close, so side effects (e.g. a modal a step
     * opened) survive finishing the tour.
     */
    onStepChange?: (
        stepIndex: number,
        /** Where the click that advanced the tour landed, if it was a click. */
        beacon: TourPoint | null,
    ) => void;
    /**
     * Called with a step's `route` when that step is reached (including the
     * first step on open). The host decides whether to navigate.
     */
    onNavigate?: (route: string) => void;
    /**
     * Step to open on. A host that remounts mid-tour (the learner clicked into
     * a page under another layout) passes the step it had reached.
     */
    initialStepIndex?: number;
    /**
     * Where the ring was collapsed to when the host remounted: the tour opens
     * as a waiting beacon at that point instead of a centred card, and the
     * card appears only once the step's control is on the page.
     */
    initialBeacon?: TourPoint | null;
    /**
     * Show a Back button. Off for walkthroughs where steps change state: going
     * back after the learner has acted leaves the earlier steps describing a
     * page that no longer looks like that.
     */
    allowBack?: boolean;
};

const SPOTLIGHT_PADDING = 6;
/** Ring travel time between controls (matches the CSS easing). */
const GLIDE_MS = 600;
/** Set on the document while the beacon stands in for the cursor. */
const CURSOR_CLASS = 'ld-tour-beacon-cursor';
/** Set on the control the tour currently points at. */
const TARGET_ATTRIBUTE = 'data-tour-active';
/** Shrink of a ring into a beacon when its control was clicked. */
const COLLAPSE_MS = 250;
/** The card growing out of the beacon at the next control. */
const CARD_EXPAND_MS = 280;
/** How long a step waits for its own control before falling back along the path. */
const FALLBACK_GRACE_MS = 1500;
/** How long a step waits for a control that has not appeared yet. */
const TARGET_PATIENCE_MS = 15000;
/**
 * How long the beacon waits alone before the card comes back. Shorter than
 * the patience above on purpose: a card returning early costs nothing (it
 * re-anchors the moment the control appears), while a beacon alone for
 * long reads as a page that has died.
 */
const CARD_RETURN_MS = 4000;
/** A typed-input step counts as done after this many characters and a pause. */
const MIN_INPUT_CHARS = 3;
const INPUT_SETTLE_MS = 900;
/** Used until the card has been measured. */
const CARD_FALLBACK_HEIGHT = 220;

const clips = (style: CSSStyleDeclaration) =>
    /(auto|scroll|hidden)/.test(style.overflowY) ||
    /(auto|scroll|hidden)/.test(style.overflowX);

/**
 * Whether the whole element can be seen: inside the window, and inside
 * every scrolling ancestor (a modal body, a sidebar) that could clip it.
 * A field below a modal's fold is inside the window yet invisible; the ring
 * would otherwise land on whatever shows through at that spot.
 */
const isInViewport = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (
        r.top < 0 ||
        r.left < 0 ||
        r.bottom > window.innerHeight ||
        r.right > window.innerWidth
    ) {
        return false;
    }
    for (let p = el.parentElement; p; p = p.parentElement) {
        if (clips(getComputedStyle(p))) {
            const pr = p.getBoundingClientRect();
            if (
                r.top < pr.top ||
                r.bottom > pr.bottom ||
                r.left < pr.left ||
                r.right > pr.right
            ) {
                return false;
            }
        }
    }
    // Something else on the page can lie over it (a message's actions
    // scrolled under a sticky composer). The tour's own layers do not count.
    const covering = document
        .elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        .find((candidate) => !candidate.closest('[data-tour-root]'));
    if (covering && !el.contains(covering) && !covering.contains(el)) {
        return false;
    }
    return true;
};

const sameRect = (a: DOMRect | null, b: DOMRect | null) =>
    !!a &&
    !!b &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5;

/**
 * Track a target element's viewport rect while the tour is open. Sampled
 * every frame, but a rect is only published once it has held still for two
 * frames (a menu item is measured while its menu is still animating open)
 * and only when it actually changed, so consumers can key effects on it.
 */
const useTargetRect = (
    selector: string | null,
    active: boolean,
): DOMRect | null => {
    const [rect, setRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        // A new step (or a page change) starts with no highlight; the previous
        // element's box must never linger while the next target is looked up.
        setRect(null);
        if (!active || !selector) {
            return undefined;
        }
        let el: Element | null = null;
        let last: DOMRect | null = null;
        let published: DOMRect | null = null;
        let frame = 0;
        const tick = () => {
            if (el && !el.isConnected) {
                el = null;
                last = null;
                published = null;
                setRect(null);
            }
            if (!el) {
                el = document.querySelector(selector);
                if (el && !isInViewport(el)) {
                    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
                // The page can tell which control the tour points at: a
                // control shown only on hover (a comment's actions) uses
                // this to show itself while it is the target.
                el?.setAttribute(TARGET_ATTRIBUTE, '');
            }
            if (el) {
                const current = el.getBoundingClientRect();
                if (sameRect(current, last) && !sameRect(current, published)) {
                    published = current;
                    setRect(current);
                }
                last = current;
            }
            frame = window.requestAnimationFrame(tick);
        };
        tick();
        return () => {
            window.cancelAnimationFrame(frame);
            el?.removeAttribute(TARGET_ATTRIBUTE);
        };
    }, [selector, active]);

    return rect;
};

type Resolved = {
    selector: string | null;
    /** Set while the ring sits on a detour control: that control's title. */
    detourTitle: string | null;
};

/**
 * Which selector to spotlight right now: the step's target when it is on the
 * page, else a `detour` control that is (the way to the target on this
 * instance), else the deepest `via` control that is (later controls only
 * exist once earlier ones were clicked, and earlier ones such as a nav
 * button stay on the page), else nothing.
 */
const useResolvedSelector = (
    step: GuidedTourStep | undefined,
    active: boolean,
): Resolved => {
    const target = active ? (step?.target ?? null) : null;
    const via = active ? step?.via : undefined;
    const detour = active ? step?.detour : undefined;
    const [resolved, setResolved] = useState<Resolved>({
        selector: target,
        detourTitle: null,
    });

    useEffect(() => {
        const hasVia = via !== undefined && via.length > 0;
        const hasDetour = detour !== undefined && detour.length > 0;
        if (!target || (!hasVia && !hasDetour)) {
            setResolved({ selector: target, detourTitle: null });
            return undefined;
        }
        // Fallbacks are for a menu the learner closed by accident, not for a
        // control that is still loading after their click (a page, a list the
        // server fills in): until the target has been seen once, wait for it
        // as long as patience allows; once seen and gone, give it a moment
        // before dropping back to an earlier control on the path. A detour
        // is different: the product says that control leads here, so it is
        // taken the moment it is on the page.
        const since = Date.now();
        let seen = false;
        const tick = () => {
            if (document.querySelector(target)) {
                seen = true;
                setResolved({ selector: target, detourTitle: null });
                return;
            }
            const hop = detour?.find((d) => document.querySelector(d.target));
            if (hop) {
                setResolved({ selector: hop.target, detourTitle: hop.title });
                return;
            }
            const patience = seen ? FALLBACK_GRACE_MS : TARGET_PATIENCE_MS;
            if (Date.now() - since < patience) {
                setResolved({ selector: null, detourTitle: null });
                return;
            }
            setResolved({
                selector:
                    [...(via ?? [])]
                        .reverse()
                        .find((selector) => document.querySelector(selector)) ??
                    null,
                detourTitle: null,
            });
        };
        tick();
        const poll = window.setInterval(tick, 150);
        return () => window.clearInterval(poll);
    }, [target, via, detour]);

    return resolved;
};

/**
 * Whether the step's `busy` surface is on the page, and what it says. Polled
 * like the other selectors: the surface appears and disappears on its own.
 */
const useBusy = (
    selector: string | undefined,
    active: boolean,
): { busy: boolean; status: string } => {
    const [state, setState] = useState({ busy: false, status: '' });
    useEffect(() => {
        if (!selector || !active) {
            setState({ busy: false, status: '' });
            return undefined;
        }
        const tick = () => {
            const el = document.querySelector(selector);
            const statuses = el?.querySelectorAll('[data-tour-status]');
            const last = statuses?.[statuses.length - 1];
            const next = {
                busy: el !== null,
                status: last?.textContent?.trim() ?? '',
            };
            setState((previous) =>
                previous.busy === next.busy && previous.status === next.status
                    ? previous
                    : next,
            );
        };
        tick();
        const poll = window.setInterval(tick, 150);
        return () => window.clearInterval(poll);
    }, [selector, active]);
    return state;
};

/**
 * The cutout: the ring plus the page-wide shadow, one box-shadow. The shadow
 * never lifts during a tour; the hole glides to the next control on Next and
 * closes to a point when the control was clicked. `pulse` marks the control
 * whose click is the way forward.
 */
/**
 * A typed anchor whose field is an editor the kit cannot read by itself (a
 * Monaco editor) attaches its editor here on mount; the kit fills and reads
 * through it. Typing into the editor still bubbles `input` events to the
 * anchor, which is what advances the step.
 */
export type TourEditable = {
    tourEditor?: { getValue: () => string; setValue: (value: string) => void };
};

type AceLike = {
    setValue: (value: string, cursorPosition?: number) => void;
    getValue: () => string;
    focus: () => void;
};

/**
 * The Ace editor mounted on (or inside) an element: Ace keeps its editor on
 * the container as `env.editor`, and a SQL field in the product is one.
 */
const aceEditorIn = (el: HTMLElement): AceLike | undefined => {
    const container = el.classList.contains('ace_editor')
        ? el
        : el.querySelector<HTMLElement>('.ace_editor');
    return (container as (HTMLElement & { env?: { editor?: AceLike } }) | null)
        ?.env?.editor;
};

/**
 * Put a value into the highlighted field the way typing would: through the
 * native setter so React sees the change, then an input event so the step's
 * own listener advances the tour. A rich text editor (a contenteditable, or
 * a wrapper holding one) is typed into instead, which its own editor sees.
 */
const fillTarget = (selector: string, value: string) => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    const own = (el as HTMLElement & TourEditable).tourEditor;
    if (own) {
        own.setValue(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
        return;
    }
    const ace = aceEditorIn(el);
    if (ace) {
        ace.setValue(value, 1);
        ace.focus();
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }
    const editable = el.isContentEditable
        ? el
        : el.querySelector<HTMLElement>('[contenteditable="true"]');
    if (editable) {
        editable.focus();
        document.execCommand('insertText', false, value);
        return;
    }
    // The native setter of the field's own kind, so React sees the change.
    const setter = Object.getOwnPropertyDescriptor(
        el instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype,
        'value',
    )?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
};

const collapsedRect = (rect: DOMRect): DOMRect =>
    new DOMRect(rect.left + rect.width / 2, rect.top + rect.height / 2, 0, 0);

const Spotlight: FC<{
    rect: DOMRect;
    gliding: boolean;
    beacon: boolean;
    /** The beacon is waiting for the next control to appear. */
    waiting: boolean;
    pulse: boolean;
}> = ({ rect, gliding, beacon, waiting, pulse }) => {
    const padding = beacon ? 0 : SPOTLIGHT_PADDING;
    return (
        <Box
            className={clsx(
                styles.spotlight,
                gliding && styles.spotlightGliding,
                beacon && styles.spotlightBeacon,
                beacon && waiting && styles.spotlightWaiting,
                pulse && !beacon && styles.spotlightPulse,
            )}
            __vars={{
                '--tour-top': `${rect.top - padding}px`,
                '--tour-left': `${rect.left - padding}px`,
                '--tour-width': `${rect.width + padding * 2}px`,
                '--tour-height': `${rect.height + padding * 2}px`,
            }}
        />
    );
};

/** Keep the rendered card's height so it can be flipped without guessing. */
const useCardHeight = (): [number, (el: HTMLDivElement | null) => void] => {
    const [height, setHeight] = useState(CARD_FALLBACK_HEIGHT);
    const [el, setEl] = useState<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!el) return;
        const observer = new ResizeObserver(() => {
            // Layout height, not the bounding box: while the card collapses
            // or expands it is scaled, and a height read mid-animation would
            // let the card be placed off screen later.
            setHeight(el.offsetHeight);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [el]);

    return [height, setEl];
};

/**
 * A blocker must not only swallow the click but keep it from reaching the
 * document: menus and popovers close on any outside mousedown they hear, and
 * a walkthrough step that opened a menu would silently step backwards.
 */
const swallow = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
};
/** Keep an event from reaching the page without cancelling its default. */
const swallowQuietly = (event: React.SyntheticEvent) => {
    event.stopPropagation();
};

/** Menus, selects and hover cards all render one of these. */
const DROPDOWN_SELECTOR = '.mantine-Popover-dropdown';

/**
 * Put away the menus a step left open. Swallowing the presses outside the
 * spotlight is what holds a menu open through the click that moves the
 * walkthrough on, and nothing else will close it afterwards: it would sit
 * over the steps that follow and over whatever the host shows when the tour
 * ends. The one the tour is pointing inside is left alone (a comment thread
 * stays open while its step types into it).
 *
 * Escape is dispatched on the dropdown and does not bubble: React still runs
 * the dropdown's own capture handler, while the window-level listeners that
 * close a modal or a drawer never hear it, so a dialog a step opened on
 * purpose survives.
 */
const closeOpenDropdowns = (keep: Element | null) => {
    document.querySelectorAll(DROPDOWN_SELECTOR).forEach((dropdown) => {
        if (keep && dropdown.contains(keep)) return;
        dropdown.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: false }),
        );
    });
};

const BLOCKER_HANDLERS = {
    onPointerDown: swallow,
    onMouseDown: swallow,
    onMouseUp: swallow,
    onClick: swallow,
    onTouchStart: swallow,
    onContextMenu: swallow,
};

export const GuidedTour: FC<GuidedTourProps> = ({
    steps,
    opened,
    onClose,
    onFinish,
    onStepChange,
    onNavigate,
    allowBack = true,
    initialStepIndex = 0,
    initialBeacon = null,
}) => {
    const [stepIndex, setStepIndex] = useState(initialStepIndex);
    const [cardHeight, cardRef] = useCardHeight();

    const step = steps[stepIndex];
    // Each step resolves its own target when reached (rows may load late), so a
    // step with a not-yet-rendered target just shows a centered card until it
    // appears, rather than being dropped.
    const { selector: resolvedSelector, detourTitle } = useResolvedSelector(
        step,
        opened,
    );
    // While the page is still working on this step, the ring sits on that
    // work rather than on the finished surface.
    const { busy, status } = useBusy(step?.busy, opened);
    const spotlightSelector = busy && step?.busy ? step.busy : resolvedSelector;
    const rect = useTargetRect(spotlightSelector, opened);
    // How the last step change happened: Next glides the ring from the old
    // control to the new one; a click on the control shrinks the ring into a
    // beacon at the click (the control usually vanishes: a menu item, a link)
    // that waits until the next control is on screen, then travels to it and
    // opens up again.
    const advanceByClickRef = useRef(false);
    const [beacon, setBeacon] = useState(initialBeacon !== null);
    // The card follows the ring into the beacon: it collapses with the old
    // step's text, swaps text while hidden, and expands at the new control
    // once the ring has opened there. `shownStepIndex` lags `stepIndex` for
    // exactly that hidden moment.
    const [shownStepIndex, setShownStepIndex] = useState(initialStepIndex);
    const [cardPhase, setCardPhase] = useState<
        'shown' | 'collapsing' | 'hidden' | 'expanding'
    >(initialBeacon ? 'hidden' : 'shown');
    // Where the ring is drawn: the live target, the beacon point while
    // waiting, or the last target while the next one is found on Next.
    const [shownRect, setShownRect] = useState<DOMRect | null>(
        initialBeacon
            ? new DOMRect(initialBeacon.x, initialBeacon.y, 0, 0)
            : null,
    );
    // Where the card is anchored: never the beacon point, so the card holds
    // its place until the next control is known instead of jumping.
    const [cardRect, setCardRect] = useState<DOMRect | null>(null);
    // The position transition is on only for a moment after a move starts,
    // so scroll and resize still track instantly afterwards.
    const [gliding, setGliding] = useState(false);
    // Held so the timer is cleared on unmount: its callback sets state, and
    // firing after teardown throws on a window that no longer exists.
    const glideTimer = useRef<number | undefined>(undefined);
    const glideFor = useCallback((ms: number) => {
        setGliding(true);
        window.clearTimeout(glideTimer.current);
        glideTimer.current = window.setTimeout(() => setGliding(false), ms);
    }, []);
    useEffect(() => () => window.clearTimeout(glideTimer.current), []);
    // The ring effect below answers to the target rect alone: the beacon,
    // card phase and step it reads are mirrored into refs so a change in
    // any of them does not re-run it (a click's beacon must wait for the
    // next control, not bounce open on the one just clicked).
    const beaconRef = useRef(beacon);
    useEffect(() => {
        beaconRef.current = beacon;
    }, [beacon]);
    const cardPhaseRef = useRef(cardPhase);
    useEffect(() => {
        cardPhaseRef.current = cardPhase;
    }, [cardPhase]);
    const stepIndexRef = useRef(stepIndex);
    useEffect(() => {
        stepIndexRef.current = stepIndex;
    }, [stepIndex]);
    // The step the ring last glided for: Next moves the ring from the old
    // control to the new one with the same glide a beacon uses, once, even
    // when the new control takes a moment to appear.
    const glidedForStepRef = useRef(initialStepIndex);
    // The control the ring has just arrived at may still settle (a navbar
    // button loading in, a dialog growing), so the pending card expansion
    // must survive rect changes and open at wherever the control ended up.
    const latestRectRef = useRef<DOMRect | null>(null);
    const expandTimeoutRef = useRef<number | null>(null);
    useEffect(() => {
        if (!rect) {
            // The control went away under a read step (a tile removed):
            // the card centres, with its buttons, rather than staying
            // anchored to nothing.
            if (!beaconRef.current && cardPhaseRef.current === 'shown')
                setCardRect(null);
            return;
        }
        latestRectRef.current = rect;
        setShownRect(rect);
        if (beaconRef.current) {
            // the beacon travels to the new control and opens; the card
            // expands out of it once the ring has arrived
            setBeacon(false);
            glidedForStepRef.current = stepIndexRef.current;
            glideFor(GLIDE_MS);
            expandTimeoutRef.current = window.setTimeout(() => {
                setCardRect(latestRectRef.current);
                setCardPhase('expanding');
                // Chained onto the same ref, which the outer timer has just
                // released, so unmount clears whichever is still pending.
                expandTimeoutRef.current = window.setTimeout(() => {
                    expandTimeoutRef.current = null;
                    setCardPhase('shown');
                }, CARD_EXPAND_MS);
            }, GLIDE_MS);
            return;
        }
        if (glidedForStepRef.current !== stepIndexRef.current) {
            glidedForStepRef.current = stepIndexRef.current;
            glideFor(GLIDE_MS);
        }
        if (cardPhaseRef.current === 'shown') setCardRect(rect);
    }, [rect, glideFor]);
    useEffect(
        () => () => {
            if (expandTimeoutRef.current !== null)
                window.clearTimeout(expandTimeoutRef.current);
        },
        [],
    );
    useEffect(() => {
        if (!opened) {
            setShownRect(null);
            setCardRect(null);
            setBeacon(false);
            setCardPhase('shown');
            setShownStepIndex(0);
        }
    }, [opened]);
    useEffect(() => {
        if (advanceByClickRef.current) {
            advanceByClickRef.current = false;
            setBeacon(true);
            setShownRect((previous) =>
                previous ? collapsedRect(previous) : previous,
            );
            glideFor(COLLAPSE_MS);
            // card: collapse with the old text, then swap text while hidden
            setCardPhase('collapsing');
            const timeout = window.setTimeout(() => {
                setCardPhase('hidden');
                setShownStepIndex(stepIndex);
            }, COLLAPSE_MS);
            return () => window.clearTimeout(timeout);
        }
        setShownStepIndex(stepIndex);
        glideFor(GLIDE_MS);
        return undefined;
    }, [stepIndex, glideFor]);

    // While the beacon waits for the next control it becomes the cursor:
    // the native pointer is hidden and the beacon follows the mouse, so the
    // wait reads as "loading" wherever the learner looks, then the beacon
    // travels from the pointer to the control when it appears. Touch has no
    // pointer, so the beacon stays at the click.
    const waiting = opened && beacon && rect === null;
    useEffect(() => {
        if (!waiting) return undefined;
        document.documentElement.classList.add(CURSOR_CLASS);
        let frame: number | null = null;
        const follow = (event: MouseEvent) => {
            if (frame !== null) return;
            frame = window.requestAnimationFrame(() => {
                frame = null;
                setShownRect(new DOMRect(event.clientX, event.clientY, 0, 0));
            });
        };
        window.addEventListener('mousemove', follow, true);
        return () => {
            document.documentElement.classList.remove(CURSOR_CLASS);
            window.removeEventListener('mousemove', follow, true);
            if (frame !== null) window.cancelAnimationFrame(frame);
        };
    }, [waiting]);

    // A control that never arrives (a screen this instance does not have)
    // would otherwise hide the card for good, leaving the page blocked with
    // no way out but a new tab. After a short wait the card comes back,
    // centred, saying it is still waiting, so Skip is always within reach;
    // the beacon keeps waiting and the card still opens at the control if
    // it turns up.
    const [cardReturned, setCardReturned] = useState(false);
    useEffect(() => {
        if (!waiting) {
            setCardReturned(false);
            return undefined;
        }
        const timeout = window.setTimeout(() => {
            setCardRect(null);
            setCardPhase('shown');
            setCardReturned(true);
        }, CARD_RETURN_MS);
        return () => window.clearTimeout(timeout);
    }, [waiting]);

    // When the work finishes the ring travels to the finished surface.
    const wasBusyRef = useRef(false);
    useEffect(() => {
        if (wasBusyRef.current && !busy) glideFor(GLIDE_MS);
        wasBusyRef.current = busy;
    }, [busy, glideFor]);

    const isLast = stepIndex === steps.length - 1;

    const handleClose = useCallback(() => {
        // Whatever the walkthrough left open goes with it: the host shows the
        // completion dialog on the page behind, and a menu floats over it.
        closeOpenDropdowns(null);
        setStepIndex(0);
        onClose();
    }, [onClose]);
    // Centre of the control whose click advanced the tour, for the host to
    // keep: a remount mid-tour then resumes as a beacon at that point.
    const clickPointRef = useRef<TourPoint | null>(null);
    const goToStep = useCallback(
        (index: number) => {
            setStepIndex(index);
            onStepChange?.(index, clickPointRef.current);
            clickPointRef.current = null;
        },
        [onStepChange],
    );
    const handleNext = useCallback(() => {
        if (isLast) {
            onFinish?.();
            handleClose();
            return;
        }
        goToStep(stepIndex + 1);
    }, [isLast, onFinish, handleClose, goToStep, stepIndex]);
    const handleBack = () => goToStep(Math.max(0, stepIndex - 1));

    // A step that lives on another page asks the host to go there first.
    const route = opened ? step?.route : undefined;
    useEffect(() => {
        if (route) onNavigate?.(route);
    }, [route, onNavigate]);

    // A step pointing outside a menu the learner opened closes that menu,
    // once its own control is on the page: waiting for the control is what
    // spares the menu a step is about to point into, whose items appear with
    // it. A step pointing at nothing (a centred explainer) closes them all.
    const stepTarget = opened ? (step?.target ?? null) : null;
    useEffect(() => {
        if (!opened) return undefined;
        if (!stepTarget) {
            closeOpenDropdowns(null);
            return undefined;
        }
        // Once per step: a menu the learner opens for themselves on a
        // hands-on step is theirs to keep.
        let poll = 0;
        let closed = false;
        const tick = () => {
            const el = document.querySelector(stepTarget);
            if (!el) return;
            closed = true;
            window.clearInterval(poll);
            closeOpenDropdowns(el);
        };
        tick();
        if (!closed) poll = window.setInterval(tick, 150);
        return () => window.clearInterval(poll);
    }, [opened, stepIndex, stepTarget]);

    // "Do this" steps advance themselves when the target is clicked. The
    // target may render late (e.g. a menu item), so keep looking for it.
    const advanceSelector =
        opened && step?.advanceOnTargetClick ? step.target : null;
    useEffect(() => {
        if (!advanceSelector) return undefined;
        let el: Element | null = null;
        const onClick = () => {
            advanceByClickRef.current = true;
            const at = el?.getBoundingClientRect();
            clickPointRef.current = at
                ? { x: at.left + at.width / 2, y: at.top + at.height / 2 }
                : null;
            handleNext();
        };
        const tick = () => {
            if (el && !el.isConnected) {
                el.removeEventListener('click', onClick);
                el = null;
            }
            if (!el) {
                el = document.querySelector(advanceSelector);
                el?.addEventListener('click', onClick);
            }
        };
        tick();
        const poll = window.setInterval(tick, 150);
        return () => {
            window.clearInterval(poll);
            el?.removeEventListener('click', onClick);
        };
    }, [advanceSelector, handleNext]);

    // Typed-input steps advance once the field has a value and the learner
    // pauses; the field may render late (a dialog), so keep looking for it.
    const inputSelector =
        opened && step?.advanceOnTargetInput ? step.target : null;
    useEffect(() => {
        if (!inputSelector) return undefined;
        let el: HTMLElement | null = null;
        let debounce = 0;
        // What the field holds: an input's value, or a rich text editor's
        // text (the editor itself, or one inside the anchored wrapper).
        const typed = () => {
            if (!el) return '';
            const own = (el as HTMLElement & TourEditable).tourEditor;
            if (own) return own.getValue();
            const ace = aceEditorIn(el);
            if (ace) return ace.getValue();
            if ('value' in el) return String((el as HTMLInputElement).value);
            const editable = el.isContentEditable
                ? el
                : el.querySelector<HTMLElement>('[contenteditable="true"]');
            return editable?.innerText ?? '';
        };
        const onInput = () => {
            window.clearTimeout(debounce);
            if (typed().trim().length < MIN_INPUT_CHARS) return;
            debounce = window.setTimeout(() => handleNext(), INPUT_SETTLE_MS);
        };
        const tick = () => {
            if (el && !el.isConnected) {
                el.removeEventListener('input', onInput);
                el = null;
            }
            if (!el) {
                el = document.querySelector<HTMLElement>(inputSelector);
                el?.addEventListener('input', onInput);
            }
        };
        tick();
        const poll = window.setInterval(tick, 150);
        return () => {
            window.clearInterval(poll);
            window.clearTimeout(debounce);
            el?.removeEventListener('input', onInput);
        };
    }, [inputSelector, handleNext]);

    // A hands-on look: the learner may use the highlighted surface (drag a
    // tile, resize it) and moves on with the button. Nothing is blocked,
    // because a drag that ends over a blocker would be swallowed and leave
    // the page mid-drag; the ring keeps following the surface as it changes.
    const handsOn =
        !!step?.interactive &&
        rect !== null &&
        !step.advanceOnTargetClick &&
        !step.advanceOnTargetInput &&
        !isLast;
    // Hands-on means drag and resize, not the controls in and around the
    // surface: a tile's menu could remove the very thing being looked at.
    // Clicks on buttons, links and menu items (the card's own excepted) are
    // swallowed at the document, before anything can act on them; pointer
    // moves and presses, which drags and resizes are made of, pass.
    useEffect(() => {
        if (!handsOn) return undefined;
        const guard = (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (!target || target.closest('[data-tour-card]')) return;
            if (
                target.closest(
                    'button, a, [role="button"], [role="menuitem"], input, select, textarea',
                )
            ) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        document.addEventListener('click', guard, true);
        return () => document.removeEventListener('click', guard, true);
    }, [handsOn]);
    if (!opened || !step) return null;

    const isFirst = stepIndex === 0;
    const layout = cardRect ? cardLayout(cardRect, cardHeight) : null;
    // What the card shows: the current step, except while it is collapsing
    // with the previous step's text.
    const shownStep = steps[shownStepIndex] ?? step;
    // On a detour the card names the control it points at, not the target.
    const shownTitle =
        detourTitle !== null && shownStepIndex === stepIndex
            ? detourTitle
            : shownStep.title;
    const shownIsLast = shownStepIndex === steps.length - 1;
    // The highlighted control is clickable while it is on the way to the
    // target (a `via` control) or when clicking the target is what advances
    // the step. A target that only gets looked at (the closing step, or an
    // explanation) stays inert; the learner moves on with the button.
    const clickThrough =
        step.interactive &&
        rect !== null &&
        (spotlightSelector !== step.target ||
            step.advanceOnTargetClick ||
            step.advanceOnTargetInput);

    const cardBody = (
        <Paper
            ref={cardRef}
            radius="md"
            p="md"
            withBorder={false}
            className={styles.paper}
            // For drivers and flows: the tour's own card, not any other Paper.
            data-tour-card={shownStepIndex + 1}
            // A press on the card is not a click outside the page's open
            // popover (a comment thread stays open while Use it fills its
            // editor): stop it before the document-level listeners see it.
            onMouseDown={swallowQuietly}
            onPointerDown={swallowQuietly}
            onTouchStart={swallowQuietly}
        >
            {layout && layout.placement !== 'inside' && !busy && (
                <Box
                    className={clsx(
                        styles.caret,
                        layout.placement === 'below'
                            ? styles.caretTop
                            : styles.caretBottom,
                    )}
                    __vars={{ '--tour-caret-left': `${layout.caretLeft}px` }}
                />
            )}
            <Stack gap="sm">
                <Stack gap={6}>
                    <Text className={styles.eyebrow}>
                        Step {shownStepIndex + 1} of {steps.length}
                    </Text>
                    {/* While the page is still working, its own words for
                        what it is doing take the title's place, so the state
                        is the first thing read; the step's title returns
                        once the work is done. */}
                    <Text
                        fw={600}
                        fz="md"
                        lh={1.3}
                        data-tour-card-status={
                            busy && status !== '' ? status : undefined
                        }
                    >
                        {busy && status !== '' ? status : shownTitle}
                    </Text>
                    {busy && status !== '' && (
                        <Text fz="xs" c="dimmed">
                            {shownTitle}
                        </Text>
                    )}
                    {shownStep.body !== '' && (
                        <Box fz="sm" c="dimmed">
                            {shownStep.body}
                        </Box>
                    )}
                    {cardReturned && waiting && (
                        <Text fz="xs" c="dimmed" data-tour-card-waiting>
                            Still waiting for the page to show the next control.
                            You can skip if it does not appear.
                        </Text>
                    )}
                </Stack>
                <Group justify="space-between" align="center">
                    <Button
                        variant="subtle"
                        color="gray"
                        size="compact-sm"
                        onClick={handleClose}
                    >
                        Skip
                    </Button>
                    <Box className={styles.dots}>
                        {steps.map((s, i) => (
                            <Box
                                // by position: a walkthrough can repeat a
                                // title (the same control on the way back)
                                // eslint-disable-next-line react/no-array-index-key
                                key={`${i}-${s.title}`}
                                className={clsx(
                                    styles.dot,
                                    i === shownStepIndex && styles.dotActive,
                                )}
                            />
                        ))}
                    </Box>
                    <Group gap="xs">
                        {allowBack && !isFirst && (
                            <Button
                                variant="default"
                                size="compact-sm"
                                onClick={handleBack}
                            >
                                Back
                            </Button>
                        )}
                        {shownStep.advanceOnTargetClick ||
                        shownStep.advanceOnTargetInput ? (
                            // The highlighted control is the way forward; a
                            // Next button here would compete with it.
                            shownStep.advanceOnTargetInput &&
                            shownStep.suggestion ? (
                                <Group gap="xs" wrap="nowrap">
                                    <Text fz="xs" c="dimmed">
                                        Type here, or use{' '}
                                        <Text
                                            component="span"
                                            fz="xs"
                                            fw={600}
                                            c="inherit"
                                            data-tour-suggestion={
                                                shownStep.suggestion
                                            }
                                        >
                                            {shownStep.suggestion}
                                        </Text>
                                    </Text>
                                    <Button
                                        size="compact-xs"
                                        variant="default"
                                        className={styles.buttonPulse}
                                        onClick={() =>
                                            shownStep.target &&
                                            fillTarget(
                                                shownStep.target,
                                                shownStep.suggestion!,
                                            )
                                        }
                                    >
                                        Use it
                                    </Button>
                                </Group>
                            ) : (
                                <Text fz="xs" c="dimmed">
                                    {shownStep.advanceOnTargetInput
                                        ? 'Type in the highlighted field to continue'
                                        : 'Click the highlighted control to continue'}
                                </Text>
                            )
                        ) : (
                            // When the button is the way forward, it gets the
                            // same pulse a highlighted control would.
                            <Button
                                size="compact-sm"
                                onClick={handleNext}
                                // Held, with a loader, while the page is
                                // still working on this step.
                                loading={busy}
                                className={
                                    busy ? undefined : styles.buttonPulse
                                }
                            >
                                {shownIsLast ? 'Got it' : 'Next'}
                            </Button>
                        )}
                    </Group>
                </Group>
            </Stack>
        </Paper>
    );

    return (
        <Portal>
            <Box
                // For drivers: the whole tour layer, to hide for a clean shot.
                data-tour-root
                className={clsx(
                    styles.root,
                    step.interactive && styles.rootInteractive,
                )}
            >
                {handsOn ? null : clickThrough && rect ? (
                    // Interactive step: only the highlighted control is
                    // clickable. Four blockers frame the spotlight so every
                    // click outside it is swallowed.
                    <>
                        <Box
                            className={styles.blocker}
                            {...BLOCKER_HANDLERS}
                            __vars={{
                                '--blk-top': '0px',
                                '--blk-left': '0px',
                                '--blk-width': '100vw',
                                '--blk-height': `${Math.max(0, rect.top - SPOTLIGHT_PADDING)}px`,
                            }}
                        />
                        <Box
                            className={styles.blocker}
                            {...BLOCKER_HANDLERS}
                            __vars={{
                                '--blk-top': `${rect.bottom + SPOTLIGHT_PADDING}px`,
                                '--blk-left': '0px',
                                '--blk-width': '100vw',
                                '--blk-height': `${Math.max(0, window.innerHeight - rect.bottom - SPOTLIGHT_PADDING)}px`,
                            }}
                        />
                        <Box
                            className={styles.blocker}
                            {...BLOCKER_HANDLERS}
                            __vars={{
                                '--blk-top': `${rect.top - SPOTLIGHT_PADDING}px`,
                                '--blk-left': '0px',
                                '--blk-width': `${Math.max(0, rect.left - SPOTLIGHT_PADDING)}px`,
                                '--blk-height': `${rect.height + SPOTLIGHT_PADDING * 2}px`,
                            }}
                        />
                        <Box
                            className={styles.blocker}
                            {...BLOCKER_HANDLERS}
                            __vars={{
                                '--blk-top': `${rect.top - SPOTLIGHT_PADDING}px`,
                                '--blk-left': `${rect.right + SPOTLIGHT_PADDING}px`,
                                '--blk-width': `${Math.max(0, window.innerWidth - rect.right - SPOTLIGHT_PADDING)}px`,
                                '--blk-height': `${rect.height + SPOTLIGHT_PADDING * 2}px`,
                            }}
                        />
                    </>
                ) : (
                    // Nothing highlighted yet (or a read-only step): block
                    // the whole page.
                    <Box
                        className={styles.blocker}
                        {...BLOCKER_HANDLERS}
                        __vars={{
                            '--blk-top': '0px',
                            '--blk-left': '0px',
                            '--blk-width': '100vw',
                            '--blk-height': '100vh',
                        }}
                    />
                )}
                {shownRect ? (
                    <Spotlight
                        rect={shownRect}
                        gliding={gliding}
                        beacon={beacon}
                        waiting={beacon && rect === null}
                        pulse={clickThrough === true && !handsOn}
                    />
                ) : (
                    <Box className={styles.dim} />
                )}
                {cardPhase === 'hidden' ? null : busy ? (
                    // The ring is following work that moves and reshapes;
                    // the card parks out of its way so it can be read.
                    <Box className={styles.cardDocked}>{cardBody}</Box>
                ) : layout ? (
                    <Box
                        className={clsx(
                            styles.card,
                            gliding &&
                                cardPhase === 'shown' &&
                                styles.cardGliding,
                            cardPhase === 'collapsing' && styles.cardCollapse,
                            cardPhase === 'expanding' && styles.cardExpand,
                        )}
                        __vars={{
                            '--tour-card-top': `${layout.top}px`,
                            '--tour-card-left': `${layout.left}px`,
                            '--tour-card-width': `${layout.width}px`,
                            // where the card grows from / shrinks to: its caret
                            '--tour-caret-left': `${layout.caretLeft}px`,
                            '--tour-origin-y':
                                layout.placement === 'above' ? '100%' : '0',
                        }}
                    >
                        {cardBody}
                    </Box>
                ) : (
                    <Box className={styles.cardCentered}>{cardBody}</Box>
                )}
            </Box>
        </Portal>
    );
};
