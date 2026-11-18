import { describe, expect, it } from 'vitest';
import {
    captureReducer,
    finishOutcome,
    type CaptureState,
} from './captureReducer';
import { type CaptureMark } from './types';

type Recording = Extract<CaptureState, { status: 'recording' }>;

const rec = (o: Partial<Recording> = {}): CaptureState => ({
    status: 'recording',
    voice: 'on',
    marks: [],
    imageCount: 0,
    drawing: null,
    atImageLimit: false,
    ...o,
});

const stroke = {
    points: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.5 },
    ],
};

const hold = (
    state: CaptureState,
    atMs: number,
    isNewScreen: boolean,
): CaptureState => {
    let s = captureReducer(state, { type: 'shiftDown', atMs, isNewScreen });
    s = captureReducer(s, { type: 'strokeAdded', stroke });
    return captureReducer(s, {
        type: 'shiftUp',
        atMs: atMs + 1000,
        target: null,
        arrowTo: null,
        trail: [],
        covers: [],
    });
};

describe('captureReducer', () => {
    it('starts with voice off when the mic is refused', () => {
        expect(
            captureReducer(
                { status: 'idle' },
                { type: 'started', voice: 'off' },
            ),
        ).toMatchObject({ status: 'recording', voice: 'off', marks: [] });
    });

    it('a Shift hold with a stroke becomes mark 1 on image 0', () => {
        expect(hold(rec(), 1000, true)).toMatchObject({
            imageCount: 1,
            drawing: null,
            marks: [
                {
                    number: 1,
                    imageIndex: 0,
                    startMs: 1000,
                    endMs: 2000,
                    shape: 'arrow',
                    target: null,
                    arrowTo: null,
                    trail: [],
                    covers: [],
                },
            ],
        });
    });

    it('a second hold on the same screen joins image 0; a new screen starts image 1', () => {
        let s = hold(rec(), 1000, true);
        s = hold(s, 3000, false);
        s = hold(s, 6000, true);
        expect(s).toMatchObject({
            imageCount: 2,
            marks: [
                { number: 1, imageIndex: 0 },
                { number: 2, imageIndex: 0 },
                { number: 3, imageIndex: 1 },
            ],
        });
    });

    it('the first hold starts image 0 even when not flagged as a new screen', () => {
        expect(hold(rec(), 1000, false)).toMatchObject({
            imageCount: 1,
            marks: [{ imageIndex: 0 }],
        });
    });

    it('keeps the target the surface resolved for a mark', () => {
        let s = captureReducer(rec(), {
            type: 'shiftDown',
            atMs: 0,
            isNewScreen: true,
        });
        s = captureReducer(s, { type: 'strokeAdded', stroke });
        s = captureReducer(s, {
            type: 'shiftUp',
            atMs: 500,
            target: { kind: 'tile', id: 'abc', label: 'Revenue tile' },
            arrowTo: { kind: 'tile', id: 'def', label: 'Orders tile' },
            covers: [],
            trail: [
                { kind: 'tile', id: 'abc', label: 'Revenue tile' },
                { kind: 'tile', id: 'def', label: 'Orders tile' },
            ],
        });
        expect(s).toMatchObject({
            marks: [
                {
                    target: { kind: 'tile', id: 'abc' },
                    arrowTo: { kind: 'tile', id: 'def' },
                    trail: [{ id: 'abc' }, { id: 'def' }],
                },
            ],
        });
    });

    it('a Shift tap with no stroke leaves no mark and no image', () => {
        let s = captureReducer(rec(), {
            type: 'shiftDown',
            atMs: 1000,
            isNewScreen: true,
        });
        s = captureReducer(s, {
            type: 'shiftUp',
            atMs: 1100,
            target: null,
            arrowTo: null,
            trail: [],
            covers: [],
        });
        expect(s).toMatchObject({ marks: [], imageCount: 0, drawing: null });
    });

    it('refuses a tenth screen', () => {
        expect(
            captureReducer(rec({ imageCount: 5 }), {
                type: 'shiftDown',
                atMs: 1,
                isNewScreen: true,
            }),
        ).toMatchObject({ drawing: null, atImageLimit: true, imageCount: 5 });
    });

    it('still allows marks on the current screen at the limit', () => {
        expect(
            captureReducer(rec({ imageCount: 5 }), {
                type: 'shiftDown',
                atMs: 1,
                isNewScreen: false,
            }),
        ).toMatchObject({ drawing: { imageIndex: 8 }, atImageLimit: false });
    });

    it('ignores strokes and Shift-up when not drawing', () => {
        const s = rec();
        expect(captureReducer(s, { type: 'strokeAdded', stroke })).toEqual(s);
        expect(
            captureReducer(s, {
                type: 'shiftUp',
                atMs: 5,
                target: null,
                arrowTo: null,
                trail: [],
                covers: [],
            }),
        ).toEqual(s);
    });

    it('reset returns to idle', () => {
        expect(captureReducer(rec(), { type: 'reset' })).toEqual({
            status: 'idle',
        });
    });
});

describe('finishOutcome', () => {
    it('nothing drawn and nothing said is empty', () => {
        expect(finishOutcome(rec(), [])).toBe('empty');
    });

    it('speech alone is sent', () => {
        expect(finishOutcome(rec(), [{ atMs: 0, text: 'hi' }])).toBe('send');
    });

    it('marks are sent when the stream ends mid-recording with no speech', () => {
        const s = rec({ marks: [{ number: 1 } as CaptureMark], imageCount: 1 });
        expect(finishOutcome(s, [])).toBe('send');
    });

    it('idle is empty', () => {
        expect(finishOutcome({ status: 'idle' }, [])).toBe('empty');
    });
});
