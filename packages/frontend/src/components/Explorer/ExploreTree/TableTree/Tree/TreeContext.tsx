import { createContext } from 'react';
import { type TableTreeContext } from './types';

const TreeContext = createContext<TableTreeContext | undefined>(undefined);

export default TreeContext;
