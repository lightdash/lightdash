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
import { sameScreen } from './frameGeometry';
import {
    type CaptureSurface,
    type CaptureTarget,
    type Point,
    type Stroke,
} from './types';
import { useSpeechTranscript } from './useSpeechTranscript';
import { useTabFrame, type TabFrame, type TabFrameError } from './useTabFrame';

const FADE_MS = 600;
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
    frame: Promise<TabFrame>;
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
): { start: () => void; isRecording: boolean; element: ReactNode } => {
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

    const now = useCallback(() => performance.now() - startedAtRef.current, []);
    const {
        start: startSpeech,
        stop: stopSpeech,
        liveText,
    } = useSpeechTranscript({ now });
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
                const stream = await ensureStream();
                if (!stream.ok) {
                    showToastError(STREAM_ERROR_TITLES[stream.error]);
                    return;
                }
                const voice = await startSpeech();
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
    }, [dispatch, ensureStream, showToastError, startSpeech]);

    const endHold = useCallback(() => {
        const hold = holdRef.current;
        if (!hold) return;
        holdRef.current = null;
        if (hold.current) hold.strokes.push(hold.current);
        const endMs = now();
        setHolding(false);

        queueRef.current = queueRef.current.then(async () => {
            let frame: TabFrame;
            try {
                frame = await hold.frame;
            } catch {
                setInk([]);
                showToastError('Could not capture the screen');
                return;
            }
            const before = stateRef.current;
            if (before.status !== 'recording' || hold.strokes.length === 0) {
                frame.bitmap.close();
                setInk([]);
                return;
            }
            const previous = framesRef.current[before.imageCount - 1];
            const isNewScreen =
                !previous || !sameScreen(frame.thumb, previous.thumb);
            const drawing = dispatch({
                type: 'shiftDown',
                atMs: hold.startMs,
                isNewScreen,
            });
            if (drawing.status !== 'recording' || !drawing.drawing) {
                frame.bitmap.close();
                setInk([]);
                return;
            }
            if (drawing.drawing.imageIndex === before.imageCount) {
                framesRef.current[before.imageCount] = frame;
            } else {
                frame.bitmap.close();
            }
            hold.strokes.forEach((stroke) =>
                dispatch({ type: 'strokeAdded', stroke }),
            );

            const { box } = classifyMark(hold.strokes);
            const resolveTarget = surfaceRef.current?.resolveTarget ?? null;
            let target: CaptureTarget | null = null;
            if (resolveTarget) {
                target = await resolveTarget(
                    new DOMRect(
                        hold.rect.left + box.x * hold.rect.width,
                        hold.rect.top + box.y * hold.rect.height,
                        box.width * hold.rect.width,
                        box.height * hold.rect.height,
                    ),
                ).catch(() => null);
            }
            const done = dispatch({ type: 'shiftUp', atMs: endMs, target });
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
        if (!current || holdRef.current) return;
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
        if (hidePill) setPillHidden(true);

        const frame = (async () => {
            await nextPaint();
            try {
                return await grab(region);
            } finally {
                setPillHidden(false);
                setInkVisible(true);
            }
        })();
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
        endHold();
        const durationMs = now();
        const phrases = stopSpeech();
        queueRef.current = queueRef.current.then(async () => {
            const final = stateRef.current;
            if (final.status !== 'recording') return;
            const current = surfaceRef.current;
            if (finishOutcome(final, phrases) === 'empty' || !current) {
                showToastWarning('Nothing captured');
                clearSession();
                return;
            }
            try {
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
                clearSession();
            }
        });
    }, [
        clearSession,
        endHold,
        now,
        showToastError,
        showToastWarning,
        stopSpeech,
    ]);
    finishRef.current = finish;

    const cancel = useCallback(() => {
        if (stateRef.current.status !== 'recording') return;
        stopSpeech();
        clearSession();
    }, [clearSession, stopSpeech]);

    const isRecording = state.status === 'recording';

    // No surface, no hotkey: the page keeps the key combination.
    useHotkeys(
        surface
            ? [['mod+shift+X', () => (isRecording ? finish() : start())]]
            : [],
        [],
        true,
    );

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
                          voice={state.voice}
                          liveText={liveText}
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

    return { start, isRecording, element };
};
