import { AI_THREAD_IMAGES_MAX_PER_PROMPT } from '@lightdash/common';
import { Box } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import useToaster from '../../../hooks/toaster/useToaster';
import { grabAppFrame } from './appFrame';
import { bubbleColor, nextBubbleColor } from './bubblePalette';
import { bringToFront, stackOrder } from './bubbleStack';
import { buildSummary } from './buildSummary';
import { type ShiftUpAction } from './captureReducer';
import { classifyMark } from './classifyStroke';
import DesignBubble from './components/DesignBubble';
import layerClasses from './components/DesignLayer.module.css';
import DesignToolbar from './components/DesignToolbar';
import InkOverlay from './components/InkOverlay';
import MarkLayer from './components/MarkLayer';
import { composeImage } from './composeImage';
import {
    activeCollection,
    canStartHold,
    isInProgress,
    designSessionReducer,
    keepSent,
    nextMarkNumber,
    visibleBubbles,
    type Bubble,
    type BubbleInput,
    type DesignAction,
    type DesignSession,
} from './designSession';
import { grabDomFrame } from './domFrame';
import { sameScreen, shiftMarks, type ScreenView } from './frameGeometry';
import { CAPTURE_IGNORE_ATTRIBUTE } from './frameSource';
import { cancelsHold, escapeIsForDesignMode, startsHold } from './holdKeys';
import { coveredTargets } from './markCoverage';
import { ATTACHED_PX, besideMarks, intoView } from './placeBubble';
import { type TabFrame } from './tabFrame';
import {
    type Box as MarkBox,
    type CaptureMark,
    type CaptureTarget,
    type DesignPayload,
    type DesignSendResult,
    type DesignSurface,
    type LayerMark,
    type PickedElement,
    type Point,
    type Stroke,
    type TranscriptPhrase,
    type VoiceState,
} from './types';
import { useVoiceRecorder, type VoiceRecording } from './useVoiceRecorder';
import { wordsToPhrases } from './wordsToPhrases';

const TRAIL_SAMPLES = 24;
const RECT_REFRESH_MS = 500;
// Used to place a bubble that is not on screen yet.
const NEW_BUBBLE_SIZE = { width: 320, height: 120 };
// The room a sent bubble is given: its conversation grows to about this.
const SENT_BUBBLE_SIZE = { width: 420, height: 500 };
// The open bubble keeps off the strip along the bottom where the toolbar sits.
const TOOLBAR_STRIP_PX = 72;
// The page is pictured once the hand has been still for this long.
const QUIET_MS = 400;
const SHIELD_ATTRIBUTE = 'data-design-shield';
const EMPTY: DesignSession = { bubbles: [], active: { kind: 'page' } };

/** One picture of a bubble's collection, taken after its first mark landed. */
type Shot = {
    view: ScreenView;
    region: DOMRect;
    frame: TabFrame | null;
    grabbing: Promise<void> | null;
    failed: boolean;
    /** Its bubble is gone: a picture still on its way is thrown away. */
    dropped: boolean;
    /** How far the page had scrolled from the view when the picture was taken. */
    scrolled: { x: number; y: number };
};

/**
 * One Option hold. Clicks pick and drags draw, in any order. The strokes drawn
 * since the last pick are one ink mark, committed on release or just before
 * the next pick, so marks number in the order they were made.
 */
type Hold = {
    /** When the key went down: the start of a new bubble's clock. */
    downAbs: number;
    /** When the mark in hand began: its first stroke, or its click. */
    startAbs: number;
    rect: DOMRect;
    scroll: { x: number; y: number };
    /** The ink mark being drawn: its finished strokes and the one in hand. */
    strokes: Stroke[];
    current: Stroke | null;
    /** A mark came out of this hold, so its bubble is kept. */
    marked: boolean;
    /** The last element picked since the last stroke, so one click is one mark. */
    lastPick: string | null;
    /** Used when the hold opens a bubble from the page. */
    newBubbleId: string;
    /** The mic recording while the key is down, when the mic is on. */
    recording: Recording | null;
    /** Shared by the hold's marks: the bubble they landed in. */
    landed: { bubbleId: string | null };
    /** Clicks and the release settle one after another, so marks keep their order. */
    settled: Promise<void>;
};

const viewportRect = (): DOMRect =>
    new DOMRect(0, 0, window.innerWidth, window.innerHeight);

const toolbarStrip = (): DOMRect =>
    new DOMRect(
        0,
        window.innerHeight - TOOLBAR_STRIP_PX,
        window.innerWidth,
        TOOLBAR_STRIP_PX,
    );

// The whole page in viewport pixels: a sent bubble may sit anywhere on it.
const pageRect = (scroll: { x: number; y: number }): DOMRect =>
    new DOMRect(
        0,
        -scroll.y,
        window.innerWidth,
        Math.max(
            document.documentElement.scrollHeight,
            scroll.y + window.innerHeight,
        ),
    );

const bubbleElement = (bubbleId: string): Element | null =>
    document.querySelector(`[data-bubble-id="${bubbleId}"]`);

const otherBubbleRects = (bubbleId: string): DOMRect[] =>
    [...document.querySelectorAll('[data-bubble-id]')]
        .filter((el) => el.getAttribute('data-bubble-id') !== bubbleId)
        .map((el) => el.getBoundingClientRect());

const onScreenRect = (mark: LayerMark, scroll: { x: number; y: number }) =>
    new DOMRect(
        mark.box.x - scroll.x,
        mark.box.y - scroll.y,
        mark.box.width,
        mark.box.height,
    );

type Recording = { bubbleId: string; voice: Promise<VoiceState> };

type Commit =
    | { kind: 'strokes'; strokes: Stroke[]; endAbs: number }
    // Known once the surface answers: null when the click hit nothing.
    | { kind: 'pick'; found: Promise<PickedElement | null>; endAbs: number };

const grabFrame = (
    surface: DesignSurface,
    region: DOMRect,
): Promise<TabFrame> => {
    if (surface.frameSource === 'dom') return grabDomFrame(region);
    if (!surface.grabAppImage) {
        return Promise.reject(new Error('The app cannot take a picture'));
    }
    return grabAppFrame(surface.grabAppImage, region);
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const boxInRegion = (rect: DOMRect, region: DOMRect): MarkBox => {
    const x = clamp01((rect.left - region.left) / region.width);
    const y = clamp01((rect.top - region.top) / region.height);
    return {
        x,
        y,
        width: clamp01((rect.right - region.left) / region.width) - x,
        height: clamp01((rect.bottom - region.top) / region.height) - y,
    };
};

const holdPoint = (hold: Hold, point: Point) => ({
    x: hold.rect.left + point.x * hold.rect.width,
    y: hold.rect.top + point.y * hold.rect.height,
});

export const useDesignMode = (
    surface: DesignSurface | null,
    opts: {
        onSend: (payload: DesignPayload) => Promise<DesignSendResult>;
        /** The agent picker or thread shown inside a bubble, given the session as it is now. */
        renderBubbleBody:
            | ((bubble: Bubble, session: DesignSession) => ReactNode)
            | null;
        /** The bubble whose send waits on an agent choice, and how to call it off. */
        picker: { bubbleId: string; cancel: () => void } | null;
        /** Calls off a bubble's send if it still waits on an agent choice. */
        cancelSend: (bubbleId: string) => void;
        /** A bubble left the page on its own (closed or thrown away), not by leaving Design Mode. */
        onBubbleRemoved: ((bubbleId: string) => void) | null;
    },
): {
    on: boolean;
    setOn: (on: boolean) => void;
    micOn: boolean;
    setMicOn: (on: boolean) => void;
    session: DesignSession;
    /** Makes a sent bubble the one the next hold marks into. */
    arm: (bubbleId: string) => void;
    /** Hands the page back from a selected bubble that has collected nothing. */
    deselect: () => void;
    send: (bubbleId: string, typed: string) => void;
    discard: (bubbleId: string) => void;
    close: (bubbleId: string) => void;
    minimise: (bubbleId: string) => void;
    expand: (bubbleId: string) => void;
    /** Option is held. */
    holding: boolean;
    /** Option went down or came up inside an app frame. */
    frameHold: (phase: 'down' | 'up') => void;
    /** The page's content was replaced, as after an agent's edit. */
    screenChanged: () => void;
    element: ReactNode;
} => {
    // Read through refs so the callbacks below keep a stable identity.
    const toaster = useToaster();
    const toasterRef = useRef(toaster);
    toasterRef.current = toaster;
    const showToastError = useCallback(
        (title: string) => toasterRef.current.showToastError({ title }),
        [],
    );
    const showToastWarning = useCallback(
        (title: string) => toasterRef.current.showToastWarning({ title }),
        [],
    );
    const surfaceRef = useRef(surface);
    surfaceRef.current = surface;
    const onSendRef = useRef(opts.onSend);
    onSendRef.current = opts.onSend;
    const pickerRef = useRef(opts.picker);
    pickerRef.current = opts.picker;
    const cancelSendRef = useRef(opts.cancelSend);
    cancelSendRef.current = opts.cancelSend;
    const showsThreadRef = useRef(opts.renderBubbleBody !== null);
    showsThreadRef.current = opts.renderBubbleBody !== null;
    const onBubbleRemovedRef = useRef(opts.onBubbleRemoved);
    onBubbleRemovedRef.current = opts.onBubbleRemoved;

    const [session, setSession] = useState<DesignSession>(EMPTY);
    const sessionRef = useRef<DesignSession>(EMPTY);
    const dispatch = useCallback((action: DesignAction): DesignSession => {
        const next = designSessionReducer(sessionRef.current, action);
        sessionRef.current = next;
        setSession(next);
        return next;
    }, []);

    // The bubble shows the agent picker for as long as its send waits on one.
    const pickingBubbleId = opts.picker?.bubbleId ?? null;
    useEffect(() => {
        if (pickingBubbleId === null) return undefined;
        // Its bubble is gone: nothing can show the picker, so call the send off.
        if (!sessionRef.current.bubbles.some((b) => b.id === pickingBubbleId)) {
            pickerRef.current?.cancel();
            return undefined;
        }
        dispatch({ type: 'picking', bubbleId: pickingBubbleId, open: true });
        return () => {
            dispatch({
                type: 'picking',
                bubbleId: pickingBubbleId,
                open: false,
            });
        };
    }, [dispatch, pickingBubbleId]);

    const [on, setOnState] = useState(false);
    const onRef = useRef(false);
    const [micOn, setMicOnState] = useState(false);
    const micOnRef = useRef(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [holding, setHolding] = useState(false);
    // The mic is recording the hold that is down.
    const [talking, setTalking] = useState(false);
    const [ink, setInk] = useState<Stroke[]>([]);
    // Ink marks on their way into a bubble stay drawn until they land.
    const landingInkRef = useRef<Stroke[][]>([]);
    const [hover, setHover] = useState<MarkBox | null>(null);
    // Hover asks the surface once a frame; an answer to an older ask is dropped.
    const hoverAskRef = useRef<{
        point: Point | null;
        frame: number | null;
        seq: number;
    }>({ point: null, frame: null, seq: 0 });
    const [placed, setPlaced] = useState<LayerMark[]>([]);
    // Read by a mark that lands before the last one has been drawn.
    const placedRef = useRef<LayerMark[]>([]);
    const updatePlaced = useCallback(
        (change: (prev: LayerMark[]) => LayerMark[]) => {
            placedRef.current = change(placedRef.current);
            setPlaced(placedRef.current);
        },
        [],
    );
    // Bubble ids from back to front.
    const [order, setOrder] = useState<string[]>([]);
    // Bubbles the user dragged: they stay where they were put.
    const userPlacedRef = useRef(new Set<string>());
    // The layers moved by hand, for a surface that scrolls on its own.
    const marksShiftRef = useRef<HTMLDivElement | null>(null);
    const bubblesShiftRef = useRef<HTMLDivElement | null>(null);
    // The layer in the page's own content, which the browser scrolls.
    const [pageLayer, setPageLayer] = useState<HTMLElement | null>(null);

    const holdRef = useRef<Hold | null>(null);
    const downKeysRef = useRef(new Set<string>());
    // shots[i] is the picture of image slot i.
    const shotsRef = useRef(new Map<string, Shot[]>());
    const epochRef = useRef(0);
    const grabTimerRef = useRef<number | null>(null);
    const lastActivityRef = useRef(0);
    // A picture is waiting: the page under the pointer is kept as it is.
    const [shielded, setShielded] = useState(false);
    // When each bubble's current collection started, on the performance clock.
    const clocksRef = useRef(new Map<string, number>());
    const recordingRef = useRef<Recording | null>(null);
    // Mic starts and stops run one after another, so a late stop hits its own start.
    const voiceChainRef = useRef<Promise<void>>(Promise.resolve());
    // Words already transcribed for a bubble whose send failed.
    const phrasesRef = useRef(new Map<string, TranscriptPhrase[]>());
    const finishingRef = useRef(new Set<string>());
    // Released holds whose words are about to be sent: no new hold meanwhile.
    const releasingRef = useRef(0);
    // A released hold sends through this; it is defined after the hold code.
    const finishRef = useRef<
        (
            bubbleId: string,
            typed: string,
            spoken: Promise<VoiceRecording | null> | null,
        ) => void
    >(() => {});
    const queueRef = useRef<Promise<void>>(Promise.resolve());
    const toolbarRef = useRef<HTMLDivElement | null>(null);

    const absoluteNow = useCallback(() => performance.now(), []);
    const { start: startVoice, stop: stopVoice } = useVoiceRecorder({
        now: absoluteNow,
    });

    // Straight onto the layers: a render per scroll event would trail it.
    const refreshScroll = useCallback(() => {
        const next = surfaceRef.current?.getScroll();
        if (!next) return;
        const shift = `translate(${-next.x}px, ${-next.y}px)`;
        [marksShiftRef.current, bubblesShiftRef.current].forEach((layer) => {
            if (layer && layer.style.transform !== shift) {
                layer.style.transform = shift;
            }
        });
    }, []);
    // A layer drawn for the first time starts where the scroll is.
    useLayoutEffect(refreshScroll);

    const waitingShots = useCallback(
        (): Shot[] =>
            [...shotsRef.current.values()]
                .flat()
                .filter((s) => !s.frame && !s.grabbing && !s.failed),
        [],
    );
    const refreshShield = useCallback(() => {
        setShielded(waitingShots().length > 0);
    }, [waitingShots]);

    const clearFrames = useCallback(
        (bubbleId: string) => {
            shotsRef.current.get(bubbleId)?.forEach((shot) => {
                shot.dropped = true;
                shot.frame?.bitmap.close();
                shot.frame = null;
            });
            shotsRef.current.delete(bubbleId);
            refreshShield();
        },
        [refreshShield],
    );

    const startGrab = useCallback(
        (shot: Shot): Promise<void> => {
            if (shot.frame || shot.dropped) return Promise.resolve();
            if (shot.grabbing) return shot.grabbing;
            const current = surfaceRef.current;
            if (!current) return Promise.resolve();
            const scrollNow = current.getScroll();
            shot.failed = false;
            shot.scrolled = {
                x: scrollNow.x - shot.view.scroll.x,
                y: scrollNow.y - shot.view.scroll.y,
            };
            let frame: Promise<TabFrame>;
            try {
                frame = grabFrame(current, shot.region);
            } catch (error) {
                frame = Promise.reject(error);
            }
            shot.grabbing = frame.then(
                (got) => {
                    shot.grabbing = null;
                    if (shot.dropped) got.bitmap.close();
                    else shot.frame = got;
                },
                () => {
                    shot.grabbing = null;
                    shot.failed = true;
                    if (!shot.dropped) {
                        showToastError('Could not capture the screen');
                    }
                },
            );
            return shot.grabbing;
        },
        [showToastError],
    );

    // Takes the pictures still owed, before what they should show is gone.
    const grabNow = useCallback(() => {
        if (grabTimerRef.current !== null) {
            window.clearTimeout(grabTimerRef.current);
            grabTimerRef.current = null;
        }
        const waiting = waitingShots();
        if (waiting.length === 0) return;
        waiting.forEach((shot) => void startGrab(shot));
        refreshShield();
    }, [refreshShield, startGrab, waitingShots]);

    // Drawing the page blocks the pen, so it waits until the hand is still.
    const grabWhenQuiet = useCallback(() => {
        if (grabTimerRef.current !== null) {
            window.clearTimeout(grabTimerRef.current);
            grabTimerRef.current = null;
        }
        if (waitingShots().length === 0) return;
        const tick = () => {
            grabTimerRef.current = null;
            // The end of the hold asks again.
            if (holdRef.current) return;
            const quietFor = Date.now() - lastActivityRef.current;
            if (quietFor < QUIET_MS) {
                grabTimerRef.current = window.setTimeout(
                    tick,
                    QUIET_MS - quietFor,
                );
                return;
            }
            grabNow();
        };
        grabTimerRef.current = window.setTimeout(tick, QUIET_MS);
    }, [grabNow, waitingShots]);
    const postponeGrab = useCallback(() => {
        if (grabTimerRef.current === null) return;
        window.clearTimeout(grabTimerRef.current);
        grabTimerRef.current = null;
    }, []);
    useEffect(() => postponeGrab, [postponeGrab]);

    // Every picture of a bubble, taken now if it was still owed.
    const picturesOf = useCallback(
        (bubbleId: string): Promise<void> =>
            Promise.all(
                (shotsRef.current.get(bubbleId) ?? []).map(startGrab),
            ).then(() => refreshShield()),
        [refreshShield, startGrab],
    );

    // The page's content was replaced: marks made from now need a new picture.
    const screenChanged = useCallback(() => {
        grabNow();
        epochRef.current += 1;
    }, [grabNow]);

    const beginRecording = useCallback(
        (bubbleId: string): Promise<VoiceState> => {
            const available = (surfaceRef.current?.transcribe ?? null) !== null;
            const voice = voiceChainRef.current.then(() =>
                startVoice({ available }),
            );
            voiceChainRef.current = voice.then(
                () => undefined,
                () => undefined,
            );
            recordingRef.current = { bubbleId, voice };
            return voice;
        },
        [startVoice],
    );

    // Stops only once the pending start has settled, so the mic never outlives its owner.
    const endRecording = useCallback(
        (recording: Recording): Promise<VoiceRecording | null> => {
            const stopped = recording.voice.then((state) =>
                state === 'on' ? stopVoice() : null,
            );
            voiceChainRef.current = Promise.all([
                voiceChainRef.current,
                stopped,
            ]).then(
                () => undefined,
                () => undefined,
            );
            return stopped;
        },
        [stopVoice],
    );

    const dropRecording = useCallback(
        (bubbleId: string) => {
            const recording = recordingRef.current;
            if (recording?.bubbleId !== bubbleId) return;
            recordingRef.current = null;
            endRecording(recording).catch(() => {});
        },
        [endRecording],
    );

    // A released hold whose ink waits on a click still being answered.
    const releasedHoldRef = useRef<Hold | null>(null);
    const refreshInk = useCallback(() => {
        const hold = holdRef.current ?? releasedHoldRef.current;
        const live = hold
            ? hold.current
                ? [...hold.strokes, hold.current]
                : hold.strokes
            : [];
        setInk([...landingInkRef.current.flat(), ...live]);
    }, []);

    const commit = useCallback(
        (hold: Hold, made: Commit) => {
            const current = surfaceRef.current;
            const landing = made.kind === 'strokes' ? made.strokes : null;
            if (landing) landingInkRef.current.push(landing);
            const landed = () => {
                if (!landing) return;
                landingInkRef.current = landingInkRef.current.filter(
                    (strokes) => strokes !== landing,
                );
                refreshInk();
            };
            if (!current) {
                landed();
                return;
            }
            const region = hold.rect;
            const tab = current.getTab();

            const land = async () => {
                const picked = made.kind === 'pick' ? await made.found : null;
                // A click on nothing makes no mark.
                if (made.kind === 'pick' && !picked) return;
                const voice = hold.recording
                    ? await hold.recording.voice
                    : null;
                const before = sessionRef.current;
                if (!onRef.current || !canStartHold(before)) return;

                const open = activeCollection(before);
                const bubbleId = open?.bubble.id ?? hold.newBubbleId;
                const clock = clocksRef.current.get(bubbleId) ?? hold.downAbs;
                const capture = open?.collection.capture;
                const lastSlot =
                    capture?.status === 'recording'
                        ? capture.imageCount - 1
                        : -1;
                const marksBefore =
                    capture?.status === 'recording' ? capture.marks.length : 0;
                const wasAtImageLimit =
                    capture?.status === 'recording' && capture.atImageLimit;
                const previous = shotsRef.current.get(bubbleId)?.[lastSlot];
                const tabUuid = tab?.uuid ?? null;
                // Known without a picture, so a mark never waits for one.
                const view: ScreenView = {
                    tabUuid,
                    scroll: hold.scroll,
                    size: { width: region.width, height: region.height },
                    epoch: epochRef.current,
                };
                const isNewScreen =
                    !previous || !sameScreen(previous.view, view);

                const started = dispatch({
                    type: 'holdStarted',
                    kind: made.kind === 'pick' ? 'pick' : 'ink',
                    atMs: hold.startAbs - clock,
                    tabUuid,
                    isNewScreen,
                    newBubble: {
                        id: hold.newBubbleId,
                        input: voice === 'on' ? 'mic' : 'text',
                    },
                });
                const got = activeCollection(started);
                const drawing =
                    got?.collection.capture.status === 'recording'
                        ? got.collection.capture
                        : null;
                if (!got || !drawing?.drawing) return;
                // The mark is kept either way; say so once per screen.
                if (drawing.atImageLimit && !wasAtImageLimit) {
                    showToastWarning(
                        'This message has as many pictures as it can send. Marks on this screen will be described in words.',
                    );
                }
                if (!clocksRef.current.has(got.bubble.id)) {
                    clocksRef.current.set(got.bubble.id, clock);
                }
                const slot = drawing.drawing.imageIndex;
                const opensImage =
                    slot === drawing.imageCount &&
                    slot < AI_THREAD_IMAGES_MAX_PER_PROMPT;

                const toViewport = (point: Point) => ({
                    x: region.left + point.x * region.width,
                    y: region.top + point.y * region.height,
                });
                let box: MarkBox;
                let mark: Omit<ShiftUpAction, 'type' | 'atMs'>;
                if (made.kind === 'strokes') {
                    made.strokes.forEach((stroke) =>
                        dispatch({ type: 'strokeAdded', stroke }),
                    );
                    const shape = classifyMark(made.strokes);
                    box = shape.box;
                    const resolve = current.resolveTarget;
                    let target: CaptureTarget | null = null;
                    let arrowTo: CaptureTarget | null = null;
                    if (resolve && shape.arrow) {
                        target = resolve(toViewport(shape.arrow.from));
                        arrowTo = resolve(toViewport(shape.arrow.to));
                    } else if (resolve) {
                        target = resolve(
                            toViewport({
                                x: box.x + box.width / 2,
                                y: box.y + box.height / 2,
                            }),
                        );
                    }
                    // Sample the strokes to learn what they passed over, in order.
                    const trail: CaptureTarget[] = [];
                    if (resolve) {
                        const points = made.strokes.flatMap((s) => s.points);
                        const step = Math.max(
                            1,
                            Math.floor(points.length / TRAIL_SAMPLES),
                        );
                        for (let i = 0; i < points.length; i += step) {
                            const hit = resolve(toViewport(points[i]));
                            const last = trail[trail.length - 1];
                            if (
                                hit &&
                                (hit.kind !== last?.kind || hit.id !== last?.id)
                            ) {
                                trail.push(hit);
                            }
                        }
                    }
                    mark = {
                        target,
                        arrowTo,
                        trail,
                        covers: resolve
                            ? coveredTargets(box, (p) => resolve(toViewport(p)))
                            : [],
                        tabName: tab?.name ?? null,
                        box: null,
                    };
                } else if (picked) {
                    box = boxInRegion(picked.rect, region);
                    mark = {
                        target: picked.target,
                        arrowTo: null,
                        trail: [picked.target],
                        covers: [{ target: picked.target, share: 1 }],
                        tabName: tab?.name ?? null,
                        box,
                    };
                } else {
                    return;
                }
                const markRect = new DOMRect(
                    region.left + box.x * region.width,
                    region.top + box.y * region.height,
                    box.width * region.width,
                    box.height * region.height,
                );
                // The page may have scrolled since the hold began: place the
                // bubble against where the mark is on screen now.
                const scrollNow = current.getScroll();
                const dx = scrollNow.x - hold.scroll.x;
                const dy = scrollNow.y - hold.scroll.y;
                const markNow = new DOMRect(
                    markRect.x - dx,
                    markRect.y - dy,
                    markRect.width,
                    markRect.height,
                );
                // The bubble only moves here, on release, never mid-stroke.
                const onScreen =
                    bubbleElement(got.bubble.id)?.getBoundingClientRect() ??
                    null;
                const newNumber = nextMarkNumber(got.bubble);
                const ownMarks = [
                    ...placedRef.current
                        .filter(
                            (m) =>
                                m.bubbleId === got.bubble.id &&
                                m.tabUuid === tabUuid &&
                                m.number < newNumber,
                        )
                        .map((m) => onScreenRect(m, scrollNow)),
                    markNow,
                ];
                // Stays beside its marks and in view, so its text box can be
                // reached. One the user moved stays where they put it.
                const at =
                    onScreen && userPlacedRef.current.has(got.bubble.id)
                        ? { x: onScreen.left, y: onScreen.top }
                        : besideMarks({
                              marks: ownMarks,
                              current: onScreen
                                  ? { x: onScreen.left, y: onScreen.top }
                                  : null,
                              size: onScreen ?? NEW_BUBBLE_SIZE,
                              bounds: viewportRect(),
                              avoid: [
                                  ...otherBubbleRects(got.bubble.id),
                                  toolbarStrip(),
                              ],
                              // A conversation only moves off a new mark.
                              reach:
                                  got.bubble.status === 'thread'
                                      ? Infinity
                                      : ATTACHED_PX,
                          });
                // Content coords: the viewport position plus the scroll.
                const anchor = {
                    x: at.x + scrollNow.x,
                    y: at.y + scrollNow.y,
                };
                const done = dispatch({
                    type: 'holdEnded',
                    atMs: made.endAbs - clock,
                    mark,
                    anchor,
                });
                const after = activeCollection(done)?.collection.capture;
                const marks: CaptureMark[] =
                    after?.status === 'recording' ? after.marks : [];
                const newest = marks[marks.length - 1];
                if (!newest || marks.length <= marksBefore) return;
                hold.landed.bubbleId = got.bubble.id;
                if (opensImage) {
                    const shots = shotsRef.current.get(got.bubble.id) ?? [];
                    const shot: Shot = {
                        view,
                        region,
                        frame: null,
                        grabbing: null,
                        failed: false,
                        dropped: false,
                        scrolled: { x: 0, y: 0 },
                    };
                    const stale = shots[slot];
                    if (stale) {
                        stale.dropped = true;
                        stale.frame?.bitmap.close();
                    }
                    shots[slot] = shot;
                    shotsRef.current.set(got.bubble.id, shots);
                    // An app draws its own picture, off this page's thread.
                    if (current.frameSource === 'app') void startGrab(shot);
                }
                lastActivityRef.current = Date.now();
                grabWhenQuiet();
                refreshShield();
                // Not on screen yet, or moved out of the mark's way.
                if (
                    !onScreen ||
                    at.x !== onScreen.left ||
                    at.y !== onScreen.top
                ) {
                    dispatch({
                        type: 'moved',
                        bubbleId: got.bubble.id,
                        anchor,
                    });
                }
                const toContent = (point: Point) => ({
                    x: region.left + point.x * region.width + hold.scroll.x,
                    y: region.top + point.y * region.height + hold.scroll.y,
                });
                const layerMark: LayerMark = {
                    bubbleId: got.bubble.id,
                    number: newest.number,
                    tabUuid,
                    box: {
                        x: markRect.x + hold.scroll.x,
                        y: markRect.y + hold.scroll.y,
                        width: markRect.width,
                        height: markRect.height,
                    },
                    strokes:
                        made.kind === 'strokes'
                            ? made.strokes.map((stroke) => ({
                                  points: stroke.points.map(toContent),
                              }))
                            : [],
                    outlined: made.kind === 'pick',
                };
                // A number used again replaces the mark thrown away before it.
                updatePlaced((prev) => [
                    ...prev.filter(
                        (m) =>
                            m.bubbleId !== layerMark.bubbleId ||
                            m.number < layerMark.number,
                    ),
                    layerMark,
                ]);
                refreshScroll();
            };
            queueRef.current = queueRef.current.then(async () => {
                try {
                    await land();
                } finally {
                    landed();
                }
            });
        },
        [
            dispatch,
            grabWhenQuiet,
            refreshInk,
            refreshScroll,
            refreshShield,
            showToastWarning,
            startGrab,
            updatePlaced,
        ],
    );

    const forgetHover = useCallback(() => {
        const ask = hoverAskRef.current;
        ask.point = null;
        ask.seq += 1;
        if (ask.frame !== null) {
            window.cancelAnimationFrame(ask.frame);
            ask.frame = null;
        }
        setHover(null);
    }, []);

    const beginHold = useCallback(() => {
        const current = surfaceRef.current;
        if (!current || !onRef.current || holdRef.current) return;
        if (!canStartHold(sessionRef.current)) return;
        if (releasingRef.current > 0) return;
        let active = activeCollection(sessionRef.current)?.bubble ?? null;
        if (active && finishingRef.current.has(active.id)) return;
        // A selected bubble with nothing collected takes the toolbar's mic.
        if (active?.status === 'thread' && !isInProgress(active.collection)) {
            const input: BubbleInput = micOnRef.current ? 'mic' : 'text';
            if (active.input !== input) {
                const next = dispatch({
                    type: 'arm',
                    bubbleId: active.id,
                    input,
                });
                active = activeCollection(next)?.bubble ?? null;
            }
        }
        const region = current.getRegion();
        postponeGrab();
        forgetHover();
        setRect(region);
        setHolding(true);
        const newBubbleId = uuidv4();
        // The mic is live from key down: on the page when the mic is on, in
        // a bubble when it takes the mic. A typed draft is never recorded over.
        const wantsVoice = active ? active.input === 'mic' : micOnRef.current;
        let recording: Recording | null = null;
        if (wantsVoice && !recordingRef.current) {
            const voice = beginRecording(active?.id ?? newBubbleId);
            recording = recordingRef.current;
            setTalking(true);
            void voice.then((state) => {
                if (state === 'on') return;
                if (recordingRef.current === recording) {
                    recordingRef.current = null;
                }
                if (holdRef.current?.recording === recording) setTalking(false);
                // No mic: the bubble takes typing.
                if (active) {
                    dispatch({
                        type: 'inputChanged',
                        bubbleId: active.id,
                        input: 'text',
                    });
                }
            });
        }
        holdRef.current = {
            downAbs: performance.now(),
            startAbs: performance.now(),
            rect: region,
            scroll: current.getScroll(),
            strokes: [],
            current: null,
            marked: false,
            lastPick: null,
            newBubbleId,
            recording,
            landed: { bubbleId: null },
            settled: Promise.resolve(),
        };
        refreshInk();
    }, [beginRecording, dispatch, forgetHover, postponeGrab, refreshInk]);

    // The strokes drawn since the last pick become one ink mark: all of them,
    // or only those drawn before a click (`drawnBefore`).
    const flushInk = useCallback(
        (hold: Hold, drawnBefore: Stroke[] | null) => {
            const pending = hold.current
                ? [...hold.strokes, hold.current]
                : hold.strokes;
            const strokes = drawnBefore
                ? pending.filter((stroke) => drawnBefore.includes(stroke))
                : pending;
            if (strokes.length === 0) return;
            const ink = { ...hold };
            hold.strokes = hold.strokes.filter(
                (stroke) => !strokes.includes(stroke),
            );
            if (hold.current && strokes.includes(hold.current))
                hold.current = null;
            hold.marked = true;
            hold.lastPick = null;
            hold.startAbs = performance.now();
            commit(ink, {
                kind: 'strokes',
                strokes,
                endAbs: performance.now(),
            });
        },
        [commit],
    );

    const cancelHold = useCallback(() => {
        const hold = holdRef.current;
        if (!hold) return;
        holdRef.current = null;
        setHolding(false);
        setTalking(false);
        forgetHover();
        refreshInk();
        lastActivityRef.current = Date.now();
        grabWhenQuiet();
        const { recording } = hold;
        if (!recording) return;
        if (recordingRef.current === recording) {
            dropRecording(recording.bubbleId);
        }
        if (!hold.marked) return;
        // Its marks stay, without the words: the bubble takes typing.
        queueRef.current = queueRef.current.then(() => {
            const bubbleId = hold.landed.bubbleId;
            if (bubbleId === null || finishingRef.current.has(bubbleId)) return;
            dispatch({ type: 'inputChanged', bubbleId, input: 'text' });
        });
    }, [dispatch, dropRecording, forgetHover, grabWhenQuiet, refreshInk]);

    const endHold = useCallback(() => {
        const hold = holdRef.current;
        if (!hold) return;
        holdRef.current = null;
        setHolding(false);
        setTalking(false);
        forgetHover();
        lastActivityRef.current = Date.now();
        grabWhenQuiet();
        releasedHoldRef.current = hold;
        refreshInk();
        // The mic stops with the key, whatever is still landing.
        const { recording } = hold;
        let spoken: Promise<VoiceRecording | null> | null = null;
        if (recording && recordingRef.current === recording) {
            recordingRef.current = null;
            spoken = endRecording(recording);
            spoken.catch(() => {});
            releasingRef.current += 1;
        }
        hold.settled = hold.settled.then(() => {
            if (releasedHoldRef.current === hold)
                releasedHoldRef.current = null;
            flushInk(hold, null);
            refreshInk();
            if (!recording || !spoken) return;
            const heard = spoken;
            // Once its marks have landed, a hold with the mic sends itself.
            queueRef.current = queueRef.current.then(async () => {
                releasingRef.current -= 1;
                const bubbleId = hold.landed.bubbleId;
                if (bubbleId === null) return;
                const state = await recording.voice.catch(() => 'off' as const);
                const bubble = sessionRef.current.bubbles.find(
                    (b) => b.id === bubbleId,
                );
                if (state !== 'on' || bubble?.input !== 'mic') return;
                // The next hold starts a new bubble while this one is sent.
                dispatch({ type: 'handOff', bubbleId });
                finishRef.current(bubbleId, '', heard);
            });
        });
    }, [
        dispatch,
        endRecording,
        flushInk,
        forgetHover,
        grabWhenQuiet,
        refreshInk,
    ]);

    const onHover = useCallback((point: Point | null) => {
        const ask = hoverAskRef.current;
        if (point === null) {
            ask.point = null;
            ask.seq += 1;
            setHover(null);
            return;
        }
        ask.point = point;
        if (ask.frame !== null) return;
        ask.frame = window.requestAnimationFrame(() => {
            ask.frame = null;
            const hold = holdRef.current;
            const at = ask.point;
            const pickAt = surfaceRef.current?.pickAt ?? null;
            if (!hold || !at || !pickAt) return;
            ask.seq += 1;
            const seq = ask.seq;
            pickAt(holdPoint(hold, at)).then(
                (hit) => {
                    if (seq !== ask.seq || holdRef.current !== hold) return;
                    setHover(hit ? boxInRegion(hit.rect, hold.rect) : null);
                },
                () => {},
            );
        });
    }, []);

    const onStrokePoint = useCallback(
        (point: Point) => {
            const hold = holdRef.current;
            if (!hold) return;
            if (!hold.current && hold.strokes.length === 0) {
                hold.startAbs = performance.now();
            }
            hold.current = {
                points: hold.current
                    ? [...hold.current.points, point]
                    : [point],
            };
            refreshInk();
        },
        [refreshInk],
    );

    const onStrokeEnd = useCallback(() => {
        const hold = holdRef.current;
        if (!hold?.current) return;
        hold.strokes = [...hold.strokes, hold.current];
        hold.current = null;
        refreshInk();
    }, [refreshInk]);

    const onPick = useCallback(
        (point: Point) => {
            const hold = holdRef.current;
            const pickAt = surfaceRef.current?.pickAt ?? null;
            if (!hold || !pickAt) return;
            refreshInk();
            forgetHover();
            const drawnBefore = [...hold.strokes];
            const clickedAbs = performance.now();
            const found = pickAt(holdPoint(hold, point)).catch(() => null);
            hold.settled = hold.settled.then(async () => {
                const hit = await found;
                // A click on nothing leaves the ink around it one mark.
                if (!hit) return;
                const pickKey = `${hit.target.kind}:${hit.target.id}`;
                const inkBefore = hold.strokes.some((stroke) =>
                    drawnBefore.includes(stroke),
                );
                if (!inkBefore && hold.lastPick === pickKey) return;
                // Ink drawn before this click is the mark before it.
                flushInk(hold, drawnBefore);
                refreshInk();
                hold.lastPick = pickKey;
                hold.marked = true;
                const pick: Hold = { ...hold, startAbs: clickedAbs };
                hold.startAbs = performance.now();
                commit(pick, {
                    kind: 'pick',
                    found: Promise.resolve(hit),
                    endAbs: clickedAbs,
                });
            });
        },
        [commit, flushInk, forgetHover, refreshInk],
    );

    const frameHold = useCallback(
        (phase: 'down' | 'up') => {
            if (phase === 'up') {
                endHold();
                return;
            }
            if (downKeysRef.current.size === 0) beginHold();
        },
        [beginHold, endHold],
    );

    // `spoken` is what the mic heard for it: null when it was typed.
    const finish = useCallback(
        (
            bubbleId: string,
            typed: string,
            spoken: Promise<VoiceRecording | null> | null,
        ) => {
            const bubble = sessionRef.current.bubbles.find(
                (b) => b.id === bubbleId,
            );
            if (!bubble?.collection) return;
            if (bubble.status !== 'collecting' && bubble.status !== 'thread') {
                return;
            }
            if (finishingRef.current.has(bubbleId)) return;
            finishingRef.current.add(bubbleId);
            if (spoken === null && holdRef.current) endHold();

            const owns = spoken !== null;
            const recordingPromise = spoken ?? Promise.resolve(null);

            // Waits for this bubble's marks to land, then sends beside the
            // queue, so marks for the next bubble never wait on a send.
            const sendNow = async () => {
                let sending = false;
                // Sending is the last moment the page is known to be as marked.
                const pictures = picturesOf(bubbleId);
                try {
                    const clock =
                        clocksRef.current.get(bubbleId) ?? performance.now();
                    const durationMs = performance.now() - clock;
                    const transcribe = surfaceRef.current?.transcribe ?? null;
                    const marked = sessionRef.current.bubbles.find(
                        (b) => b.id === bubbleId,
                    )?.collection?.capture;
                    const markStarts =
                        marked?.status === 'recording'
                            ? marked.marks.map((m) => m.startMs)
                            : [];

                    let phrases: TranscriptPhrase[] = [];
                    const audio = await recordingPromise;
                    if (owns && transcribe && !audio) {
                        showToastWarning(
                            'No audio was recorded from the microphone',
                        );
                    }
                    if (audio && transcribe) {
                        try {
                            const words = await transcribe(audio.audio);
                            if (words.length === 0) {
                                const kilobytes = Math.round(
                                    audio.audio.size / 1024,
                                );
                                showToastWarning(
                                    `No speech was heard in the recording (${audio.audio.type || 'unknown type'}, ${kilobytes} KB)`,
                                );
                            }
                            phrases = wordsToPhrases(words, {
                                offsetMs: audio.startedAtMs - clock,
                                breakAtMs: markStarts,
                            });
                        } catch {
                            showToastWarning('Could not transcribe your voice');
                        }
                    }

                    await pictures;
                    // Discarded or closed while the audio was transcribed.
                    const latest = sessionRef.current.bubbles.find(
                        (b) => b.id === bubbleId,
                    );
                    const capture = latest?.collection?.capture;
                    if (!latest || capture?.status !== 'recording') return;
                    // Words from a send that failed go out with the retry.
                    const kept = phrasesRef.current.get(bubbleId) ?? [];
                    phrases = [...kept, ...phrases];
                    if (phrases.length > 0) {
                        phrasesRef.current.set(bubbleId, phrases);
                    }
                    const text = typed.trim();
                    const { marks } = capture;
                    // No words from the mic: keep what was collected, in a text box.
                    if (owns && phrases.length === 0 && text === '') {
                        dispatch({
                            type: 'inputChanged',
                            bubbleId,
                            input: 'text',
                        });
                        dispatch({ type: 'handBack', bubbleId });
                        if (marks.length === 0) {
                            showToastWarning('Nothing to send yet');
                        }
                        return;
                    }
                    if (marks.length === 0 && phrases.length === 0 && !text) {
                        showToastWarning('Nothing to send yet');
                        return;
                    }

                    const pictured = (
                        shotsRef.current.get(bubbleId) ?? []
                    ).slice(
                        0,
                        Math.min(
                            capture.imageCount,
                            AI_THREAD_IMAGES_MAX_PER_PROMPT,
                        ),
                    );
                    const frames = pictured.flatMap((shot) =>
                        shot.frame ? [shot.frame] : [],
                    );
                    // A picture that could not be taken is tried again on the next send.
                    if (frames.length < pictured.length) {
                        throw new Error('A marked screen has no picture');
                    }
                    dispatch({
                        type: 'sendStarted',
                        bubbleId,
                        needsPicker: false,
                        // Out of the way while the agent works, where the
                        // bubble goes on to show the conversation.
                        minimise: showsThreadRef.current,
                    });
                    sending = true;
                    const images = await Promise.all(
                        pictured.map((shot, index) =>
                            composeImage({
                                frame: frames[index].bitmap,
                                marks: shiftMarks(
                                    marks.filter((m) => m.imageIndex === index),
                                    {
                                        x: -shot.scrolled.x / shot.region.width,
                                        y:
                                            -shot.scrolled.y /
                                            shot.region.height,
                                    },
                                ),
                                index,
                            }),
                        ),
                    );
                    const built =
                        marks.length > 0 || phrases.length > 0
                            ? buildSummary({
                                  durationMs,
                                  imageCount: images.length,
                                  marks,
                                  transcript: phrases,
                              })
                            : '';
                    const result = await onSendRef.current({
                        bubbleId,
                        summary: built,
                        typed: text,
                        marks,
                        images,
                        transcript: phrases,
                    });
                    sending = false;
                    clearFrames(bubbleId);
                    clocksRef.current.delete(bubbleId);
                    phrasesRef.current.delete(bubbleId);
                    // Nothing shows a recording once this is sent.
                    dropRecording(bubbleId);
                    if (result === 'cancelled') {
                        // Back to unsent first, so a reply keeps its thread.
                        dispatch({ type: 'sendFailed', bubbleId });
                        dispatch({ type: 'discard', bubbleId });
                    } else if (result === 'queued') {
                        // Stays on screen with its marks until the surface sends it.
                        dispatch({ type: 'queue', bubbleId });
                    } else {
                        dispatch({
                            type: 'threadReady',
                            bubbleId,
                            threadId: result.threadId,
                            agentUuid: result.agentUuid,
                        });
                    }
                } catch {
                    showToastError('Could not send your marks');
                    if (sending) {
                        dispatch({ type: 'sendFailed', bubbleId });
                        // The recording is spent: the retry is typed.
                        dispatch({
                            type: 'inputChanged',
                            bubbleId,
                            input: 'text',
                        });
                    }
                } finally {
                    finishingRef.current.delete(bubbleId);
                }
            };
            queueRef.current = queueRef.current.then(() => {
                sendNow().catch(() => {});
            });
        },
        [
            clearFrames,
            dispatch,
            dropRecording,
            endHold,
            picturesOf,
            showToastError,
            showToastWarning,
        ],
    );

    finishRef.current = finish;

    const send = useCallback(
        (bubbleId: string, typed: string) => finish(bubbleId, typed, null),
        [finish],
    );

    const removeBubble = useCallback(
        (bubbleId: string, type: 'discard' | 'close') => {
            dropRecording(bubbleId);
            clearFrames(bubbleId);
            clocksRef.current.delete(bubbleId);
            phrasesRef.current.delete(bubbleId);
            const { bubbles } = dispatch({ type, bubbleId });
            if (!bubbles.some((b) => b.id === bubbleId)) {
                userPlacedRef.current.delete(bubbleId);
            }
            updatePlaced((prev) =>
                prev.filter((m) =>
                    bubbles.some(
                        (b) =>
                            b.id === m.bubbleId && m.number < nextMarkNumber(b),
                    ),
                ),
            );
            if (!bubbles.some((b) => b.id === bubbleId)) {
                onBubbleRemovedRef.current?.(bubbleId);
            }
        },
        [clearFrames, dispatch, dropRecording, updatePlaced],
    );
    const discard = useCallback(
        (bubbleId: string) => {
            // A bubble being sent is no longer unsent: its send decides what happens.
            const bubble = sessionRef.current.bubbles.find(
                (b) => b.id === bubbleId,
            );
            if (bubble?.status === 'sending') return;
            // Choosing an agent: call the send off, and it removes the bubble.
            const picker = pickerRef.current;
            if (
                bubble?.status === 'picking-agent' &&
                picker?.bubbleId === bubbleId
            ) {
                picker.cancel();
                return;
            }
            removeBubble(bubbleId, 'discard');
        },
        [removeBubble],
    );
    const close = useCallback(
        (bubbleId: string) => removeBubble(bubbleId, 'close'),
        [removeBubble],
    );

    // Swaps the session for a smaller one and lets go of what the rest held.
    const putAway = useCallback(
        (next: DesignSession) => {
            const recording = recordingRef.current;
            if (recording) dropRecording(recording.bubbleId);
            // A reply on its way out still needs its pictures and words.
            const busy = new Set(
                next.bubbles.filter((b) => b.collection).map((b) => b.id),
            );
            [...shotsRef.current.keys()]
                .filter((id) => !busy.has(id))
                .forEach(clearFrames);
            [clocksRef.current, phrasesRef.current].forEach((kept) =>
                [...kept.keys()]
                    .filter((id) => !busy.has(id))
                    .forEach((id) => kept.delete(id)),
            );
            updatePlaced((prev) =>
                prev.filter((m) =>
                    next.bubbles.some(
                        (b) =>
                            b.id === m.bubbleId && m.number < nextMarkNumber(b),
                    ),
                ),
            );
            sessionRef.current = next;
            setSession(next);
        },
        [clearFrames, dropRecording, updatePlaced],
    );

    const setMicOn = useCallback((value: boolean) => {
        micOnRef.current = value;
        setMicOnState(value);
    }, []);

    const setOn = useCallback(
        (value: boolean) => {
            if (value === onRef.current) return;
            if (value && !surfaceRef.current) return;
            onRef.current = value;
            setOnState(value);
            if (value) {
                setRect(surfaceRef.current?.getRegion() ?? null);
                refreshScroll();
                return;
            }
            cancelHold();
            // A send left waiting on an agent choice would hold up later sends.
            sessionRef.current.bubbles.forEach((b) =>
                cancelSendRef.current(b.id),
            );
            downKeysRef.current.clear();
            // Sent conversations stay on the page; unsent work goes.
            putAway(keepSent(sessionRef.current));
        },
        [cancelHold, putAway, refreshScroll],
    );

    const arm = useCallback(
        (bubbleId: string) => {
            // Marks are only made with Design Mode on.
            if (!onRef.current) return;
            // Its last reply is still being stopped, transcribed or sent.
            if (finishingRef.current.has(bubbleId)) return;
            const sessionBefore = sessionRef.current;
            const selected = activeCollection(sessionBefore)?.bubble ?? null;
            if (selected?.id === bubbleId) return;
            const before = sessionBefore.bubbles.find((b) => b.id === bubbleId);
            const next = dispatch({
                type: 'arm',
                bubbleId,
                input: micOnRef.current ? 'mic' : 'text',
            });
            // The reducer only arms a thread bubble; anything else is ignored.
            if (next === sessionBefore) return;
            if (!before?.collection) {
                clocksRef.current.set(bubbleId, performance.now());
            }
        },
        [dispatch],
    );

    const deselect = useCallback(() => {
        const selected = activeCollection(sessionRef.current);
        if (!selected || selected.bubble.status !== 'thread') return;
        if (isInProgress(selected.collection)) return;
        if (finishingRef.current.has(selected.bubble.id)) return;
        discard(selected.bubble.id);
    }, [discard]);

    const toggle = useCallback(() => setOn(!onRef.current), [setOn]);
    // No surface, no hotkey: the page keeps the key combination.
    useHotkeys(surface ? [['mod+shift+X', toggle]] : [], [], true);

    // Esc throws away an unsent bubble; with none, it leaves Design Mode.
    // Says whether it did anything.
    const onEscape = useCallback((): boolean => {
        const s = sessionRef.current;
        const active = activeCollection(s)?.bubble ?? null;
        const unsent =
            active && active.status !== 'queued'
                ? active
                : s.bubbles.find(
                      (b) =>
                          b.status === 'collecting' ||
                          b.status === 'picking-agent',
                  );
        if (unsent) discard(unsent.id);
        // A send in flight is left alone: leaving now would lose it.
        else if (s.bubbles.some((b) => b.status === 'sending')) return false;
        else setOn(false);
        return true;
    }, [discard, setOn]);

    useEffect(() => {
        if (!on) return undefined;
        // Turned on from inside an app frame, keys would stay in that frame.
        if (document.activeElement?.tagName === 'IFRAME') window.focus();
        toolbarRef.current?.focus({ preventScroll: true });

        const downKeys = downKeysRef.current;
        const onKeyDown = (event: KeyboardEvent) => {
            if (cancelsHold(event)) {
                downKeys.add(event.code || event.key);
                if (holdRef.current) {
                    cancelHold();
                    return;
                }
                // One Esc does one thing: nothing else on the page hears it.
                if (
                    event.key === 'Escape' &&
                    escapeIsForDesignMode(event) &&
                    onEscape()
                ) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                return;
            }
            if (startsHold(event) && downKeys.size === 0) beginHold();
        };
        const onKeyUp = (event: KeyboardEvent) => {
            downKeys.delete(event.code || event.key);
            // A held Command swallows the other keys' keyup on macOS.
            if (event.key === 'Meta') downKeys.clear();
            if (event.key === 'Alt') endHold();
        };
        // A press with Option held is a mark: the page under it must not act
        // on it, and Option+click must not download a link.
        const onHeldClick = (event: MouseEvent) => {
            if (!holdRef.current) return;
            event.preventDefault();
            event.stopPropagation();
        };
        // A sealed iframe swallows keys once clicked, so take focus back.
        const onBlur = () => {
            endHold();
            downKeys.clear();
            window.setTimeout(() => {
                if (document.activeElement?.tagName !== 'IFRAME') return;
                window.focus();
                toolbarRef.current?.focus({ preventScroll: true });
            }, 0);
        };
        // A press on the page, not on a bubble or the toolbar, hands the page
        // back from a selected bubble. The page still gets the press.
        const onPagePress = (event: MouseEvent) => {
            if (holdRef.current || !(event.target instanceof Element)) return;
            if (
                event.target.closest('[data-bubble-id], [data-portal]') ||
                toolbarRef.current?.contains(event.target)
            ) {
                return;
            }
            deselect();
        };
        const heldTypes = ['click', 'auxclick', 'dragstart'] as const;
        window.addEventListener('mousedown', onPagePress, true);
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        heldTypes.forEach((type) =>
            window.addEventListener(type, onHeldClick, true),
        );
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('mousedown', onPagePress, true);
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('keyup', onKeyUp, true);
            heldTypes.forEach((type) =>
                window.removeEventListener(type, onHeldClick, true),
            );
            window.removeEventListener('blur', onBlur);
        };
    }, [beginHold, cancelHold, deselect, endHold, on, onEscape]);

    // Marks and bubbles follow the page for as long as any are on it, also
    // after Design Mode is left.
    const following = on || session.bubbles.length > 0;
    const scrollContainer = following
        ? (surface?.getScrollContainer() ?? null)
        : null;
    useEffect(() => {
        if (!scrollContainer) return undefined;
        const layer = document.createElement('div');
        layer.className = layerClasses.inPage;
        scrollContainer.append(layer);
        setPageLayer(layer);
        return () => {
            layer.remove();
            setPageLayer(null);
        };
    }, [scrollContainer]);
    useEffect(() => {
        if (!following) return undefined;
        const refreshRect = () => {
            if (holdRef.current) return;
            const region = surfaceRef.current?.getRegion();
            if (region) setRect(region);
        };
        // An app's frame can move or resize without telling this window.
        const refreshPlace = () => {
            refreshRect();
            refreshScroll();
        };
        const rectTimer = window.setInterval(refreshPlace, RECT_REFRESH_MS);
        const unwatch = surfaceRef.current?.watchScroll?.(refreshScroll);
        window.addEventListener('resize', refreshRect);
        window.addEventListener('scroll', refreshScroll, true);
        return () => {
            window.removeEventListener('scroll', refreshScroll, true);
            window.removeEventListener('resize', refreshRect);
            unwatch?.();
            window.clearInterval(rectTimer);
        };
    }, [following, refreshScroll, surface]);

    // The page stops offering Design Mode (flag off, preview closed).
    useEffect(() => {
        if (surface) return;
        if (onRef.current) setOn(false);
        if (sessionRef.current.bubbles.length > 0) putAway(EMPTY);
    }, [putAway, setOn, surface]);

    // Whatever may change the page comes after its picture.
    useEffect(() => {
        if (!on) return undefined;
        const beforeChange = (event: Event) => {
            if (event instanceof KeyboardEvent && !cancelsHold(event)) return;
            const own =
                event.target instanceof Element
                    ? event.target.closest(`[${CAPTURE_IGNORE_ATTRIBUTE}]`)
                    : null;
            // Design Mode's own bubbles and toolbar change nothing in the picture.
            if (own && !own.hasAttribute(SHIELD_ATTRIBUTE)) return;
            grabNow();
            // A press or a key may have changed what is on the page.
            if (event.type === 'pointerdown' || event.type === 'keydown') {
                epochRef.current += 1;
            }
        };
        const onMove = () => {
            lastActivityRef.current = Date.now();
        };
        const types = ['pointerdown', 'wheel', 'scroll', 'keydown'] as const;
        types.forEach((type) =>
            window.addEventListener(type, beforeChange, {
                capture: true,
                passive: true,
            }),
        );
        window.addEventListener('mousemove', onMove, true);
        return () => {
            types.forEach((type) =>
                window.removeEventListener(type, beforeChange, true),
            );
            window.removeEventListener('mousemove', onMove, true);
        };
    }, [grabNow, on]);

    const tabUuid = surface?.getTab()?.uuid ?? null;
    // A tab that changed with no click: its picture is taken while it can be.
    useEffect(() => grabNow(), [grabNow, tabUuid]);
    // The open bubble follows the user to another tab; bring it into view there.
    useEffect(() => {
        const current = surfaceRef.current;
        const open = activeCollection(sessionRef.current);
        if (!current || !open) return;
        if (userPlacedRef.current.has(open.bubble.id)) return;
        const onScreen = bubbleElement(open.bubble.id)?.getBoundingClientRect();
        if (!onScreen) return;
        const at = intoView(onScreen, viewportRect());
        if (at.x === onScreen.left && at.y === onScreen.top) return;
        const scrollNow = current.getScroll();
        dispatch({
            type: 'moved',
            bubbleId: open.bubble.id,
            anchor: { x: at.x + scrollNow.x, y: at.y + scrollNow.y },
        });
    }, [dispatch, tabUuid]);

    // A sent bubble takes the room beside its marks, wherever on the page they
    // are, each time it changes form: a conversation needs more than a pill.
    const roomedRef = useRef(new Map<string, 'pill' | 'full'>());
    useEffect(() => {
        const current = surfaceRef.current;
        if (!current) return;
        const scrollNow = current.getScroll();
        visibleBubbles(session, tabUuid).forEach((bubble) => {
            const form = bubble.minimised
                ? 'pill'
                : bubble.status === 'thread' ||
                    bubble.status === 'picking-agent'
                  ? 'full'
                  : null;
            const was = roomedRef.current.get(bubble.id) ?? null;
            if (form === null || form === was) return;
            const onScreen = bubbleElement(bubble.id)?.getBoundingClientRect();
            if (!onScreen) return;
            roomedRef.current.set(bubble.id, form);
            const size = form === 'pill' ? onScreen : SENT_BUBBLE_SIZE;
            const here = { x: onScreen.left, y: onScreen.top };
            // Opened from a pill, the conversation is wanted in view.
            const opened = form === 'full' && was === 'pill';
            const fits =
                size.width <= window.innerWidth &&
                size.height <= window.innerHeight;
            const at = userPlacedRef.current.has(bubble.id)
                ? opened
                    ? intoView(
                          new DOMRect(here.x, here.y, size.width, size.height),
                          viewportRect(),
                      )
                    : here
                : besideMarks({
                      marks: placed
                          .filter(
                              (m) =>
                                  m.bubbleId === bubble.id &&
                                  m.tabUuid === tabUuid,
                          )
                          .map((m) => onScreenRect(m, scrollNow)),
                      current: here,
                      size,
                      bounds:
                          opened && fits ? viewportRect() : pageRect(scrollNow),
                      avoid: otherBubbleRects(bubble.id),
                      reach: ATTACHED_PX,
                  });
            if (at.x === here.x && at.y === here.y) return;
            dispatch({
                type: 'moved',
                bubbleId: bubble.id,
                anchor: { x: at.x + scrollNow.x, y: at.y + scrollNow.y },
            });
        });
    }, [dispatch, placed, session, tabUuid]);

    const minimise = useCallback(
        (bubbleId: string) => {
            dispatch({ type: 'minimise', bubbleId });
        },
        [dispatch],
    );
    const expand = useCallback(
        (bubbleId: string) => {
            dispatch({ type: 'expand', bubbleId });
        },
        [dispatch],
    );

    const raise = useCallback((bubbleId: string) => {
        setOrder((prev) =>
            bringToFront(
                stackOrder(
                    prev,
                    sessionRef.current.bubbles.map((b) => b.id),
                ),
                bubbleId,
            ),
        );
    }, []);

    // Dropped where the user dragged it: it is not placed for them again.
    const moveByUser = useCallback(
        (bubbleId: string, at: { x: number; y: number }) => {
            const scrollNow = surfaceRef.current?.getScroll();
            if (!scrollNow) return;
            userPlacedRef.current.add(bubbleId);
            dispatch({
                type: 'moved',
                bubbleId,
                anchor: { x: at.x + scrollNow.x, y: at.y + scrollNow.y },
            });
        },
        [dispatch],
    );

    const passthrough = holding;

    // A bubble shows once its first mark has landed and it has a place.
    const shownBubbles = visibleBubbles(session, tabUuid).filter(
        (b) => nextMarkNumber(b) > 1,
    );
    const stacked = stackOrder(
        order,
        session.bubbles.map((b) => b.id),
    );
    const shownMarks = placed.filter(
        (m) =>
            m.tabUuid === tabUuid &&
            session.bubbles.some(
                (b) => b.id === m.bubbleId && m.number < nextMarkNumber(b),
            ),
    );

    const colorOf = (bubbleId: string): string =>
        bubbleColor(session.bubbles.find((b) => b.id === bubbleId)?.color ?? 0);
    // Ink takes the colour of the bubble it goes into; on the page, the next one's.
    const inkColor = bubbleColor(
        activeCollection(session)?.bubble.color ??
            nextBubbleColor(
                session.bubbles.at(-1)?.color ?? null,
                session.bubbles.map((b) => b.color),
            ),
    );

    const bubbleNodes = shownBubbles.map((bubble) => (
        <DesignBubble
            key={bubble.id}
            bubble={bubble}
            position={bubble.anchor}
            scrollsWithPage={scrollContainer !== null}
            stack={stacked.indexOf(bubble.id)}
            passthrough={passthrough}
            onRaise={() => raise(bubble.id)}
            onMove={(at) => moveByUser(bubble.id, at)}
            selected={
                on &&
                bubble.status === 'thread' &&
                bubble.collection !== null &&
                activeCollection(session)?.bubble.id === bubble.id
            }
            micOn={micOn}
            onSelect={() => arm(bubble.id)}
            listening={
                talking &&
                bubble.input === 'mic' &&
                activeCollection(session)?.bubble.id === bubble.id
            }
            onSend={(text) => send(bubble.id, text)}
            onDiscard={() => discard(bubble.id)}
            onClose={() => close(bubble.id)}
            onMinimise={() => minimise(bubble.id)}
            onExpand={() => expand(bubble.id)}
        >
            {opts.renderBubbleBody?.(bubble, session) ?? null}
        </DesignBubble>
    ));

    // Left behind by Design Mode, sent bubbles and their marks stay; the
    // ink layer and the toolbar go.
    const shown = on || shownBubbles.length > 0 || shownMarks.length > 0;
    const element =
        rect && shown ? (
            <>
                {createPortal(
                    <>
                        {on && (
                            <InkOverlay
                                rect={rect}
                                holding={holding}
                                inkVisible
                                strokes={ink}
                                color={inkColor}
                                fading={null}
                                hover={hover}
                                onHover={onHover}
                                onStrokePoint={onStrokePoint}
                                onStrokeEnd={onStrokeEnd}
                                onPick={onPick}
                            />
                        )}
                        {scrollContainer === null && (
                            <>
                                <MarkLayer
                                    clip={rect}
                                    shiftRef={marksShiftRef}
                                    marks={shownMarks}
                                    colorOf={colorOf}
                                />
                                <Box
                                    ref={bubblesShiftRef}
                                    className={layerClasses.shifted}
                                >
                                    {bubbleNodes}
                                </Box>
                            </>
                        )}
                        {on && shielded && !passthrough && (
                            <Box
                                className={layerClasses.shield}
                                {...{
                                    [CAPTURE_IGNORE_ATTRIBUTE]: '',
                                    [SHIELD_ATTRIBUTE]: '',
                                }}
                                // The press took the picture; focus stays put.
                                onMouseDown={(event) => event.preventDefault()}
                            />
                        )}
                        {on && (
                            <DesignToolbar
                                ref={toolbarRef}
                                holding={holding}
                                talking={talking}
                                micOn={micOn}
                                onMicChange={setMicOn}
                                onClose={() => setOn(false)}
                            />
                        )}
                    </>,
                    document.body,
                )}
                {/* In the page itself, the browser scrolls marks and bubbles. */}
                {scrollContainer !== null &&
                    pageLayer &&
                    createPortal(
                        <>
                            <MarkLayer
                                clip={null}
                                shiftRef={null}
                                marks={shownMarks}
                                colorOf={colorOf}
                            />
                            {bubbleNodes}
                        </>,
                        pageLayer,
                    )}
            </>
        ) : null;

    return {
        on,
        setOn,
        micOn,
        setMicOn,
        session,
        arm,
        deselect,
        send,
        discard,
        close,
        minimise,
        expand,
        holding,
        frameHold,
        screenChanged,
        element,
    };
};
