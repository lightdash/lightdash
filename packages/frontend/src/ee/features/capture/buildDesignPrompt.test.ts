import { describe, expect, it } from 'vitest';
import { buildDesignPrompt } from './buildDesignPrompt';
import { buildSummary } from './buildSummary';
import { type CaptureMark } from './types';

const mark: CaptureMark = {
    number: 1,
    imageIndex: 0,
    startMs: 1000,
    endMs: 2000,
    strokes: [],
    shape: 'circle',
    tool: 'stylus',
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
        expect(prompt).toBe(`${HEADING}\n\n${markLine}\n\nmake it a bar chart`);
        expect(markLine).toContain('"why is this so high"');
    });

    it('with images, keeps the lines about the attached image', () => {
        const prompt = buildDesignPrompt({
            surfaceHeading: HEADING,
            summary,
            typed: 'make it a bar chart',
            hasImages: true,
        });
        expect(prompt).toBe(`${HEADING}\n\n${summary}\n\nmake it a bar chart`);
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
        expect(prompt).toBe(`${HEADING}\n\n${markLine}`);
    });

    it('typed words alone go under the heading', () => {
        expect(
            buildDesignPrompt({
                surfaceHeading: HEADING,
                summary: '',
                typed: '  make it blue ',
                hasImages: false,
            }),
        ).toBe(`${HEADING}\n\nmake it blue`);
    });
});
