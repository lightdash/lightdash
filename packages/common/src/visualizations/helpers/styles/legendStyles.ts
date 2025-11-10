import { GRAY_3, GRAY_7 } from './themeColors';

type LegendIconType = 'line' | 'square';

// looks like -o-
const lineSeriesLegendIcon =
    'path://M0,5 L5,5 L5,7 L0,7 Z M13,5 L18,5 L18,7 L13,7 Z M9,2 A4,4 0 1,1 9,10 A4,4 0 1,1 9,2 Z';

export const getLegendStyle = (iconType: LegendIconType = 'square') => ({
    itemWidth: iconType === 'line' ? 18 : 12,
    itemHeight: 12,
    itemGap: 16,
    ...(iconType === 'line'
        ? {
              icon: lineSeriesLegendIcon,
          }
        : {
              icon: 'roundRect',
              itemStyle: { borderRadius: 3, borderWidth: 0 },
          }),
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
});
