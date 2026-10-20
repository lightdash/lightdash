import {
    estimateTextWidth,
    TEXT_FONTS,
    type TextMeasurer,
    type TextRole,
} from './mapLayout';

// Fonts can render a little wider than they measure, so labels claim slightly more room
const SAFETY_SHARE = 1.04;
const SAFETY_PX = 2;

const getContext = (): CanvasRenderingContext2D | null => {
    try {
        return document.createElement('canvas').getContext('2d');
    } catch {
        return null;
    }
};

// Measures with the font the labels are drawn in, once per distinct line of text
export const createTextMeasurer = (fontFamily: string): TextMeasurer => {
    const context = getContext();
    if (context === null) return estimateTextWidth;
    const cache = new Map<string, number>();
    return (text: string, role: TextRole): number => {
        const key = `${role}:${text}`;
        const known = cache.get(key);
        if (known !== undefined) return known;
        const { size, weight } = TEXT_FONTS[role];
        context.font = `${weight} ${size}px ${fontFamily}`;
        const width =
            context.measureText(text).width * SAFETY_SHARE + SAFETY_PX;
        cache.set(key, width);
        return width;
    };
};
