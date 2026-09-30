export const sanitizeEchartsFontFamily = (
    fontFamily: string | undefined,
): string | undefined => {
    if (!fontFamily) return undefined;

    // ECharts serializes textStyle.fontFamily into inline SVG style attributes.
    // Double quotes inside the font stack can break that markup, so normalize
    // them to single quotes before the chart is exported or rasterized.
    return fontFamily.replaceAll('"', "'");
};
