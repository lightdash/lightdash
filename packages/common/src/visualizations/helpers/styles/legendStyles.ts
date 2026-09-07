import { lightdashEchartsTheme } from './echartsTheme';

type LegendIconType = 'line' | 'square';

// looks like -o-
const lineSeriesLegendIcon =
    'path://M0,5 L5,5 L5,7 L0,7 Z M13,5 L18,5 L18,7 L13,7 Z M9,2 A4,4 0 1,1 9,10 A4,4 0 1,1 9,2 Z';

export const getLegendIconStyle = (iconType: LegendIconType = 'square') => ({
    itemWidth: iconType === 'line' ? 18 : 12,
    itemHeight: 12,
    ...(iconType === 'line'
        ? {
              icon: lineSeriesLegendIcon,
          }
        : {
              icon: 'roundRect',
              itemStyle: { borderRadius: 3, borderWidth: 0 },
          }),
});

export const getLegendStyle = (iconType: LegendIconType = 'square') => ({
    ...lightdashEchartsTheme.legend,
    textStyle: {
        ...lightdashEchartsTheme.legend.textStyle,
        padding: [...lightdashEchartsTheme.legend.textStyle.padding],
    },
    pageTextStyle: { ...lightdashEchartsTheme.legend.pageTextStyle },
    ...getLegendIconStyle(iconType),
});
