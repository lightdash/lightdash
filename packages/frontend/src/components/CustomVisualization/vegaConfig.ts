import { vizThemeColors } from '@lightdash/common';

export const vegaStyleConfig = {
    background: 'transparent',
    font: 'Inter, sans-serif',
    autosize: {
        type: 'fit' as const,
        resize: true,
    },
    axis: {
        gridColor: vizThemeColors.GRAY_1,
        gridDash: [3, 3],

        domainColor: vizThemeColors.GRAY_4,
        domainWidth: 1,

        tickColor: vizThemeColors.GRAY_4,
        tickSize: 5,
        tickWidth: 1,

        labelColor: vizThemeColors.GRAY_7,
        labelFontSize: 12,
        labelFontWeight: 500,

        titleColor: vizThemeColors.AXIS_TITLE_COLOR,
        titleFontSize: 12,
        titleFontWeight: 500,
    },
} as const;
