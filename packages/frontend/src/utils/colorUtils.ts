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

const getColorRange = (
    colorConfig: ConditionalFormattingColorRange,
): string[] | undefined => {
    if (
        !isHexCodeColor(colorConfig.start) ||
        !isHexCodeColor(colorConfig.end)
    ) {
        return undefined;
    }

    const colors = Color.steps(
        new Color(colorConfig.start),
        new Color(colorConfig.end),
        {
            steps: colorConfig.steps,
            space: 'srgb',
        },
    );

    return colors.map((c) => new Color(c).toString({ format: 'hex' }));
};

export const getColorFromRange = (
    value: number,
    colorRange: ConditionalFormattingColorRange,
    minMaxRange: ConditionalFormattingMinMax,
): string | undefined => {
    const colors = getColorRange(colorRange);
    if (!colors) return undefined;

    const min = minMaxRange.min;
    const inclusiveMax = minMaxRange.max + 1;

    const step = (inclusiveMax - min) / colorRange.steps;
    const index = Math.floor((value - min) / step);

    return colors[index];
};
