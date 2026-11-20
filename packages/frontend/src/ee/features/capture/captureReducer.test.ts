import { AI_THREAD_IMAGES_MAX_PER_PROMPT as CAP } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { captureReducer, type CaptureState } from './captureReducer';

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
    let s = captureReducer(state, {
        type: 'shiftDown',
        atMs,
        isNewScreen,
        tool: 'stylus',
    });
    s = captureReducer(s, { type: 'strokeAdded', stroke });
    return captureReducer(s, {
        type: 'shiftUp',
        atMs: atMs + 1000,
        target: null,
        arrowTo: null,
        trail: [],
        covers: [],
        tabName: null,
        box: null,
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
            tool: 'stylus',
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
            tabName: null,
            box: null,
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
            tool: 'stylus',
        });
        s = captureReducer(s, {
            type: 'shiftUp',
            atMs: 1100,
            target: null,
            arrowTo: null,
            trail: [],
            covers: [],
            tabName: null,
            box: null,
        });
        expect(s).toMatchObject({ marks: [], imageCount: 0, drawing: null });
    });

    it('a screen past the image cap is marked without a picture of its own', () => {
        const full = rec({ imageCount: CAP });
        const down = captureReducer(full, {
            type: 'shiftDown',
            atMs: 1,
            isNewScreen: true,
            tool: 'stylus',
        });
        expect(down).toMatchObject({
            drawing: { imageIndex: CAP },
            atImageLimit: true,
            imageCount: CAP,
        });
        const s = hold(full, 1000, true);
        expect(s).toMatchObject({
            imageCount: CAP,
            marks: [{ number: 1, imageIndex: CAP }],
        });
        // Back on the last pictured screen, marks join its image again.
        expect(hold(s, 3000, false)).toMatchObject({
            imageCount: CAP,
            atImageLimit: false,
            marks: [{ imageIndex: CAP }, { imageIndex: CAP - 1 }],
        });
    });

    it('still allows marks on the current screen at the limit', () => {
        expect(
            captureReducer(rec({ imageCount: CAP }), {
                type: 'shiftDown',
                atMs: 1,
                isNewScreen: false,
                tool: 'stylus',
            }),
        ).toMatchObject({
            drawing: { imageIndex: CAP - 1 },
            atImageLimit: false,
        });
    });

    it('a cursor pick becomes a mark with no strokes', () => {
        const T = { kind: 'tile', id: 't1', label: 'Revenue by month' };
        const box = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
        let s = captureReducer(rec(), {
            type: 'shiftDown',
            atMs: 1000,
            isNewScreen: true,
            tool: 'cursor',
        });
        s = captureReducer(s, {
            type: 'shiftUp',
            atMs: 1200,
            target: T,
            arrowTo: null,
            trail: [],
            covers: [],
            tabName: 'Marketing',
            box,
        });
        expect(s).toMatchObject({
            imageCount: 1,
            marks: [
                {
                    shape: 'pick',
                    tool: 'cursor',
                    strokes: [],
                    target: T,
                    box,
                    tabName: 'Marketing',
                },
            ],
        });
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
                tabName: null,
                box: null,
            }),
        ).toEqual(s);
    });

    it('reset returns to idle', () => {
        expect(captureReducer(rec(), { type: 'reset' })).toEqual({
            status: 'idle',
        });
    });
});
