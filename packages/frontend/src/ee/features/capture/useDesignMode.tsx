import { AI_THREAD_IMAGES_MAX_PER_PROMPT } from '@lightdash/common';
import {
    Affix,
    Button,
    Group,
    Paper,
    Stack,
    Switch,
    Text,
    Textarea,
} from '@mantine/core';
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
import InkOverlay, { type FadingMark } from './components/InkOverlay';
import { composeImage } from './composeImage';
import {
    activeCollection,
    canStartHold,
    designSessionReducer,
    visibleBubbles,
    type BubbleInput,
    type DesignAction,
    type DesignSession,
} from './designSession';
import { grabDomFrame } from './domFrame';
import { sameScreen } from './frameGeometry';
import { CAPTURE_IGNORE_ATTRIBUTE } from './frameSource';
import { cancelsHold, holdToolForKey } from './holdKeys';
import { coveredTargets } from './markCoverage';
import {
    type Box,
    type CaptureMark,
    type CaptureTarget,
    type DesignPayload,
    type DesignSendResult,
    type DesignSurface,
    type DesignTool,
    type Point,
    type Stroke,
    type TranscriptPhrase,
    type VoiceState,
} from './types';
import { type TabFrame } from './useTabFrame';
import { useVoiceRecorder, type VoiceRecording } from './useVoiceRecorder';
import { wordsToPhrases } from './wordsToPhrases';

const FADE_MS = 600;
const TRAIL_SAMPLES = 24;
const RECT_REFRESH_MS = 500;
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
    /** The mic this hold started for a new bubble, if any. */
    voice: Promise<VoiceState> | null;
};

type Recording = { bubbleId: string; voice: Promise<VoiceState> };

type Commit =
    | { kind: 'strokes'; strokes: Stroke[]; endAbs: number }
    | { kind: 'pick'; target: CaptureTarget; rect: DOMRect; endAbs: number };

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

    const [session, setSession] = useState<DesignSession>(EMPTY);
    const sessionRef = useRef<DesignSession>(EMPTY);
    const dispatch = useCallback((action: DesignAction): DesignSession => {
        const next = designSessionReducer(sessionRef.current, action);
        sessionRef.current = next;
        setSession(next);
        return next;
    }, []);

    const [on, setOnState] = useState(false);
    const onRef = useRef(false);
    const [micOn, setMicOnState] = useState(false);
    const micOnRef = useRef(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [holding, setHolding] = useState<DesignTool | null>(null);
    const [ink, setInk] = useState<Stroke[]>([]);
    const [hover, setHover] = useState<Box | null>(null);
    const [fading, setFading] = useState<FadingMark | null>(null);

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
    const fadeTimerRef = useRef<number | null>(null);
    const toolbarRef = useRef<HTMLDivElement | null>(null);

    const absoluteNow = useCallback(() => performance.now(), []);
    const { start: startVoice, stop: stopVoice } = useVoiceRecorder({
        now: absoluteNow,
    });

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
                    if (drawing?.atImageLimit) {
                        showToastWarning(
                            'This message has as many pictures as it can send',
                        );
                    }
                    abandon(hold);
                    return;
                }
                if (!clocksRef.current.has(got.bubble.id)) {
                    clocksRef.current.set(got.bubble.id, clock);
                }
                const frames = framesRef.current.get(got.bubble.id) ?? [];
                const slot = drawing.drawing.imageIndex;
                if (slot === drawing.imageCount) {
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
                const done = dispatch({
                    type: 'holdEnded',
                    atMs: made.endAbs - clock,
                    mark,
                    // Content coords: the mark's top right plus the scroll.
                    anchor: {
                        x:
                            region.left +
                            (box.x + box.width) * region.width +
                            hold.scroll.x,
                        y: region.top + box.y * region.height + hold.scroll.y,
                    },
                });
                const after = activeCollection(done)?.collection.capture;
                const marks: CaptureMark[] =
                    after?.status === 'recording' ? after.marks : [];
                setInk([]);
                if (made.kind === 'strokes' && marks.length > 0) {
                    setFading({
                        strokes: made.strokes,
                        number: marks[marks.length - 1].number,
                        box,
                    });
                    if (fadeTimerRef.current) {
                        window.clearTimeout(fadeTimerRef.current);
                    }
                    fadeTimerRef.current = window.setTimeout(
                        () => setFading(null),
                        FADE_MS,
                    );
                }
            });
        },
        [abandon, dispatch, dropRecording, showToastError, showToastWarning],
    );

    const beginHold = useCallback(
        (tool: DesignTool) => {
            const current = surfaceRef.current;
            if (!current || !onRef.current || holdRef.current) return;
            if (tool === 'cursor' && !current.pickAt) return;
            if (!canStartHold(sessionRef.current)) return;
            const region = current.getRegion();
            const newBubbleId = uuidv4();
            let voice: Promise<VoiceState> | null = null;
            // The mic starts with the first press of a new bubble.
            const opensBubble = activeCollection(sessionRef.current) === null;
            if (opensBubble && micOnRef.current && !recordingRef.current) {
                voice = beginRecording(newBubbleId);
            }
            if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
            setFading(null);
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
                newBubbleId,
                voice,
            };
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
        commit(hold, { kind: 'strokes', strokes, endAbs: performance.now() });
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
            if (!hold || hold.tool !== 'cursor' || hold.picked) return;
            const hit = surfaceRef.current?.pickAt?.(holdPoint(hold, point));
            if (!hit) return;
            hold.picked = true;
            setHover(null);
            commit(hold, {
                kind: 'pick',
                target: hit.target,
                rect: hit.rect,
                endAbs: performance.now(),
            });
        },
        [commit],
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
                    const summary = [text, built]
                        .filter((part) => part !== '')
                        .join('\n\n');
                    const result = await onSendRef.current({
                        bubbleId,
                        summary,
                        marks,
                        images,
                        transcript: phrases,
                    });
                    sending = false;
                    clearFrames(bubbleId);
                    clocksRef.current.delete(bubbleId);
                    phrasesRef.current.delete(bubbleId);
                    if (result === 'cancelled') {
                        // Back to unsent first, so a reply keeps its thread.
                        dispatch({ type: 'sendFailed', bubbleId });
                        dispatch({ type: 'discard', bubbleId });
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

    const arm = useCallback(
        (bubbleId: string, input: BubbleInput) => {
            const sessionBefore = sessionRef.current;
            const before = sessionBefore.bubbles.find((b) => b.id === bubbleId);
            const next = dispatch({ type: 'arm', bubbleId, input });
            // The reducer only arms a thread bubble; anything else is ignored.
            if (next === sessionBefore) return;
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
        [beginRecording, dispatch, dropRecording],
    );

    const removeBubble = useCallback(
        (bubbleId: string, type: 'discard' | 'close') => {
            dropRecording(bubbleId);
            clearFrames(bubbleId);
            clocksRef.current.delete(bubbleId);
            phrasesRef.current.delete(bubbleId);
            dispatch({ type, bubbleId });
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
            removeBubble(bubbleId, 'discard');
        },
        [removeBubble],
    );
    const close = useCallback(
        (bubbleId: string) => removeBubble(bubbleId, 'close'),
        [removeBubble],
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
                return;
            }
            cancelHold();
            const recording = recordingRef.current;
            if (recording) dropRecording(recording.bubbleId);
            framesRef.current.forEach((frames) =>
                frames.forEach((f) => f.bitmap.close()),
            );
            framesRef.current.clear();
            clocksRef.current.clear();
            phrasesRef.current.clear();
            downKeysRef.current.clear();
            if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
            setFading(null);
            sessionRef.current = EMPTY;
            setSession(EMPTY);
        },
        [cancelHold, dropRecording],
    );

    const toggle = useCallback(() => setOn(!onRef.current), [setOn]);
    // No surface, no hotkey: the page keeps the key combination.
    useHotkeys(surface ? [['mod+shift+X', toggle]] : [], [], true);

    // Esc throws away an unsent bubble; with none, it leaves Design Mode.
    const onEscape = useCallback(() => {
        const s = sessionRef.current;
        const active = activeCollection(s)?.bubble ?? null;
        // A send in flight is left alone: the bubble is no longer unsent.
        if (active?.status === 'sending') return;
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
                if (event.key === 'Escape') onEscape();
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
            endHold();
            downKeys.clear();
            window.setTimeout(() => {
                if (document.activeElement?.tagName !== 'IFRAME') return;
                window.focus();
                toolbarRef.current?.focus({ preventScroll: true });
            }, 0);
        };
        const refreshRect = () => {
            if (holdRef.current) return;
            const region = surfaceRef.current?.getRegion();
            if (region) setRect(region);
        };
        const rectTimer = window.setInterval(refreshRect, RECT_REFRESH_MS);

        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('blur', onBlur);
        window.addEventListener('resize', refreshRect);
        return () => {
            window.clearInterval(rectTimer);
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('keyup', onKeyUp, true);
            window.removeEventListener('contextmenu', onContextMenu, true);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('resize', refreshRect);
        };
    }, [beginHold, cancelHold, endHold, on, onEscape]);

    // The page stops offering Design Mode (flag off, preview closed).
    useEffect(() => {
        if (!surface && onRef.current) setOn(false);
    }, [setOn, surface]);

    const tabUuid = surface?.getTab()?.uuid ?? null;
    const passthrough = holding !== null;

    // Placeholder toolbar and bubbles; the real components replace them.
    const element =
        on && rect
            ? createPortal(
                  <>
                      <InkOverlay
                          rect={rect}
                          holding={passthrough}
                          inkVisible
                          strokes={ink}
                          fading={fading}
                          hover={hover}
                          onStrokePoint={onStrokePoint}
                          onStrokeEnd={onStrokeEnd}
                          onPick={holding === 'cursor' ? onPick : null}
                      />
                      <Affix
                          position={{ bottom: 16, right: 16 }}
                          zIndex={9997}
                          withinPortal={false}
                      >
                          <Stack
                              gap="xs"
                              {...{ [CAPTURE_IGNORE_ATTRIBUTE]: '' }}
                          >
                              {visibleBubbles(session, tabUuid).map(
                                  (bubble) => (
                                      <Paper
                                          key={bubble.id}
                                          p="xs"
                                          data-passthrough={passthrough}
                                      >
                                          {bubble.collection &&
                                              bubble.input === 'text' && (
                                                  <Textarea
                                                      aria-label="Message"
                                                      placeholder="Say what to change"
                                                      autosize
                                                      onKeyDown={(event) => {
                                                          if (
                                                              event.key !==
                                                                  'Enter' ||
                                                              event.shiftKey
                                                          ) {
                                                              return;
                                                          }
                                                          event.preventDefault();
                                                          send(
                                                              bubble.id,
                                                              event
                                                                  .currentTarget
                                                                  .value,
                                                          );
                                                      }}
                                                  />
                                              )}
                                          <Group gap="xs" mt="xs">
                                              {bubble.collection &&
                                                  bubble.input === 'mic' && (
                                                      <Button
                                                          size="xs"
                                                          onClick={() =>
                                                              stop(bubble.id)
                                                          }
                                                      >
                                                          Stop
                                                      </Button>
                                                  )}
                                              <Button
                                                  size="xs"
                                                  variant="subtle"
                                                  onClick={() =>
                                                      close(bubble.id)
                                                  }
                                              >
                                                  Close
                                              </Button>
                                          </Group>
                                      </Paper>
                                  ),
                              )}
                              <Paper ref={toolbarRef} tabIndex={-1} p="xs">
                                  <Group gap="xs">
                                      <Text size="sm" fw={600}>
                                          Design Mode
                                      </Text>
                                      <Switch
                                          size="xs"
                                          label="Mic"
                                          checked={micOn}
                                          onChange={(event) =>
                                              setMicOn(
                                                  event.currentTarget.checked,
                                              )
                                          }
                                      />
                                      <Button
                                          size="xs"
                                          variant="subtle"
                                          onClick={() => setOn(false)}
                                      >
                                          Done
                                      </Button>
                                  </Group>
                              </Paper>
                          </Stack>
                      </Affix>
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
        element,
    };
};
