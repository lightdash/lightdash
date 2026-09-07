import {
    type LegendComponentOption,
    type TooltipComponentOption,
    type XAXisComponentOption,
} from 'echarts';
import {
    AXIS_TITLE_COLOR,
    GRAY_3,
    GRAY_4,
    GRAY_7,
    TOOLTIP_BACKGROUND,
} from './themeColors';

export const DEFAULT_AXIS_LABEL_FONT_SIZE = 11.5;
export const DEFAULT_AXIS_TITLE_FONT_SIZE = 12;

const axisTheme = {
    axisLabel: {
        color: GRAY_7,
        fontWeight: 500,
        fontSize: DEFAULT_AXIS_LABEL_FONT_SIZE,
    },
    nameTextStyle: {
        color: AXIS_TITLE_COLOR,
        fontWeight: 500,
        fontSize: DEFAULT_AXIS_TITLE_FONT_SIZE,
    },
    axisLine: {
        show: true,
        lineStyle: { color: GRAY_4, type: 'solid' as const },
    },
} satisfies XAXisComponentOption;

// CSS tokens retain live SVG theming. Canvas callers resolve them before init.
export const lightdashEchartsTheme = {
    categoryAxis: axisTheme,
    valueAxis: axisTheme,
    timeAxis: axisTheme,
    logAxis: axisTheme,
    legend: {
        itemGap: 16,
        textStyle: {
            color: GRAY_7,
            fontSize: 12,
            fontWeight: 500,
            padding: [0, 0, 0, 2],
        },
        inactiveBorderWidth: 0, // Remove border on inactive items to prevent visual size increase
        // Navigation controls (for scrollable legends)
        pageButtonItemGap: 16, // Space between left arrow, page text, and right arrow
        pageButtonGap: 8, // Space between legend items and navigation controls
        pageTextStyle: {
            color: GRAY_7,
            fontSize: 12,
            fontWeight: 500,
        },
        pageIconColor: GRAY_7, // Active chevron color
        pageIconInactiveColor: GRAY_3, // Inactive chevron color
        pageIconSize: 12,
    } satisfies LegendComponentOption,
    tooltip: {
        padding: 8,
        borderColor: GRAY_3,
        borderWidth: 1,
        borderRadius: 8,
        backgroundColor: TOOLTIP_BACKGROUND,
        renderMode: 'html' as const,
        confine: true,
        textStyle: {
            color: GRAY_7,
            fontSize: 12,
        },
        extraCssText:
            'box-shadow: 0px 8px 8px 0px rgba(0, 0, 0, 0.08), 0px 0px 1px 0px rgba(0, 0, 0, 0.25);',
    } satisfies TooltipComponentOption,
};
