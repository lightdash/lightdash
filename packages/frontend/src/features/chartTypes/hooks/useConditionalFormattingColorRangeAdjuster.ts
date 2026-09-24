import {
    isHexCodeColor,
    type ConditionalFormattingColorRange,
} from '@lightdash/common';
import { useComputedColorScheme } from '@mantine/core';
import { transformColorsForDarkMode } from '../../../utils/colorUtils';

const keepColorRange = (colorRange: ConditionalFormattingColorRange) =>
    colorRange;

// A non-hex range is passed through untouched; colouring skips it later.
const adjustForDarkMode = (colorRange: ConditionalFormattingColorRange) =>
    isHexCodeColor(colorRange.start) && isHexCodeColor(colorRange.end)
        ? transformColorsForDarkMode(colorRange)
        : colorRange;

/** Adjusts conditional formatting colour ranges for the colour scheme, like built-in tables. */
export const useConditionalFormattingColorRangeAdjuster = () =>
    useComputedColorScheme() === 'dark' ? adjustForDarkMode : keepColorRange;
