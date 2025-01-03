import { createContext } from 'use-context-selector';
import { type ExplorerContextType } from './types';

const ExplorerContext = createContext<ExplorerContextType | undefined>(
    undefined,
);

export default ExplorerContext;
