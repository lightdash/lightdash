import type { VisualizationTheme } from '../theme';

export const LEGEND_INTERACTION_HINT =
    'Click to toggle visibility. Double click to isolate';

/** The tooltip shown while hovering a legend item, explaining click and double click. */
export const getLegendDoubleClickTooltip = (theme: VisualizationTheme) => ({
    show: true,
    backgroundColor: theme.background,
    borderColor: theme.gray[3],
    borderWidth: 0,
    borderRadius: 4,
    textStyle: {
        color: theme.gray[7],
        fontSize: 12,
        fontWeight: 400,
    },
    padding: [4, theme.spacingXs],
    extraCssText: `box-shadow: ${theme.shadowSubtle};`,
    formatter: () => LEGEND_INTERACTION_HINT,
});

export type LegendDoubleClickTooltip = ReturnType<
    typeof getLegendDoubleClickTooltip
>;
