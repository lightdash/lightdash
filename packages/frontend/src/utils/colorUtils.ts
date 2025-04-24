import {
    isHexCodeColor,
    type ConditionalFormattingColorRange,
    type ConditionalFormattingMinMax,
} from '@lightdash/common';
import Color from 'colorjs.io';

export const readableColor = (backgroundColor: string) => {
    if (!isHexCodeColor(backgroundColor)) {
        return 'black';
    }
    const onWhite = Math.abs(Color.contrastAPCA('white', backgroundColor));
    const onBlack = Math.abs(Color.contrastAPCA('black', backgroundColor));
    return onWhite > onBlack ? 'white' : 'black';
};

const getColorRange = (colorConfig: ConditionalFormattingColorRange) => {
    if (
        !isHexCodeColor(colorConfig.start) ||
        !isHexCodeColor(colorConfig.end)
    ) {
        return undefined;
    }

    return Color.range(
        new Color(colorConfig.start),
        new Color(colorConfig.end),
        {
            space: 'srgb',
        },
    );
};

export const getColorFromRange = (
    value: number,
    colorRange: ConditionalFormattingColorRange,
    minMaxRange: ConditionalFormattingMinMax,
): string | undefined => {
    const interpolateColor = getColorRange(colorRange);

    if (!interpolateColor) return undefined;

    const min = minMaxRange.min;
    const max = minMaxRange.max;

    if (min > max || value < min || value > max) {
        console.error(
            new Error(
                `invalid minMaxRange: [${min},${max}] or value: ${value}`,
            ),
        );
        return undefined;
    }

    if (min === max) {
        return interpolateColor(1).toString({ format: 'hex' });
    }

    const percentage = (value - min) / (max - min);

    return interpolateColor(percentage).toString({ format: 'hex' });
};
