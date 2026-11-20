import { describe, expect, it } from 'vitest';
import { buildSummary, describePosition, formatClock } from './buildSummary';
import { type CaptureMark } from './types';

const LAST_LINE =
    'Speech is machine-transcribed and may mishear names. Trust the image where they disagree.';

const mark = (
    o: Partial<CaptureMark> & Pick<CaptureMark, 'number' | 'startMs' | 'endMs'>,
): CaptureMark => ({
    imageIndex: 0,
    strokes: [],
    shape: 'circle',
    tool: 'stylus',
    tabName: null,
    box: { x: 0.7, y: 0.05, width: 0.2, height: 0.2 },
    arrow: null,
    target: null,
    arrowTo: null,
    trail: [],
    covers: [],
    ...o,
});

describe('formatClock', () => {
    it('formats minutes and padded seconds', () => {
        expect(formatClock(14000)).toBe('0:14');
        expect(formatClock(75000)).toBe('1:15');
        expect(formatClock(500)).toBe('0:00');
        expect(formatClock(-1200)).toBe('0:00');
    });
});

describe('describePosition', () => {
    it('names cells of a 3x3 grid', () => {
        expect(describePosition({ x: 0.9, y: 0.1 })).toBe('top right');
        expect(describePosition({ x: 0.5, y: 0.5 })).toBe('middle');
        expect(describePosition({ x: 0.5, y: 0.1 })).toBe('top centre');
        expect(describePosition({ x: 0.1, y: 0.5 })).toBe('middle left');
        expect(describePosition({ x: 0.1, y: 0.9 })).toBe('bottom left');
    });
});

describe('buildSummary', () => {
    it('formats the two-image example from the spec', () => {
        const out = buildSummary({
            durationMs: 19000,
            imageCount: 2,
            marks: [
                mark({ number: 1, startMs: 2000, endMs: 3500 }),
                mark({
                    number: 2,
                    startMs: 6000,
                    endMs: 7500,
                    shape: 'arrow',
                    arrow: {
                        from: { x: 0.8, y: 0.1 },
                        to: { x: 0.1, y: 0.9 },
                    },
                }),
                mark({
                    number: 3,
                    imageIndex: 1,
                    startMs: 13000,
                    endMs: 14000,
                    shape: 'underline',
                    box: { x: 0.4, y: 0.45, width: 0.2, height: 0.02 },
                }),
            ],
            transcript: [
                { atMs: 2500, text: 'this chart should be a line chart' },
                { atMs: 6200, text: 'and move it down here' },
                { atMs: 13200, text: 'this total looks wrong' },
                { atMs: 17000, text: 'also make the title bigger' },
            ],
        });
        expect(out).toBe(
            [
                '[Voice Design capture, 0:19. The 2 attached images show the page with numbered red marks, in order.]',
                'Image 1:',
                '- ① (0:02) circled, top right: "this chart should be a line chart"',
                '- ② (0:06) arrow from top right to bottom left: "and move it down here"',
                'Image 2 (after scrolling or clicking):',
                '- ③ (0:13) underlined, middle: "this total looks wrong"',
                '- (0:17) "also make the title bigger"',
                LAST_LINE,
            ].join('\n'),
        );
    });

    it('omits image headers for one image and the quote for a silent mark', () => {
        const out = buildSummary({
            durationMs: 5000,
            imageCount: 1,
            marks: [mark({ number: 1, startMs: 1000, endMs: 2000 })],
            transcript: [],
        });
        expect(out.split('\n')).toEqual([
            '[Voice Design capture, 0:05. The attached image shows the page with numbered red marks.]',
            '- ① (0:01) circled, top right',
            LAST_LINE,
        ]);
    });

    it('handles speech with no marks', () => {
        const out = buildSummary({
            durationMs: 4000,
            imageCount: 0,
            marks: [],
            transcript: [{ atMs: 500, text: 'make it blue' }],
        });
        expect(out.split('\n')).toEqual([
            '[Voice Design capture, 0:04. No marks were drawn.]',
            '- (0:00) "make it blue"',
            LAST_LINE,
        ]);
    });

    it('names the target when present', () => {
        const out = buildSummary({
            durationMs: 3000,
            imageCount: 1,
            transcript: [],
            marks: [
                mark({
                    number: 1,
                    startMs: 0,
                    endMs: 500,
                    target: { kind: 'tile', id: 'abc', label: 'Revenue tile' },
                }),
            ],
        });
        expect(out).toContain('- ① (0:00) circled, top right on Revenue tile');
    });

    it('joins two phrases on one mark and speech just before it', () => {
        const out = buildSummary({
            durationMs: 6000,
            imageCount: 1,
            marks: [mark({ number: 1, startMs: 2000, endMs: 3000 })],
            transcript: [
                { atMs: 1000, text: 'so' },
                { atMs: 2100, text: 'this one' },
                { atMs: 4500, text: 'is wrong' },
            ],
        });
        expect(out).toContain(
            '- ① (0:02) circled, top right: "so this one is wrong"',
        );
    });

    it('puts speech before the first mark ahead of the first image header', () => {
        const out = buildSummary({
            durationMs: 20000,
            imageCount: 2,
            marks: [
                mark({ number: 1, startMs: 8000, endMs: 9000 }),
                mark({
                    number: 2,
                    imageIndex: 1,
                    startMs: 15000,
                    endMs: 16000,
                }),
            ],
            transcript: [{ atMs: 1000, text: 'a few things' }],
        });
        expect(out.split('\n').slice(1, 4)).toEqual([
            '- (0:01) "a few things"',
            'Image 1:',
            '- ① (0:08) circled, top right',
        ]);
    });

    it('uses plain numbers above twenty', () => {
        const out = buildSummary({
            durationMs: 1000,
            imageCount: 1,
            transcript: [],
            marks: [mark({ number: 21, startMs: 0, endMs: 100 })],
        });
        expect(out).toContain('- (21) (0:00) circled, top right');
    });

    it('names both ends of an arrow when the surface knows them', () => {
        const out = buildSummary({
            durationMs: 3000,
            imageCount: 1,
            transcript: [],
            marks: [
                mark({
                    number: 1,
                    startMs: 0,
                    endMs: 500,
                    shape: 'arrow',
                    arrow: { from: { x: 0.1, y: 0.9 }, to: { x: 0.9, y: 0.1 } },
                    target: { kind: 'tile', id: 'a', label: 'Top customers' },
                    arrowTo: { kind: 'tile', id: 'b', label: 'Revenue' },
                }),
            ],
        });
        expect(out).toContain('- ① (0:00) arrow from Top customers to Revenue');
    });

    it('names the tab only when marks span tabs', () => {
        const pick = (number: number, tabName: string, label: string) =>
            mark({
                number,
                startMs: number * 4000,
                endMs: number * 4000 + 200,
                shape: 'pick',
                tool: 'cursor',
                tabName,
                target: { kind: 'tile', id: label, label },
            });
        const span = buildSummary({
            durationMs: 9000,
            imageCount: 1,
            marks: [
                pick(1, 'Sales', 'Pipeline'),
                pick(2, 'Marketing', 'Revenue by month'),
            ],
            transcript: [],
        });
        expect(span).toContain(
            '- \u2460 (0:04) picked "Pipeline", on tab "Sales"',
        );
        expect(span).toContain(
            '- \u2461 (0:08) picked "Revenue by month", on tab "Marketing"',
        );
        const same = buildSummary({
            durationMs: 9000,
            imageCount: 1,
            marks: [
                pick(1, 'Sales', 'Pipeline'),
                pick(2, 'Sales', 'Revenue by month'),
            ],
            transcript: [],
        });
        expect(same).not.toContain('on tab');
    });
});
