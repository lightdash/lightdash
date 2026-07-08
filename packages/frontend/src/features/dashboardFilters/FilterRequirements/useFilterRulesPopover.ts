import { useContext } from 'react';
import { FilterRulesPopoverContext } from './FilterRulesPopoverContext';

export const useFilterRulesPopover = () =>
    useContext(FilterRulesPopoverContext);
