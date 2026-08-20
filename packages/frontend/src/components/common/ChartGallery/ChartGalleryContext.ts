import { createContext, useContext } from 'react';

/** True inside the gallery sidebar, which has already picked the chart type,
 *  so a config panel's own picker is redundant there. */
export const ChartGalleryContext = createContext(false);

export const useIsInsideChartGallery = () => useContext(ChartGalleryContext);
