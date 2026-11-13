import { createContext } from 'react';

/** The composer chart a tile draws; custom chart types then authorize through it. */
export const ComposerChartRenderTargetContext = createContext<
    string | undefined
>(undefined);
