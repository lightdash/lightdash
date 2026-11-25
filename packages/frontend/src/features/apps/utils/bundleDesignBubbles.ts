import { chipLabel } from '../../../ee/features/capture/chipLabel';

const CHIP_WORDS = 5;

/** What one Design Mode bubble adds to a bundled builder prompt. */
export type BundledBubble = {
    /** The marks and speech; empty when there are none. */
    summary: string;
    typed: string;
    /** The bubble's attached pictures, by file name, in order. */
    imageNames: string[];
};

/** The name a bubble's picture is attached under, so sections can point at it. */
export const bundleImageName = (bubble: number, image: number): string =>
    `bubble-${bubble}-image-${image}.png`;

/** One prompt from every bundled bubble: a numbered section each, in tray order. */
export const bundleDesignBubbles = (bubbles: BundledBubble[]): string =>
    bubbles
        .map((bubble, index) => {
            const heading = [
                `### Bubble ${index + 1}`,
                ...(bubble.imageNames.length > 0
                    ? [`Images: ${bubble.imageNames.join(', ')}`]
                    : []),
            ].join('\n');
            const body = [bubble.summary, bubble.typed.trim()]
                .filter((part) => part !== '')
                .join('\n\n');
            return body === '' ? heading : `${heading}\n${body}`;
        })
        .join('\n\n');

/** A tray chip: the bubble's place, its marks and its first words. */
export const bundleChipLabel = (
    bubble: number,
    markNumbers: number[],
    words: string,
): string => {
    const all = words.split(/\s+/).filter(Boolean);
    const first = all.slice(0, CHIP_WORDS).join(' ');
    return [
        `Bubble ${bubble}`,
        markNumbers.map(chipLabel).join(''),
        first === '' ? '' : `"${first}${all.length > CHIP_WORDS ? '…' : ''}"`,
    ]
        .filter((part) => part !== '')
        .join(' · ');
};
