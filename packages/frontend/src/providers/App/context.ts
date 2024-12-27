import { createContext } from 'react';
import { type AppContext } from './types';

const AppProviderContext = createContext<AppContext>(undefined as any);

export default AppProviderContext;
