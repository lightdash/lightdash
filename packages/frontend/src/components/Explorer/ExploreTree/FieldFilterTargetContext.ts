import { type FilterableField } from '@lightdash/common';
import { createContext, useContext } from 'react';

export type FieldFilterTarget = {
    filteredFieldIds: ReadonlySet<string>;
    addFilter: (field: FilterableField) => void;
};

/** Where this field tree's filter actions go; null means the explorer's own filters. */
export const FieldFilterTargetContext = createContext<FieldFilterTarget | null>(
    null,
);

export const useFieldFilterTarget = () => useContext(FieldFilterTargetContext);
