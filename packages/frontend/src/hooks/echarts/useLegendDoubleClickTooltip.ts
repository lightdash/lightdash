import { px, useMantineTheme } from '@mantine/core';

export const useLegendDoubleClickTooltip = () => {
    const theme = useMantineTheme();

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
            padding: [px(theme.spacing.xxs), px(theme.spacing.xs)],
            extraCssText: `box-shadow: ${theme.shadows.subtle};`,
            formatter: () => {
                return `Click to toggle visibility. Double click to isolate`;
            },
        },
    };
};
