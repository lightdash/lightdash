import { describe, expect, it } from 'vitest';
import {
    frameLogLine,
    pageRectForRegion,
    resolveFrameSource,
} from './frameSource';

describe('resolveFrameSource', () => {
    it('uses tab capture when nothing is set', () => {
        expect(resolveFrameSource({ search: '', stored: null })).toBe('tab');
    });

    it('uses the DOM when the URL asks for it', () => {
        expect(
            resolveFrameSource({
                search: '?foo=1&inlineCapture=dom',
                stored: null,
            }),
        ).toBe('dom');
    });

    it('uses the DOM when localStorage asks for it', () => {
        expect(resolveFrameSource({ search: '?foo=1', stored: 'dom' })).toBe(
            'dom',
        );
    });

    it('lets the URL turn the stored choice off', () => {
        expect(
            resolveFrameSource({ search: '?inlineCapture=tab', stored: 'dom' }),
        ).toBe('tab');
    });

    it('treats unknown values as tab capture', () => {
        expect(
            resolveFrameSource({ search: '?inlineCapture=DOM', stored: 'x' }),
        ).toBe('tab');
    });
});

describe('pageRectForRegion', () => {
    const viewport = { width: 1440, height: 810 };

    it('adds the page scroll to a full-viewport region', () => {
        expect(
            pageRectForRegion(
                { x: 0, y: 0, width: 1440, height: 810 },
                viewport,
                { x: 0, y: 300 },
            ),
        ).toEqual({ x: 0, y: 300, width: 1440, height: 810 });
    });

    it('clips a region that runs off screen', () => {
        expect(
            pageRectForRegion(
                { x: -20, y: 700, width: 500, height: 400 },
                viewport,
                { x: 10, y: 0 },
            ),
        ).toEqual({ x: 10, y: 700, width: 480, height: 110 });
    });

    it('is empty when the region is wholly off screen', () => {
        const rect = pageRectForRegion(
            { x: 0, y: 900, width: 100, height: 100 },
            viewport,
            { x: 0, y: 0 },
        );
        expect(rect.height).toBe(0);
    });
});

describe('frameLogLine', () => {
    it('names the method, time and size', () => {
        expect(frameLogLine('dom', 412.6, { width: 2880, height: 1620 })).toBe(
            '[inline-capture] method=dom ms=413 size=2880x1620',
        );
    });

    it('says when the frame failed', () => {
        expect(frameLogLine('tab', 80, null)).toBe(
            '[inline-capture] method=tab ms=80 failed',
        );
    });
});
