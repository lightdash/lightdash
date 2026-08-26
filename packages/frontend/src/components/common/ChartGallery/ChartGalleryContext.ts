import { createContext, useContext } from 'react';

/** True inside the gallery sidebar, which has already picked the chart type,
 *  so a config panel's own picker is redundant there. */
export const ChartGalleryContext = createContext(false);

export const useIsInsideChartGallery = () => useContext(ChartGalleryContext);

/** Focus lands here when chart type authoring hands back to the sidebar. */
export const CHART_GALLERY_SIDEBAR_TITLE_ID = 'chart-gallery-sidebar-title';

/** Focus lands here when the sidebar moves to the Choose step. */
export const CHART_GALLERY_SEARCH_ID = 'chart-gallery-search';
