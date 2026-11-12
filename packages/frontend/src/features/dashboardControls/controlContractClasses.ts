import { createContext, useContext } from 'react';

/** The public class names an embed puts on the filter editor (default none). */
export type ControlContractClassNames = {
    editor: string;
    /** The field search's list while a filter is added. */
    addFilterDropdown: string;
    /** The value inputs' lists of the filter being edited. */
    filterDropdown: string;
    /** Each parameter pill. */
    parameter: string;
    /** The parameter popover. */
    parameterDropdown: string;
    /** Each date zoom pill, named and Default. */
    dateZoom: string;
    /** The date zoom popovers. */
    dateZoomDropdown: string;
};

export const ControlContractClasses =
    createContext<ControlContractClassNames | null>(null);

export const useControlContractClasses = () =>
    useContext(ControlContractClasses);
