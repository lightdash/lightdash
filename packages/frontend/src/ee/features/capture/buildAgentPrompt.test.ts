import { describe, expect, it } from 'vitest';
import { buildAgentPrompt } from './buildAgentPrompt';

const summary = [
    '[Inline capture, 0:12. The 2 attached images show the page with numbered red marks, in order.]',
    'Image 1:',
    '- ① circle on "Revenue": "why is this so high"',
    'Image 2:',
    '- ② underline on "Orders": "add a filter for status"',
    'Trust the images over the descriptions.',
].join('\n');

describe('buildAgentPrompt', () => {
    it('puts the heading above the summary, as said', () => {
        expect(
            buildAgentPrompt({
                heading: 'These requests are about the dashboard "Sales".',
                summary,
                hasImages: true,
            }),
        ).toBe(`These requests are about the dashboard "Sales".\n\n${summary}`);
    });

    it('keeps only the mark and speech lines when no screenshots went', () => {
        expect(
            buildAgentPrompt({ heading: 'H.', summary, hasImages: false }),
        ).toBe(
            'H.\n\n- ① circle on "Revenue": "why is this so high"\n- ② underline on "Orders": "add a filter for status"',
        );
    });

    it('adds what the page has already done before the summary', () => {
        expect(
            buildAgentPrompt({
                heading: 'H.',
                alreadyDone: 'swapped "Revenue" and "Orders"',
                summary,
                hasImages: true,
            }),
        ).toBe(
            `H.\n\nThe page has already made these layout changes as an unsaved preview, so do not change the layout for them: swapped "Revenue" and "Orders".\n\n${summary}`,
        );
    });
});
