import { type MantineTheme } from '@mantine/core';

type LegendIconType = 'line' | 'square';

export const getLegendStyle = (
    theme: MantineTheme,
    iconType: LegendIconType = 'square',
) => ({
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 16,
    ...(iconType === 'line'
        ? { icon: 'path://M2,5 L10,5 L10,7 L2,7 Z' }
        : { itemStyle: { borderRadius: 2 } }),
    textStyle: {
        color: theme.colors.gray[7],
        fontSize: 12,
        fontWeight: 500,
        padding: [0, 0, 0, 2],
    },
});
