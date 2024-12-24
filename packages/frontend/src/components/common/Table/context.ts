import { createContext } from 'react';
import { type TableContext } from './types';

const Context = createContext<TableContext | undefined>(undefined);

export default Context;
