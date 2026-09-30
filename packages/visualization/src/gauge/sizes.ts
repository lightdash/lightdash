/**
 * Gauge sizing: the font sizes, line width and radius of a gauge, scaled
 * to the box it renders in. The frontend feeds its measured container;
 * a headless caller feeds the intended image size.
 */

const BOX_MIN_WIDTH = 150;
const BOX_MAX_WIDTH = 1000;

/** One dashboard grid row: the smallest tile a gauge is drawn in. */
const BOX_MIN_HEIGHT = 14 * 1.5 + 16 * 2 + 2;
const BOX_MAX_HEIGHT = 1000;

const LINE_SIZE_MIN = 15;
const LINE_SIZE_MAX = 150;

const DETAILS_SIZE_MIN = 10;
const DETAILS_SIZE_MAX = 160;

const TITLE_SIZE_MIN = 5;
const TITLE_SIZE_MAX = 50;

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

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

    // assert : 0 <= scalingFactor <= 1
    const fontSize = Math.floor(
        fontSizeMin + (fontSizeMax - fontSizeMin) * scalingFactor,
    );

    return fontSize;
};

const calculateRadius = (boundWidth: number, boundHeight: number) => {
    const aspectRatio = boundWidth / boundHeight;
    const baseRadius = 90;

    if (aspectRatio === 1) {
        return baseRadius;
    }

    if (aspectRatio > 1) {
        return baseRadius * Math.min(aspectRatio, 1.5);
    }

    return baseRadius;
};

export type GaugeSizes = {
    tileFontSize: number;
    detailsFontSize: number;
    lineSize: number;
    radius: number;
};

/** The sizes of a gauge drawn in a box of `width` by `height` px. */
export const getGaugeSizes = ({
    width,
    height,
}: {
    width: number;
    height: number;
}): GaugeSizes => {
    const boundWidth = clamp(width || 0, BOX_MIN_WIDTH, BOX_MAX_WIDTH);
    const boundHeight = clamp(height || 0, BOX_MIN_HEIGHT, BOX_MAX_HEIGHT);

    return {
        tileFontSize: calculateFontSize(
            TITLE_SIZE_MIN,
            TITLE_SIZE_MAX,
            boundWidth,
            boundHeight,
        ),
        detailsFontSize: calculateFontSize(
            DETAILS_SIZE_MIN,
            DETAILS_SIZE_MAX,
            boundWidth,
            boundHeight,
        ),
        lineSize: calculateFontSize(
            LINE_SIZE_MIN,
            LINE_SIZE_MAX,
            boundWidth,
            boundHeight,
        ),
        radius: calculateRadius(boundWidth, boundHeight),
    };
};
