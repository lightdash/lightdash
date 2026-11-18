import { assertUnreachable } from '@lightdash/common';
import { classifyMark } from './classifyStroke';
import {
    MAX_CAPTURE_IMAGES,
    type CaptureMark,
    type CaptureTarget,
    type Stroke,
    type TranscriptPhrase,
    type VoiceState,
} from './types';

export type CaptureState =
    | { status: 'idle' }
    | {
          status: 'recording';
          voice: VoiceState;
          marks: CaptureMark[];
          imageCount: number;
          drawing: {
              imageIndex: number;
              startMs: number;
              strokes: Stroke[];
          } | null;
          atImageLimit: boolean;
      };

export type CaptureAction =
    | { type: 'started'; voice: VoiceState }
    | { type: 'shiftDown'; atMs: number; isNewScreen: boolean }
    | { type: 'strokeAdded'; stroke: Stroke }
    | { type: 'shiftUp'; atMs: number; target: CaptureTarget | null }
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
            if (opensImage && state.imageCount >= MAX_CAPTURE_IMAGES) {
                return { ...state, atImageLimit: true };
            }
            return {
                ...state,
                atImageLimit: false,
                drawing: {
                    // An image only counts once a mark lands on it (see shiftUp).
                    imageIndex: opensImage
                        ? state.imageCount
                        : state.imageCount - 1,
                    startMs: action.atMs,
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
            if (drawing.strokes.length === 0) {
                return { ...state, drawing: null };
            }
            const mark: CaptureMark = {
                number: state.marks.length + 1,
                imageIndex: drawing.imageIndex,
                startMs: drawing.startMs,
                endMs: action.atMs,
                strokes: drawing.strokes,
                ...classifyMark(drawing.strokes),
                target: action.target,
            };
            return {
                ...state,
                drawing: null,
                marks: [...state.marks, mark],
                imageCount: Math.max(state.imageCount, drawing.imageIndex + 1),
            };
        }
        default:
            return assertUnreachable(action, 'Unknown capture action');
    }
};

export const finishOutcome = (
    state: CaptureState,
    transcript: TranscriptPhrase[],
): 'empty' | 'send' => {
    if (state.status !== 'recording') return 'empty';
    return state.marks.length === 0 && transcript.length === 0
        ? 'empty'
        : 'send';
};
