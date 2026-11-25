import {
    AI_THREAD_IMAGES_MAX_PER_PROMPT,
    assertUnreachable,
} from '@lightdash/common';
import { classifyMark } from './classifyStroke';
import {
    type CaptureCover,
    type CaptureMark,
    type CaptureTarget,
    type MarkKind,
    type Box,
    type Stroke,
    type VoiceState,
} from './types';

export type CaptureState =
    | { status: 'idle' }
    | {
          status: 'recording';
          voice: VoiceState;
          /** A mark whose imageIndex is the image cap has no picture; it is told in words. */
          marks: CaptureMark[];
          /** Screens pictured so far, never more than the image cap. */
          imageCount: number;
          drawing: {
              imageIndex: number;
              startMs: number;
              kind: MarkKind;
              strokes: Stroke[];
          } | null;
          atImageLimit: boolean;
      };

export type ShiftUpAction = {
    type: 'shiftUp';
    atMs: number;
    target: CaptureTarget | null;
    arrowTo: CaptureTarget | null;
    trail: CaptureTarget[];
    covers: CaptureCover[];
    tabName: string | null;
    /** The picked element's bounds; used for picks, null for ink. */
    box: Box | null;
};

export type CaptureAction =
    | { type: 'started'; voice: VoiceState }
    | {
          type: 'shiftDown';
          atMs: number;
          isNewScreen: boolean;
          kind: MarkKind;
      }
    | { type: 'strokeAdded'; stroke: Stroke }
    | ShiftUpAction
    | { type: 'reset' };

export const captureReducer = (
    state: CaptureState,
    action: CaptureAction,
): CaptureState => {
    switch (action.type) {
        case 'started':
            return {
                status: 'recording',
                voice: action.voice,
                marks: [],
                imageCount: 0,
                drawing: null,
                atImageLimit: false,
            };
        case 'reset':
            return { status: 'idle' };
        case 'shiftDown': {
            if (state.status !== 'recording' || state.drawing) return state;
            const opensImage = action.isNewScreen || state.imageCount === 0;
            // Past the cap a new screen gets no picture, but its mark is kept.
            const atImageLimit =
                opensImage &&
                state.imageCount >= AI_THREAD_IMAGES_MAX_PER_PROMPT;
            return {
                ...state,
                atImageLimit,
                drawing: {
                    // An image only counts once a mark lands on it (see shiftUp).
                    imageIndex: opensImage
                        ? Math.min(
                              state.imageCount,
                              AI_THREAD_IMAGES_MAX_PER_PROMPT,
                          )
                        : state.imageCount - 1,
                    startMs: action.atMs,
                    kind: action.kind,
                    strokes: [],
                },
            };
        }
        case 'strokeAdded':
            if (state.status !== 'recording' || !state.drawing) return state;
            return {
                ...state,
                drawing: {
                    ...state.drawing,
                    strokes: [...state.drawing.strokes, action.stroke],
                },
            };
        case 'shiftUp': {
            if (state.status !== 'recording' || !state.drawing) return state;
            const { drawing } = state;
            const isPick = drawing.kind === 'pick';
            if (!isPick && drawing.strokes.length === 0) {
                return { ...state, drawing: null };
            }
            if (isPick && !action.box) {
                return { ...state, drawing: null };
            }
            const shape =
                isPick && action.box
                    ? { shape: 'pick' as const, box: action.box, arrow: null }
                    : classifyMark(drawing.strokes);
            const mark: CaptureMark = {
                number: state.marks.length + 1,
                imageIndex: drawing.imageIndex,
                startMs: drawing.startMs,
                endMs: action.atMs,
                strokes: isPick ? [] : drawing.strokes,
                ...shape,
                tabName: action.tabName,
                target: action.target,
                arrowTo: action.arrowTo,
                trail: action.trail,
                covers: action.covers,
            };
            return {
                ...state,
                drawing: null,
                marks: [...state.marks, mark],
                imageCount: Math.min(
                    AI_THREAD_IMAGES_MAX_PER_PROMPT,
                    Math.max(state.imageCount, drawing.imageIndex + 1),
                ),
            };
        }
        default:
            return assertUnreachable(action, 'Unknown capture action');
    }
};
