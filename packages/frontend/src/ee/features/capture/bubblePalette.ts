/**
 * One colour per bubble, for its marks, chips and pill. Each takes white
 * numbers and shows on light and dark pages. The first is the agent's red.
 */
const BUBBLE_COLORS = [
    '#e03131', // red
    '#1971c2', // blue
    '#26803c', // green
    '#7048e8', // violet
    '#b85c00', // orange
    '#0b7285', // teal
] as const;

export const BUBBLE_COLOR_COUNT = BUBBLE_COLORS.length;

/** The CSS variable everything that belongs to a bubble is coloured by. */
export const BUBBLE_COLOR_VAR = '--bubble-color';

export const bubbleColor = (index: number): string =>
    BUBBLE_COLORS[index % BUBBLE_COLOR_COUNT];

/** The next colour after `last` that no bubble on the page has; all taken, the next one. */
export const nextBubbleColor = (
    last: number | null,
    inUse: number[],
): number => {
    const start = last === null ? 0 : (last + 1) % BUBBLE_COLOR_COUNT;
    for (let step = 0; step < BUBBLE_COLOR_COUNT; step += 1) {
        const color = (start + step) % BUBBLE_COLOR_COUNT;
        if (!inUse.includes(color)) return color;
    }
    return start;
};
