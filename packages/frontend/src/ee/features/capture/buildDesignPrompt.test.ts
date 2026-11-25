import { describe, expect, it } from 'vitest';
import {
    buildDesignPrompt,
    readDesignPrompt,
    TYPED_WORDS_MARK,
} from './buildDesignPrompt';
import { buildSummary } from './buildSummary';
import { type CaptureMark } from './types';

const mark: CaptureMark = {
    number: 1,
    imageIndex: 0,
    startMs: 1000,
    endMs: 2000,
    strokes: [],
    shape: 'circle',
    tabName: null,
    box: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
    arrow: null,
    target: { kind: 'tile', id: 'tile-1', label: 'Revenue', parentId: null },
    arrowTo: null,
    trail: [],
    covers: [],
};

const summary = buildSummary({
    durationMs: 12_000,
    imageCount: 1,
    marks: [mark],
    transcript: [{ atMs: 1500, text: 'why is this so high' }],
});
const markLine = summary.split('\n').find((line) => line.startsWith('- '))!;

const HEADING = 'These requests are about the dashboard "Sales".';

describe('buildDesignPrompt', () => {
    it('typed words follow the marks', () => {
        const prompt = buildDesignPrompt({
            surfaceHeading: HEADING,
            summary,
            typed: 'make it a bar chart',
            hasImages: false,
        });
        expect(prompt).toBe(
            `${HEADING}\n\n${markLine}\n\n${TYPED_WORDS_MARK}make it a bar chart`,
        );
        expect(markLine).toContain('"why is this so high"');
    });

    it('with images, keeps the lines about the attached image', () => {
        const prompt = buildDesignPrompt({
            surfaceHeading: HEADING,
            summary,
            typed: 'make it a bar chart',
            hasImages: true,
        });
        expect(prompt).toBe(
            `${HEADING}\n\n${summary}\n\n${TYPED_WORDS_MARK}make it a bar chart`,
        );
        expect(prompt).toContain(
            'The attached image shows the page with numbered red marks.',
        );
        expect(prompt).toContain('Trust the image where they disagree.');
    });

    it('without images, drops every line that refers to one', () => {
        const prompt = buildDesignPrompt({
            surfaceHeading: HEADING,
            summary,
            typed: '',
            hasImages: false,
        });
        expect(prompt).toBe(`${HEADING}\n\n${markLine}\n\n${TYPED_WORDS_MARK}`);
    });

    it('typed words alone go under the heading', () => {
        expect(
            buildDesignPrompt({
                surfaceHeading: HEADING,
                summary: '',
                typed: '  make it blue ',
                hasImages: false,
            }),
        ).toBe(`${HEADING}\n\n${TYPED_WORDS_MARK}make it blue`);
    });
});

describe('readDesignPrompt', () => {
    const pick: CaptureMark = {
        ...mark,
        number: 2,
        startMs: 4000,
        endMs: 4100,
        shape: 'pick',
        target: {
            kind: 'bar',
            id: 'bar-1',
            label: 'the bar "credit_card" on "Revenue: by method"',
            parentId: 'tile-1',
        },
    };
    const both = buildSummary({
        durationMs: 12_000,
        imageCount: 1,
        marks: [mark, pick],
        transcript: [
            { atMs: 1500, text: 'why is this so high' },
            { atMs: 9000, text: 'and tidy it up' },
        ],
    });

    it('gives back the marks, the spoken words and the typed words', () => {
        [true, false].forEach((hasImages) => {
            const prompt = buildDesignPrompt({
                surfaceHeading: HEADING,
                summary: both,
                typed: 'make it a bar chart\n\nand orange',
                hasImages,
            });
            expect(readDesignPrompt(prompt)).toEqual({
                marks: [1, 2],
                said: ['why is this so high', 'and tidy it up'],
                typed: 'make it a bar chart\n\nand orange',
            });
        });
    });

    it('reads a reply, which has no heading', () => {
        const prompt = buildDesignPrompt({
            surfaceHeading: '',
            summary: both,
            typed: '',
            hasImages: true,
        });
        expect(readDesignPrompt(prompt)).toEqual({
            marks: [1, 2],
            said: ['why is this so high', 'and tidy it up'],
            typed: '',
        });
    });

    it('reads typed words sent with no marks', () => {
        const prompt = buildDesignPrompt({
            surfaceHeading: HEADING,
            summary: '',
            typed: 'make it blue',
            hasImages: false,
        });
        expect(readDesignPrompt(prompt)).toEqual({
            marks: [],
            said: [],
            typed: 'make it blue',
        });
    });

    it('reads mark numbers past the circled digits', () => {
        const many = buildSummary({
            durationMs: 1000,
            imageCount: 1,
            marks: [{ ...mark, number: 21 }],
            transcript: [],
        });
        const prompt = buildDesignPrompt({
            surfaceHeading: HEADING,
            summary: many,
            typed: 'x',
            hasImages: true,
        });
        expect(readDesignPrompt(prompt)?.marks).toEqual([21]);
    });

    it('is null for a message that did not come from a bubble', () => {
        expect(readDesignPrompt('Make this chart a bar chart')).toBeNull();
    });
});
