import type { VisualizationTheme } from '../theme';

export const LEGEND_INTERACTION_HINT =
    'Click to toggle visibility. Double click to isolate';

/** The tooltip shown while hovering a legend item, explaining click and double click. */
export const getLegendDoubleClickTooltip = (theme: VisualizationTheme) => ({
    show: true,
    backgroundColor: theme.background,
    borderColor: theme.neutral[3],
    borderWidth: 0,
    borderRadius: 4,
    textStyle: {
        color: theme.neutral[7],
        fontSize: 12,
        fontWeight: 400,
    },
    padding: [4, theme.tooltipPadding],
    extraCssText: `box-shadow: ${theme.tooltipShadow};`,
    formatter: () => LEGEND_INTERACTION_HINT,
});

export type LegendDoubleClickTooltip = ReturnType<
    typeof getLegendDoubleClickTooltip
>;
