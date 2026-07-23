import { px, useMantineTheme } from '@mantine-8/core';

export const useLegendDoubleClickTooltip = () => {
    const theme = useMantineTheme();
    const paddingBlock = Number.parseFloat(String(px(theme.spacing.xxs)));
    const paddingInline = Number.parseFloat(String(px(theme.spacing.xs)));

    return {
        tooltip: {
            show: true,
            backgroundColor: theme.colors.background[0],
            borderColor: theme.colors.ldGray[3],
            borderWidth: 0,
            borderRadius: 4,
            textStyle: {
                color: theme.colors.ldGray[7],
                fontSize: 12,
                fontWeight: 400,
            },
            padding: [paddingBlock, paddingInline],
            extraCssText: `box-shadow: ${theme.shadows.subtle};`,
            formatter: () => {
                return `Click to toggle visibility. Double click to isolate`;
            },
        },
    };
};
