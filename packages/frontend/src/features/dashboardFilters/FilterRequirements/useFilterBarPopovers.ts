import { useContext } from 'react';
import { FilterBarPopoversContext } from './FilterBarPopoversContext';

export const useFilterBarPopovers = () => useContext(FilterBarPopoversContext);
