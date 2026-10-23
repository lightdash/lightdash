import { createContext, useContext } from 'react';

/** The public class names an embed puts on the rail (default none). */
export type RailContractClassNames = {
    rail: string;
    /** The field search's list while a filter is added. */
    addFilterDropdown: string;
    /** The value inputs' lists of the filter being edited. */
    filterDropdown: string;
};

export const RailContractClasses = createContext<RailContractClassNames | null>(
    null,
);

export const useRailContractClasses = () => useContext(RailContractClasses);
