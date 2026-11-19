import { useHotkeys } from '@mantine/hooks';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import useToaster from '../../../hooks/toaster/useToaster';
import { grabAppFrame, resolveAppFrameSource } from './appFrame';
import { buildSummary } from './buildSummary';
import {
    captureReducer,
    finishOutcome,
    type CaptureAction,
    type CaptureState,
} from './captureReducer';
import { classifyMark } from './classifyStroke';
import CapturePill from './components/CapturePill';
import InkOverlay, { type FadingMark } from './components/InkOverlay';
import { composeImage } from './composeImage';
import { grabDomFrame } from './domFrame';
import { sameScreen } from './frameGeometry';
import { coveredTargets } from './markCoverage';
import {
    type CaptureSurface,
    type CaptureTarget,
    type Point,
    type Stroke,
    type TranscriptPhrase,
} from './types';
import { useTabFrame, type TabFrame, type TabFrameError } from './useTabFrame';
import { useVoiceRecorder } from './useVoiceRecorder';
import { wordsToPhrases } from './wordsToPhrases';

type FrameMethod = 'tab' | 'dom' | 'app';

const FADE_MS = 600;
const TRAIL_SAMPLES = 24;
const IDLE: CaptureState = { status: 'idle' };

const STREAM_ERROR_TITLES: Record<TabFrameError, string> = {
    denied: 'Screen sharing is needed to capture',
    'wrong-surface': 'Pick this tab to capture',
    unsupported: 'Capture needs Chrome',
};

type Hold = {
    startMs: number;
    rect: DOMRect;
    strokes: Stroke[];
    current: Stroke | null;
    /** Null when the surface does not want pictures. */
    frame: Promise<TabFrame | null>;
};

const nextPaint = (): Promise<void> =>
    new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

const overlaps = (a: DOMRect, b: DOMRect): boolean =>
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top;

const isEditable = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export const useCapture = (
    surface: CaptureSurface | null,
): {
    start: () => void;
    toggle: () => void;
    isRecording: boolean;
    element: ReactNode;
} => {
    // Read through a ref so the callbacks below keep a stable identity.
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

    const [state, setState] = useState<CaptureState>(IDLE);
    const stateRef = useRef<CaptureState>(IDLE);
    const dispatch = useCallback((action: CaptureAction): CaptureState => {
        const next = captureReducer(stateRef.current, action);
        stateRef.current = next;
        setState(next);
        return next;
    }, []);

    const surfaceRef = useRef(surface);
    surfaceRef.current = surface;

    const [rect, setRect] = useState<DOMRect | null>(null);
    const [holding, setHolding] = useState(false);
    const [inkVisible, setInkVisible] = useState(false);
    const [ink, setInk] = useState<Stroke[]>([]);
    const [fading, setFading] = useState<FadingMark | null>(null);
    const [pillHidden, setPillHidden] = useState(false);
    const [startedAt, setStartedAt] = useState(0);

    const startedAtRef = useRef(0);
    const startingRef = useRef(false);
    const holdRef = useRef<Hold | null>(null);
    const framesRef = useRef<TabFrame[]>([]);
    const queueRef = useRef<Promise<void>>(Promise.resolve());
    const pillRef = useRef<HTMLDivElement | null>(null);
    const fadeTimerRef = useRef<number | null>(null);
    const finishRef = useRef<() => void>(() => {});
    const finishingRef = useRef(false);
    const voiceOnRef = useRef(false);
    // Where this recording's pictures come from; decided when it starts.
    const frameSourceRef = useRef<FrameMethod>('tab');
    const [finishing, setFinishing] = useState(false);
    const absoluteNow = useCallback(() => performance.now(), []);

    const now = useCallback(() => performance.now() - startedAtRef.current, []);
    // The recorder keeps absolute time; finish() converts to the capture clock.
    const {
        start: startVoice,
        stop: stopVoice,
        listening,
        offReason: voiceOffReason,
    } = useVoiceRecorder({ now: absoluteNow });
    const { ensureStream, grab } = useTabFrame({
        onStreamEnded: () => finishRef.current(),
    });

    const clearSession = useCallback(() => {
        holdRef.current = null;
        framesRef.current.forEach((frame) => frame.bitmap.close());
        framesRef.current = [];
        if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
        setHolding(false);
        setInk([]);
        setFading(null);
        setPillHidden(false);
        dispatch({ type: 'reset' });
    }, [dispatch]);

    const start = useCallback(() => {
        const current = surfaceRef.current;
        if (!current || startingRef.current) return;
        if (stateRef.current.status !== 'idle') return;
        startingRef.current = true;
        void (async () => {
            try {
                // Dashboards draw their own page; data apps send their own
                // picture. Only when neither works is the tab shared, which
                // is the one case that shows the browser's share prompt.
                let method: FrameMethod = 'tab';
                if (current.captureImages && current.frameSource === 'dom') {
                    method = 'dom';
                } else if (current.captureImages) {
                    method = await resolveAppFrameSource({
                        probe: current.grabAppImage ?? null,
                    });
                }
                frameSourceRef.current = method;
                if (current.captureImages && method === 'tab') {
                    const stream = await ensureStream();
                    if (!stream.ok) {
                        showToastError(STREAM_ERROR_TITLES[stream.error]);
                        return;
                    }
                }
                // No transcriber means no voice, so the mic is never asked for.
                const voice = await startVoice({
                    available: current.transcribe !== null,
                });
                voiceOnRef.current = voice === 'on';
                // The clock starts once the share and mic prompts are answered.
                startedAtRef.current = performance.now();
                setStartedAt(startedAtRef.current);
                queueRef.current = Promise.resolve();
                setRect(current.getRegion());
                dispatch({ type: 'started', voice });
            } finally {
                startingRef.current = false;
            }
        })();
    }, [dispatch, ensureStream, showToastError, startVoice]);

    const endHold = useCallback(() => {
        const hold = holdRef.current;
        if (!hold) return;
        holdRef.current = null;
        if (hold.current) hold.strokes.push(hold.current);
        const endMs = now();
        setHolding(false);

        queueRef.current = queueRef.current.then(async () => {
            let frame: TabFrame | null;
            try {
                frame = await hold.frame;
            } catch {
                setInk([]);
                showToastError('Could not capture the screen');
                return;
            }
            const before = stateRef.current;
            if (before.status !== 'recording' || hold.strokes.length === 0) {
                frame?.bitmap.close();
                setInk([]);
                return;
            }
            const previous = framesRef.current[before.imageCount - 1];
            // Without pictures every mark belongs to the one "screen".
            const isNewScreen = frame
                ? !previous || !sameScreen(frame.thumb, previous.thumb)
                : before.imageCount === 0;
            const drawing = dispatch({
                type: 'shiftDown',
                atMs: hold.startMs,
                isNewScreen,
            });
            if (drawing.status !== 'recording' || !drawing.drawing) {
                frame?.bitmap.close();
                setInk([]);
                return;
            }
            if (frame && drawing.drawing.imageIndex === before.imageCount) {
                framesRef.current[before.imageCount] = frame;
            } else {
                frame?.bitmap.close();
            }
            hold.strokes.forEach((stroke) =>
                dispatch({ type: 'strokeAdded', stroke }),
            );

            const { box, arrow } = classifyMark(hold.strokes);
            const resolveTarget = surfaceRef.current?.resolveTarget ?? null;
            const toViewport = (point: Point) => ({
                x: hold.rect.left + point.x * hold.rect.width,
                y: hold.rect.top + point.y * hold.rect.height,
            });
            let target: CaptureTarget | null = null;
            let arrowTo: CaptureTarget | null = null;
            if (resolveTarget && arrow) {
                target = resolveTarget(toViewport(arrow.from));
                arrowTo = resolveTarget(toViewport(arrow.to));
            } else if (resolveTarget) {
                target = resolveTarget(
                    toViewport({
                        x: box.x + box.width / 2,
                        y: box.y + box.height / 2,
                    }),
                );
            }
            // Sample the strokes to learn what they passed over, in order.
            const trail: CaptureTarget[] = [];
            if (resolveTarget) {
                const points = hold.strokes.flatMap((stroke) => stroke.points);
                const step = Math.max(
                    1,
                    Math.floor(points.length / TRAIL_SAMPLES),
                );
                for (let i = 0; i < points.length; i += step) {
                    const hit = resolveTarget(toViewport(points[i]));
                    const last = trail[trail.length - 1];
                    if (
                        hit &&
                        (hit.kind !== last?.kind || hit.id !== last?.id)
                    ) {
                        trail.push(hit);
                    }
                }
            }
            const done = dispatch({
                type: 'shiftUp',
                atMs: endMs,
                target,
                arrowTo,
                trail,
                covers: resolveTarget
                    ? coveredTargets(box, (point) =>
                          resolveTarget(toViewport(point)),
                      )
                    : [],
            });
            if (done.status !== 'recording') return;

            setInk([]);
            setFading({
                strokes: hold.strokes,
                number: done.marks.length,
                box,
            });
            if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
            fadeTimerRef.current = window.setTimeout(
                () => setFading(null),
                FADE_MS,
            );
        });
    }, [dispatch, now, showToastError]);

    const beginHold = useCallback(() => {
        const current = surfaceRef.current;
        if (!current || holdRef.current || finishingRef.current) return;
        if (stateRef.current.status !== 'recording') return;
        const region = current.getRegion();
        const pill = pillRef.current?.getBoundingClientRect();
        const hidePill = pill ? overlaps(pill, region) : false;

        // The picture must be clean: no pill, no old ink, no new ink yet.
        if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
        setFading(null);
        setInk([]);
        setInkVisible(false);
        setRect(region);
        setHolding(true);
        const method = current.captureImages ? frameSourceRef.current : null;
        const grabAppImage = current.grabAppImage ?? null;
        // Only a shared tab sees the pill and ink, so only then are they hidden.
        const fromTab = method === 'tab';
        if (hidePill && fromTab) setPillHidden(true);

        let frame: Promise<TabFrame | null> = Promise.resolve(null);
        if (fromTab) {
            frame = (async () => {
                await nextPaint();
                try {
                    return await grab(region);
                } finally {
                    setPillHidden(false);
                    setInkVisible(true);
                }
            })();
        } else if (method === 'app' && grabAppImage) {
            frame = grabAppFrame(grabAppImage, region);
        } else if (method === 'dom') {
            frame = grabDomFrame(region);
        }
        if (!fromTab) setInkVisible(true);
        // Failures are reported when the hold ends.
        frame.catch(() => {});
        holdRef.current = {
            startMs: now(),
            rect: region,
            strokes: [],
            current: null,
            frame,
        };
    }, [grab, now]);

    const refreshInk = useCallback(() => {
        const hold = holdRef.current;
        if (!hold) return;
        setInk(hold.current ? [...hold.strokes, hold.current] : hold.strokes);
    }, []);

    // The first movement of a hold starts the line; no click is needed.
    const onStrokePoint = useCallback(
        (point: Point) => {
            const hold = holdRef.current;
            if (!hold) return;
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

    const finish = useCallback(() => {
        if (stateRef.current.status !== 'recording') return;
        if (finishingRef.current) return;
        finishingRef.current = true;
        setFinishing(true);
        endHold();
        const durationMs = now();
        const recordingPromise = stopVoice();
        queueRef.current = queueRef.current.then(async () => {
            try {
                const marked = stateRef.current;
                if (marked.status !== 'recording') return;

                let phrases: TranscriptPhrase[] = [];
                const recording = await recordingPromise;
                const transcribe = surfaceRef.current?.transcribe ?? null;
                if (transcribe && voiceOnRef.current && !recording) {
                    showToastWarning(
                        'No audio was recorded from the microphone',
                    );
                }
                if (recording && transcribe) {
                    try {
                        const words = await transcribe(recording.audio);
                        if (words.length === 0) {
                            const kilobytes = Math.round(
                                recording.audio.size / 1024,
                            );
                            showToastWarning(
                                `No speech was heard in the recording (${recording.audio.type || 'unknown type'}, ${kilobytes} KB)`,
                            );
                        }
                        phrases = wordsToPhrases(words, {
                            offsetMs:
                                recording.startedAtMs - startedAtRef.current,
                            breakAtMs: marked.marks.map((mark) => mark.startMs),
                        });
                    } catch {
                        showToastWarning('Could not transcribe your voice');
                    }
                }

                // Cancelled while the audio was being transcribed.
                const final = stateRef.current;
                const current = surfaceRef.current;
                if (final.status !== 'recording') return;
                if (finishOutcome(final, phrases) === 'empty' || !current) {
                    showToastWarning('Nothing captured');
                    return;
                }
                const images = await Promise.all(
                    framesRef.current
                        .slice(0, final.imageCount)
                        .map((frame, index) =>
                            composeImage({
                                frame: frame.bitmap,
                                marks: final.marks.filter(
                                    (mark) => mark.imageIndex === index,
                                ),
                                index,
                            }),
                        ),
                );
                current.onCapture({
                    images,
                    summary: buildSummary({
                        durationMs,
                        imageCount: images.length,
                        marks: final.marks,
                        transcript: phrases,
                    }),
                    marks: final.marks,
                    transcript: phrases,
                    durationMs,
                });
            } catch {
                showToastError('Could not save the capture');
            } finally {
                if (stateRef.current.status === 'recording') clearSession();
                finishingRef.current = false;
                setFinishing(false);
            }
        });
    }, [
        clearSession,
        endHold,
        now,
        showToastError,
        showToastWarning,
        stopVoice,
    ]);
    finishRef.current = finish;

    const cancel = useCallback(() => {
        if (stateRef.current.status !== 'recording') return;
        void stopVoice();
        clearSession();
    }, [clearSession, stopVoice]);

    const isRecording = state.status === 'recording';

    // What the hotkey does: start a recording, or stop the one running.
    const toggle = useCallback(() => {
        if (stateRef.current.status === 'recording') finish();
        else start();
    }, [finish, start]);

    // No surface, no hotkey: the page keeps the key combination.
    useHotkeys(surface ? [['mod+shift+X', toggle]] : [], [], true);

    useEffect(() => {
        if (!isRecording) return undefined;
        pillRef.current?.focus({ preventScroll: true });

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                cancel();
                return;
            }
            if (event.key !== 'Shift' || event.repeat) return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (isEditable(event.target)) return;
            beginHold();
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key === 'Shift') endHold();
        };
        // A sealed iframe swallows keys once clicked, so take focus back.
        const onBlur = () => {
            endHold();
            window.setTimeout(() => {
                if (document.activeElement?.tagName !== 'IFRAME') return;
                window.focus();
                pillRef.current?.focus({ preventScroll: true });
            }, 0);
        };
        const refreshRect = () => {
            if (holdRef.current) return;
            const region = surfaceRef.current?.getRegion();
            if (region) setRect(region);
        };
        const rectTimer = window.setInterval(refreshRect, 500);

        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('blur', onBlur);
        window.addEventListener('resize', refreshRect);
        return () => {
            window.clearInterval(rectTimer);
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('keyup', onKeyUp, true);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('resize', refreshRect);
        };
    }, [beginHold, cancel, endHold, isRecording]);

    // The page stops offering capture mid-recording (preview closed).
    useEffect(() => {
        if (!surface && stateRef.current.status === 'recording') cancel();
    }, [cancel, surface]);

    const element =
        state.status === 'recording' && rect
            ? createPortal(
                  <>
                      <CapturePill
                          ref={pillRef}
                          startedAt={startedAt}
                          voice={listening || finishing ? 'on' : 'off'}
                          voiceOffReason={voiceOffReason}
                          finishing={finishing}
                          atImageLimit={state.atImageLimit}
                          hidden={pillHidden}
                          onStop={finish}
                          onCancel={cancel}
                      />
                      <InkOverlay
                          rect={rect}
                          holding={holding}
                          inkVisible={inkVisible}
                          strokes={ink}
                          fading={fading}
                          onStrokePoint={onStrokePoint}
                          onStrokeEnd={onStrokeEnd}
                      />
                  </>,
                  document.body,
              )
            : null;

    return { start, toggle, isRecording, element };
};
