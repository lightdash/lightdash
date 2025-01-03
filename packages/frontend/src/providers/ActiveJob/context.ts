import { createContext } from 'react';
import { type ContextType } from './types';

const Context = createContext<ContextType>(undefined as any);

export default Context;
