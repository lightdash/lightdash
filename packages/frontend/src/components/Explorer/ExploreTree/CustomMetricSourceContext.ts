import { createContext, useContext } from 'react';

export const CustomMetricSourceContext = createContext<string | undefined>(
    undefined,
);

/** The merge source that owns custom metrics created from this field tree. */
export const useCustomMetricSourceId = () =>
    useContext(CustomMetricSourceContext);
