import type { VisualizationTheme } from '../theme';

/** Tooltip style for legend items whose labels can be truncated. */
export const getLegendLabelTooltipStyle = (theme: VisualizationTheme) => ({
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
});

export type LegendLabelTooltipStyle = ReturnType<
    typeof getLegendLabelTooltipStyle
>;
