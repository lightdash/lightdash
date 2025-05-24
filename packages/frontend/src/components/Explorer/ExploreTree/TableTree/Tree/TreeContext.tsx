import { createContext } from 'use-context-selector';
import { type TableTreeContext } from './types';

const TreeContext = createContext<TableTreeContext | undefined>(undefined);

export default TreeContext;
