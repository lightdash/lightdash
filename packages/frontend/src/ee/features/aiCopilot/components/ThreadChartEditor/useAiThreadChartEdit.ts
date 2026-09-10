import { createContext, useContext } from 'react';

/** Set when the thread view can edit a chart in place; absent falls back to navigation. */
export const AiThreadChartEditContext = createContext<
    ((chartUuid: string) => void) | undefined
>(undefined);

export const useAiThreadChartEdit = ():
    | ((chartUuid: string) => void)
    | undefined => useContext(AiThreadChartEditContext);
