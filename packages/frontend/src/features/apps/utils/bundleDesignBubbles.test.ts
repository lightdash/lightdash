import { describe, expect, it } from 'vitest';
import { bundleChipLabel, bundleDesignBubbles } from './bundleDesignBubbles';

describe('bundleDesignBubbles', () => {
    it('one section per bubble, in tray order', () => {
        expect(
            bundleDesignBubbles([
                {
                    summary: '- ① circled, top left',
                    typed: 'make this bigger',
                    imageNames: ['bubble-1-image-1.png'],
                },
                { summary: '', typed: 'use a darker blue', imageNames: [] },
                {
                    summary: '- ① picked "Revenue"',
                    typed: '',
                    imageNames: [
                        'bubble-3-image-1.png',
                        'bubble-3-image-2.png',
                    ],
                },
            ]),
        ).toBe(
            [
                '### Bubble 1',
                'Images: bubble-1-image-1.png',
                '- ① circled, top left',
                '',
                'make this bigger',
                '',
                '### Bubble 2',
                'use a darker blue',
                '',
                '### Bubble 3',
                'Images: bubble-3-image-1.png, bubble-3-image-2.png',
                '- ① picked "Revenue"',
            ].join('\n'),
        );
    });

    it('no bubbles make an empty prompt', () => {
        expect(bundleDesignBubbles([])).toBe('');
    });
});

describe('bundleChipLabel', () => {
    it('names the bubble, its marks and its first words', () => {
        expect(
            bundleChipLabel(2, [1, 2], 'make this  chart a lot bigger please'),
        ).toBe('Bubble 2 · ①② · "make this chart a lot…"');
    });

    it('leaves out what a bubble does not have', () => {
        expect(bundleChipLabel(1, [], 'darker')).toBe('Bubble 1 · "darker"');
        expect(bundleChipLabel(3, [1], '')).toBe('Bubble 3 · ①');
    });
});
