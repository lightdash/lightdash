import { AI_THREAD_IMAGES_MAX_PER_PROMPT } from '@lightdash/common';
import { useHotkeys } from '@mantine/hooks';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import useToaster from '../../../hooks/toaster/useToaster';
import { grabAppFrame } from './appFrame';
import { buildSummary } from './buildSummary';
import { type ShiftUpAction } from './captureReducer';
import { classifyMark } from './classifyStroke';
import DesignBubble from './components/DesignBubble';
import DesignToolbar from './components/DesignToolbar';
import InkOverlay from './components/InkOverlay';
import MarkLayer from './components/MarkLayer';
import { composeImage } from './composeImage';
import {
    activeCollection,
    canStartHold,
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
import { sameScreen } from './frameGeometry';
import { cancelsHold, escapeIsForDesignMode, holdToolForKey } from './holdKeys';
import { coveredTargets } from './markCoverage';
import { intoView, placeBubble, placeClear } from './placeBubble';
import { type TabFrame } from './tabFrame';
import {
    type Box,
    type CaptureMark,
    type CaptureTarget,
    type DesignPayload,
    type DesignSendResult,
    type DesignSurface,
    type DesignTool,
    type LayerMark,
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
// Bubbles keep off the strip along the bottom where the toolbar sits.
const TOOLBAR_STRIP_PX = 72;
const EMPTY: DesignSession = { bubbles: [], active: { kind: 'page' } };

type Hold = {
    tool: DesignTool;
    startAbs: number;
    rect: DOMRect;
    scroll: { x: number; y: number };
    strokes: Stroke[];
    current: Stroke | null;
    /** Cursor: one pick per hold. */
    picked: boolean;
    /** Used when the hold opens a bubble from the page. */
    newBubbleId: string;
    /** The mic this hold started for a new bubble, with its first stroke or pick. */
    voice: Promise<VoiceState> | null;
};

const viewportRect = (): DOMRect =>
    new DOMRect(0, 0, window.innerWidth, window.innerHeight - TOOLBAR_STRIP_PX);

type Recording = { bubbleId: string; voice: Promise<VoiceState> };

// pointer is where the mouse was when the mark was made, in viewport pixels.
type Commit =
    | {
          kind: 'strokes';
          strokes: Stroke[];
          endAbs: number;
          pointer: { x: number; y: number };
      }
    | {
          kind: 'pick';
          target: CaptureTarget;
          rect: DOMRect;
          endAbs: number;
          pointer: { x: number; y: number };
      };

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

// An app is picked by a click inside its own frame, which this page cannot see.
const picksInFrame = (surface: DesignSurface | null): boolean =>
    surface?.frameSource === 'app';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const boxInRegion = (rect: DOMRect, region: DOMRect): Box => {
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
    arm: (bubbleId: string, input: BubbleInput) => void;
    send: (bubbleId: string, typed: string) => void;
    stop: (bubbleId: string) => void;
    discard: (bubbleId: string) => void;
    close: (bubbleId: string) => void;
    holding: DesignTool | null;
    /** An app's own element picker reported a click, at this viewport point. */
    framePick: (at: { x: number; y: number }) => void;
    /** A hold key went down or came up inside an app frame. */
    frameHold: (tool: DesignTool, phase: 'down' | 'up') => void;
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
    const [holding, setHolding] = useState<DesignTool | null>(null);
    const [ink, setInk] = useState<Stroke[]>([]);
    const [hover, setHover] = useState<Box | null>(null);
    const [placed, setPlaced] = useState<LayerMark[]>([]);
    const [scroll, setScroll] = useState({ x: 0, y: 0 });

    const holdRef = useRef<Hold | null>(null);
    const downKeysRef = useRef(new Set<string>());
    const framesRef = useRef(new Map<string, TabFrame[]>());
    // When each bubble's current collection started, on the performance clock.
    const clocksRef = useRef(new Map<string, number>());
    const recordingRef = useRef<Recording | null>(null);
    // Mic starts and stops run one after another, so a late stop hits its own start.
    const voiceChainRef = useRef<Promise<void>>(Promise.resolve());
    // Words already transcribed for a bubble whose send failed.
    const phrasesRef = useRef(new Map<string, TranscriptPhrase[]>());
    const finishingRef = useRef(new Set<string>());
    const queueRef = useRef<Promise<void>>(Promise.resolve());
    const toolbarRef = useRef<HTMLDivElement | null>(null);

    const absoluteNow = useCallback(() => performance.now(), []);
    const { start: startVoice, stop: stopVoice } = useVoiceRecorder({
        now: absoluteNow,
    });

    const refreshScroll = useCallback(() => {
        const next = surfaceRef.current?.getScroll();
        if (!next) return;
        setScroll((prev) =>
            prev.x === next.x && prev.y === next.y ? prev : next,
        );
    }, []);

    const clearFrames = useCallback((bubbleId: string) => {
        framesRef.current.get(bubbleId)?.forEach((f) => f.bitmap.close());
        framesRef.current.delete(bubbleId);
    }, []);

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

    // A hold that never became a mark gives back the mic it started.
    const abandon = useCallback(
        (hold: Hold) => {
            const opened = sessionRef.current.bubbles.some(
                (b) => b.id === hold.newBubbleId,
            );
            if (hold.voice && !opened) dropRecording(hold.newBubbleId);
        },
        [dropRecording],
    );

    const commit = useCallback(
        (hold: Hold, made: Commit) => {
            const current = surfaceRef.current;
            if (!current) return;
            const region = hold.rect;
            const framePromise = grabFrame(current, region);
            framePromise.catch(() => {});
            const tab = current.getTab();

            queueRef.current = queueRef.current.then(async () => {
                let frame: TabFrame;
                try {
                    frame = await framePromise;
                } catch {
                    setInk([]);
                    showToastError('Could not capture the screen');
                    abandon(hold);
                    return;
                }
                const voice = hold.voice ? await hold.voice : null;
                if (voice === 'off') dropRecording(hold.newBubbleId);
                const before = sessionRef.current;
                if (!onRef.current || !canStartHold(before)) {
                    frame.bitmap.close();
                    setInk([]);
                    abandon(hold);
                    return;
                }

                const open = activeCollection(before);
                const bubbleId = open?.bubble.id ?? hold.newBubbleId;
                const clock = clocksRef.current.get(bubbleId) ?? hold.startAbs;
                const capture = open?.collection.capture;
                const lastSlot =
                    capture?.status === 'recording'
                        ? capture.imageCount - 1
                        : -1;
                const marksBefore =
                    capture?.status === 'recording' ? capture.marks.length : 0;
                const wasAtImageLimit =
                    capture?.status === 'recording' && capture.atImageLimit;
                const previous = framesRef.current.get(bubbleId)?.[lastSlot];
                const tabUuid = tab?.uuid ?? null;
                const isNewScreen =
                    !previous ||
                    open?.collection.tabUuids[lastSlot] !== tabUuid ||
                    !sameScreen(frame.thumb, previous.thumb);

                const started = dispatch({
                    type: 'holdStarted',
                    tool: hold.tool,
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
                if (!got || !drawing?.drawing) {
                    frame.bitmap.close();
                    setInk([]);
                    abandon(hold);
                    return;
                }
                // The mark is kept either way; say so once per screen.
                if (drawing.atImageLimit && !wasAtImageLimit) {
                    showToastWarning(
                        'This message has as many pictures as it can send. Marks on this screen will be described in words.',
                    );
                }
                if (!clocksRef.current.has(got.bubble.id)) {
                    clocksRef.current.set(got.bubble.id, clock);
                }
                const frames = framesRef.current.get(got.bubble.id) ?? [];
                const slot = drawing.drawing.imageIndex;
                if (
                    slot === drawing.imageCount &&
                    slot < AI_THREAD_IMAGES_MAX_PER_PROMPT
                ) {
                    frames[slot]?.bitmap.close();
                    frames[slot] = frame;
                    framesRef.current.set(got.bubble.id, frames);
                } else {
                    frame.bitmap.close();
                }

                const toViewport = (point: Point) => ({
                    x: region.left + point.x * region.width,
                    y: region.top + point.y * region.height,
                });
                let box: Box;
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
                } else {
                    box = boxInRegion(made.rect, region);
                    mark = {
                        target: made.target,
                        arrowTo: null,
                        trail: [made.target],
                        covers: [{ target: made.target, share: 1 }],
                        tabName: tab?.name ?? null,
                        box,
                    };
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
                    document
                        .querySelector(`[data-bubble-id="${got.bubble.id}"]`)
                        ?.getBoundingClientRect() ?? null;
                const at = placeBubble({
                    markRect: markNow,
                    current: onScreen,
                    size: onScreen ?? NEW_BUBBLE_SIZE,
                    viewport: viewportRect(),
                    pointer: {
                        x: made.pointer.x - dx,
                        y: made.pointer.y - dy,
                    },
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
                setInk([]);
                const newest = marks[marks.length - 1];
                if (!newest || marks.length <= marksBefore) return;
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
                setPlaced((prev) => [
                    ...prev.filter(
                        (m) =>
                            m.bubbleId !== layerMark.bubbleId ||
                            m.number < layerMark.number,
                    ),
                    layerMark,
                ]);
                refreshScroll();
            });
        },
        [
            abandon,
            dispatch,
            dropRecording,
            refreshScroll,
            showToastError,
            showToastWarning,
        ],
    );

    const beginHold = useCallback((tool: DesignTool) => {
        const current = surfaceRef.current;
        if (!current || !onRef.current || holdRef.current) return;
        if (tool === 'cursor' && !current.pickAt) return;
        if (!canStartHold(sessionRef.current)) return;
        const region = current.getRegion();
        setInk([]);
        setHover(null);
        setRect(region);
        setHolding(tool);
        holdRef.current = {
            tool,
            startAbs: performance.now(),
            rect: region,
            scroll: current.getScroll(),
            strokes: [],
            current: null,
            picked: false,
            newBubbleId: uuidv4(),
            voice: null,
        };
    }, []);

    // The mic starts with a new bubble's first stroke or pick, not the bare
    // key: Option and Control are also pressed for shortcuts.
    const startHoldVoice = useCallback(
        (hold: Hold) => {
            if (hold.voice || !micOnRef.current || recordingRef.current) return;
            if (activeCollection(sessionRef.current) !== null) return;
            hold.voice = beginRecording(hold.newBubbleId);
        },
        [beginRecording],
    );

    const cancelHold = useCallback(() => {
        const hold = holdRef.current;
        if (!hold) return;
        holdRef.current = null;
        setHolding(null);
        setInk([]);
        setHover(null);
        if (!hold.picked) abandon(hold);
    }, [abandon]);

    // Drawing the page blocks the pen, so the picture is taken on release.
    const endHold = useCallback(() => {
        const hold = holdRef.current;
        if (!hold) return;
        holdRef.current = null;
        setHolding(null);
        setHover(null);
        if (hold.tool === 'cursor') {
            if (!hold.picked) abandon(hold);
            return;
        }
        const strokes = hold.current
            ? [...hold.strokes, hold.current]
            : hold.strokes;
        if (strokes.length === 0) {
            setInk([]);
            abandon(hold);
            return;
        }
        const lastStroke = strokes[strokes.length - 1];
        commit(hold, {
            kind: 'strokes',
            strokes,
            endAbs: performance.now(),
            pointer: holdPoint(
                hold,
                lastStroke.points[lastStroke.points.length - 1],
            ),
        });
    }, [abandon, commit]);

    const refreshInk = useCallback(() => {
        const hold = holdRef.current;
        if (!hold) return;
        setInk(hold.current ? [...hold.strokes, hold.current] : hold.strokes);
    }, []);

    const onStrokePoint = useCallback(
        (point: Point) => {
            const hold = holdRef.current;
            if (!hold) return;
            if (hold.tool === 'cursor') {
                if (hold.picked) return;
                const hit = surfaceRef.current?.pickAt?.(
                    holdPoint(hold, point),
                );
                setHover(hit ? boxInRegion(hit.rect, hold.rect) : null);
                return;
            }
            startHoldVoice(hold);
            hold.current = {
                points: hold.current
                    ? [...hold.current.points, point]
                    : [point],
            };
            refreshInk();
        },
        [refreshInk, startHoldVoice],
    );

    const onStrokeEnd = useCallback(() => {
        const hold = holdRef.current;
        if (!hold?.current) return;
        hold.strokes = [...hold.strokes, hold.current];
        hold.current = null;
        refreshInk();
    }, [refreshInk]);

    const framePick = useCallback(
        (at: { x: number; y: number }) => {
            const hold = holdRef.current;
            if (!hold || hold.tool !== 'cursor' || hold.picked) return;
            const hit = surfaceRef.current?.pickAt?.(at);
            if (!hit) return;
            hold.picked = true;
            setHover(null);
            startHoldVoice(hold);
            commit(hold, {
                kind: 'pick',
                target: hit.target,
                rect: hit.rect,
                endAbs: performance.now(),
                pointer: at,
            });
        },
        [commit, startHoldVoice],
    );

    const onPick = useCallback(
        (point: Point) => {
            const hold = holdRef.current;
            if (hold) framePick(holdPoint(hold, point));
        },
        [framePick],
    );

    const frameHold = useCallback(
        (tool: DesignTool, phase: 'down' | 'up') => {
            if (phase === 'up') {
                if (holdRef.current?.tool === tool) endHold();
                return;
            }
            if (downKeysRef.current.size === 0) beginHold(tool);
        },
        [beginHold, endHold],
    );

    const finish = useCallback(
        (bubbleId: string, typed: string) => {
            const bubble = sessionRef.current.bubbles.find(
                (b) => b.id === bubbleId,
            );
            if (!bubble?.collection) return;
            if (bubble.status !== 'collecting' && bubble.status !== 'thread') {
                return;
            }
            if (finishingRef.current.has(bubbleId)) return;
            finishingRef.current.add(bubbleId);
            if (holdRef.current) endHold();

            const recording = recordingRef.current;
            const owns = recording?.bubbleId === bubbleId;
            if (owns) recordingRef.current = null;
            const recordingPromise = owns
                ? endRecording(recording)
                : Promise.resolve(null);

            queueRef.current = queueRef.current.then(async () => {
                let sending = false;
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
                        if (marks.length === 0) {
                            showToastWarning('Nothing to send yet');
                        }
                        return;
                    }
                    if (marks.length === 0 && phrases.length === 0 && !text) {
                        showToastWarning('Nothing to send yet');
                        return;
                    }

                    dispatch({
                        type: 'sendStarted',
                        bubbleId,
                        needsPicker: false,
                    });
                    sending = true;
                    const frames = framesRef.current.get(bubbleId) ?? [];
                    const images = await Promise.all(
                        frames
                            .slice(
                                0,
                                Math.min(
                                    capture.imageCount,
                                    AI_THREAD_IMAGES_MAX_PER_PROMPT,
                                ),
                            )
                            .map((frame, index) =>
                                composeImage({
                                    frame: frame.bitmap,
                                    marks: marks.filter(
                                        (m) => m.imageIndex === index,
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
                        // The recording is spent: no Stop button with no mic.
                        dispatch({
                            type: 'inputChanged',
                            bubbleId,
                            input: 'text',
                        });
                    }
                } finally {
                    finishingRef.current.delete(bubbleId);
                }
            });
        },
        [
            clearFrames,
            dispatch,
            dropRecording,
            endHold,
            endRecording,
            showToastError,
            showToastWarning,
        ],
    );

    const send = useCallback(
        (bubbleId: string, typed: string) => finish(bubbleId, typed),
        [finish],
    );
    const stop = useCallback(
        (bubbleId: string) => finish(bubbleId, ''),
        [finish],
    );

    const removeBubble = useCallback(
        (bubbleId: string, type: 'discard' | 'close') => {
            dropRecording(bubbleId);
            clearFrames(bubbleId);
            clocksRef.current.delete(bubbleId);
            phrasesRef.current.delete(bubbleId);
            const { bubbles } = dispatch({ type, bubbleId });
            setPlaced((prev) =>
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
        [clearFrames, dispatch, dropRecording],
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
            [...framesRef.current.keys()]
                .filter((id) => !busy.has(id))
                .forEach(clearFrames);
            [clocksRef.current, phrasesRef.current].forEach((kept) =>
                [...kept.keys()]
                    .filter((id) => !busy.has(id))
                    .forEach((id) => kept.delete(id)),
            );
            setPlaced((prev) =>
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
        [clearFrames, dropRecording],
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
        (bubbleId: string, input: BubbleInput) => {
            // Its last reply is still being stopped, transcribed or sent.
            if (finishingRef.current.has(bubbleId)) return;
            const sessionBefore = sessionRef.current;
            const before = sessionBefore.bubbles.find((b) => b.id === bubbleId);
            const next = dispatch({ type: 'arm', bubbleId, input });
            // The reducer only arms a thread bubble; anything else is ignored.
            if (next === sessionBefore) return;
            // A reply to a bubble left on the page brings Design Mode back.
            setOn(true);
            if (!before?.collection) {
                clocksRef.current.set(bubbleId, performance.now());
            }
            const recording = recordingRef.current;
            if (
                recording &&
                (recording.bubbleId !== bubbleId || input === 'text')
            ) {
                dropRecording(recording.bubbleId);
            }
            if (input !== 'mic' || recordingRef.current) return;
            const voice = beginRecording(bubbleId);
            void voice.then((state) => {
                if (state === 'on') return;
                if (recordingRef.current?.voice === voice) {
                    recordingRef.current = null;
                }
                dispatch({ type: 'inputChanged', bubbleId, input: 'text' });
            });
        },
        [beginRecording, dispatch, dropRecording, setOn],
    );

    const toggle = useCallback(() => setOn(!onRef.current), [setOn]);
    // No surface, no hotkey: the page keeps the key combination.
    useHotkeys(surface ? [['mod+shift+X', toggle]] : [], [], true);

    // Esc throws away an unsent bubble; with none, it leaves Design Mode.
    // Says whether it did anything.
    const onEscape = useCallback((): boolean => {
        const s = sessionRef.current;
        const active = activeCollection(s)?.bubble ?? null;
        // A send in flight is left alone: the bubble is no longer unsent.
        if (active?.status === 'sending') return false;
        const unsent =
            active && active.status !== 'queued'
                ? active
                : s.bubbles.find(
                      (b) =>
                          b.status === 'collecting' ||
                          b.status === 'picking-agent',
                  );
        if (unsent) discard(unsent.id);
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
            const tool = holdToolForKey(event);
            if (!tool || downKeys.size > 0) return;
            beginHold(tool);
        };
        const onKeyUp = (event: KeyboardEvent) => {
            downKeys.delete(event.code || event.key);
            // A held Command swallows the other keys' keyup on macOS.
            if (event.key === 'Meta') downKeys.clear();
            const hold = holdRef.current;
            if (!hold) return;
            if (
                (hold.tool === 'stylus' && event.key === 'Alt') ||
                (hold.tool === 'cursor' && event.key === 'Control')
            ) {
                endHold();
            }
        };
        const onContextMenu = (event: MouseEvent) => {
            if (holdRef.current?.tool === 'cursor' || event.ctrlKey) {
                event.preventDefault();
            }
        };
        // A sealed iframe swallows keys once clicked, so take focus back.
        const onBlur = () => {
            // Picking in an app means clicking into its frame: the hold stays.
            const picking =
                holdRef.current?.tool === 'cursor' &&
                picksInFrame(surfaceRef.current);
            if (!picking) endHold();
            downKeys.clear();
            window.setTimeout(() => {
                if (document.activeElement?.tagName !== 'IFRAME') {
                    if (picking && holdRef.current?.tool === 'cursor') {
                        endHold();
                    }
                    return;
                }
                window.focus();
                toolbarRef.current?.focus({ preventScroll: true });
            }, 0);
        };
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('keyup', onKeyUp, true);
            window.removeEventListener('contextmenu', onContextMenu, true);
            window.removeEventListener('blur', onBlur);
        };
    }, [beginHold, cancelHold, endHold, on, onEscape]);

    // Marks and bubbles follow the page for as long as any are on it, also
    // after Design Mode is left.
    const following = on || session.bubbles.length > 0;
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

    const tabUuid = surface?.getTab()?.uuid ?? null;
    // The open bubble follows the user to another tab; bring it into view there.
    useEffect(() => {
        const current = surfaceRef.current;
        const open = activeCollection(sessionRef.current);
        if (!current || !open) return;
        const onScreen = document
            .querySelector(`[data-bubble-id="${open.bubble.id}"]`)
            ?.getBoundingClientRect();
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

    // A sent bubble grows into a conversation: once, when it first shows as
    // one, it moves to where that leaves its marks uncovered.
    const roomedRef = useRef(new Set<string>());
    useEffect(() => {
        const current = surfaceRef.current;
        if (!current) return;
        const scrollNow = current.getScroll();
        visibleBubbles(session, tabUuid).forEach((bubble) => {
            if (bubble.status !== 'thread' && bubble.status !== 'picking-agent')
                return;
            if (roomedRef.current.has(bubble.id)) return;
            const onScreen = document
                .querySelector(`[data-bubble-id="${bubble.id}"]`)
                ?.getBoundingClientRect();
            if (!onScreen) return;
            roomedRef.current.add(bubble.id);
            const at = placeClear({
                marks: placed
                    .filter(
                        (m) =>
                            m.bubbleId === bubble.id && m.tabUuid === tabUuid,
                    )
                    .map(
                        (m) =>
                            new DOMRect(
                                m.box.x - scrollNow.x,
                                m.box.y - scrollNow.y,
                                m.box.width,
                                m.box.height,
                            ),
                    ),
                current: { x: onScreen.left, y: onScreen.top },
                size: SENT_BUBBLE_SIZE,
                viewport: viewportRect(),
            });
            if (at.x === onScreen.left && at.y === onScreen.top) return;
            dispatch({
                type: 'moved',
                bubbleId: bubble.id,
                anchor: { x: at.x + scrollNow.x, y: at.y + scrollNow.y },
            });
        });
    }, [dispatch, placed, session, tabUuid]);

    const passthrough = holding !== null;
    // The app's own picker takes the click, so the ink layer stays out of the way.
    const inkTakesPointer =
        passthrough && !(holding === 'cursor' && picksInFrame(surface));

    // A bubble shows once its first mark has landed and it has a place.
    const shownBubbles = visibleBubbles(session, tabUuid).filter(
        (b) => nextMarkNumber(b) > 1,
    );
    const shownMarks = placed.filter(
        (m) =>
            m.tabUuid === tabUuid &&
            session.bubbles.some(
                (b) => b.id === m.bubbleId && m.number < nextMarkNumber(b),
            ),
    );

    // Left behind by Design Mode, sent bubbles and their marks stay; the
    // ink layer and the toolbar go.
    const element =
        rect && (on || shownBubbles.length > 0 || shownMarks.length > 0)
            ? createPortal(
                  <>
                      {on && (
                          <InkOverlay
                              rect={rect}
                              holding={inkTakesPointer}
                              inkVisible
                              strokes={ink}
                              fading={null}
                              hover={hover}
                              onStrokePoint={onStrokePoint}
                              onStrokeEnd={onStrokeEnd}
                              onPick={holding === 'cursor' ? onPick : null}
                          />
                      )}
                      <MarkLayer
                          region={rect}
                          scroll={scroll}
                          marks={shownMarks}
                      />
                      {shownBubbles.map((bubble) => (
                          <DesignBubble
                              key={bubble.id}
                              bubble={bubble}
                              position={{
                                  x: bubble.anchor.x - scroll.x,
                                  y: bubble.anchor.y - scroll.y,
                              }}
                              passthrough={passthrough}
                              listening={
                                  bubble.collection !== null &&
                                  bubble.input === 'mic' &&
                                  (bubble.status === 'collecting' ||
                                      bubble.status === 'thread')
                              }
                              onSend={(text) => send(bubble.id, text)}
                              onStop={() => stop(bubble.id)}
                              onDiscard={() => discard(bubble.id)}
                              onClose={() => close(bubble.id)}
                          >
                              {opts.renderBubbleBody?.(bubble, session) ?? null}
                          </DesignBubble>
                      ))}
                      {on && (
                          <DesignToolbar
                              ref={toolbarRef}
                              tool={holding}
                              micOn={micOn}
                              onMicChange={setMicOn}
                              onClose={() => setOn(false)}
                          />
                      )}
                  </>,
                  document.body,
              )
            : null;

    return {
        on,
        setOn,
        micOn,
        setMicOn,
        session,
        arm,
        send,
        stop,
        discard,
        close,
        holding,
        framePick,
        frameHold,
        element,
    };
};
