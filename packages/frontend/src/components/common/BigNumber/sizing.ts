import { ComparisonDiffTypes } from '@lightdash/common';
import clamp from 'lodash/clamp';
import { DEFAULT_ROW_HEIGHT } from '../../../features/dashboardTabs/gridUtils';
import styles from './BigNumberDisplay.module.css';

const BOX_MIN_WIDTH = 150;
const BOX_MAX_WIDTH = 1000;

const BOX_MIN_HEIGHT = DEFAULT_ROW_HEIGHT;
const BOX_MAX_HEIGHT = 1000;

export const VALUE_SIZE_MIN = 22;
const VALUE_SIZE_MAX = 128;

const LABEL_SIZE_MIN = 12;
const LABEL_SIZE_MAX = 48;

const COMPARISON_VALUE_SIZE_MIN = 12;
const COMPARISON_VALUE_SIZE_MAX = 22;

const COMPARISON_PILL_SIZE_MIN = 10;
const COMPARISON_PILL_SIZE_MAX = 16;

/** Labels get two lines once the tile is tall enough to fit them. */
const TWO_LINE_LABEL_MIN_HEIGHT = 120;

/** Below this height the comparison label is dropped to keep the value legible. */
export const COMPARISON_LABEL_MIN_HEIGHT = 70;

const calculateFontSize = (
    fontSizeMin: number,
    fontSizeMax: number,
    boundWidth: number,
    boundHeight: number,
) => {
    const widthScale =
        (boundWidth - BOX_MIN_WIDTH) / (BOX_MAX_WIDTH - BOX_MIN_WIDTH);
    const heightScale =
        (boundHeight - BOX_MIN_HEIGHT) / (BOX_MAX_HEIGHT - BOX_MIN_HEIGHT);

    const scalingFactor = Math.min(widthScale, heightScale);

    return Math.floor(
        fontSizeMin + (fontSizeMax - fontSizeMin) * scalingFactor,
    );
};

export type BigNumberFontSizes = {
    valueFontSize: number;
    labelFontSize: number;
    comparisonFontSize: number;
    comparisonPillFontSize: number;
    spacingMultiplier: number;
    availableHeight: number;
    labelLineClamp: number;
};

export const calculateBigNumberFontSizes = (
    elementSize: { width: number; height: number } | undefined,
): BigNumberFontSizes => {
    const boundWidth = clamp(
        elementSize?.width || 0,
        BOX_MIN_WIDTH,
        BOX_MAX_WIDTH,
    );
    const availableHeight = elementSize?.height ?? 0;
    const boundHeight = clamp(availableHeight, BOX_MIN_HEIGHT, BOX_MAX_HEIGHT);
    const heightScale =
        (boundHeight - BOX_MIN_HEIGHT) / (BOX_MAX_HEIGHT - BOX_MIN_HEIGHT);

    return {
        valueFontSize: calculateFontSize(
            VALUE_SIZE_MIN,
            VALUE_SIZE_MAX,
            boundWidth,
            boundHeight,
        ),
        labelFontSize: calculateFontSize(
            LABEL_SIZE_MIN,
            LABEL_SIZE_MAX,
            boundWidth,
            boundHeight,
        ),
        comparisonFontSize: calculateFontSize(
            COMPARISON_VALUE_SIZE_MIN,
            COMPARISON_VALUE_SIZE_MAX,
            boundWidth,
            boundHeight,
        ),
        comparisonPillFontSize: Math.floor(
            COMPARISON_PILL_SIZE_MIN +
                (COMPARISON_PILL_SIZE_MAX - COMPARISON_PILL_SIZE_MIN) *
                    clamp(heightScale, 0, 1),
        ),
        spacingMultiplier: Math.max(0.5, heightScale),
        availableHeight,
        labelLineClamp: availableHeight < TWO_LINE_LABEL_MIN_HEIGHT ? 1 : 2,
    };
};

export const getTrendPillClass = (
    comparisonDiff: ComparisonDiffTypes,
    flipColors?: boolean,
): string => {
    const variantClass = (() => {
        switch (comparisonDiff) {
            case ComparisonDiffTypes.POSITIVE:
                return flipColors ? styles.trendPillDown : styles.trendPillUp;
            case ComparisonDiffTypes.NEGATIVE:
                return flipColors ? styles.trendPillUp : styles.trendPillDown;
            case ComparisonDiffTypes.NAN:
            case ComparisonDiffTypes.UNDEFINED:
            case ComparisonDiffTypes.NONE:
            default:
                return styles.trendPillNeutral;
        }
    })();

    return `${styles.trendPill} ${variantClass}`;
};
