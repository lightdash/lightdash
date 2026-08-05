import { createContext } from 'react';

/**
 * The saved-chart version currently being previewed, when a surface renders an
 * older config than the chart's latest one. Undefined everywhere else, which
 * means "the latest version".
 */
export const ChartVersionPreviewContext = createContext<string | undefined>(
    undefined,
);
