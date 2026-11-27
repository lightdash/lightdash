import { type ParametersValuesMap } from '@lightdash/common';
import { createContext, useContext } from 'react';

/** The parameter values each node's run used; set where the lineage shows that run's SQL. */
export const ComposerRunParametersContext = createContext<Record<
    string,
    ParametersValuesMap
> | null>(null);

export const useComposerRunParameters = () =>
    useContext(ComposerRunParametersContext);
