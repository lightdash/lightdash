import { createContext } from 'react';
import type FullscreenContextType from './types';

const FullscreenContext = createContext<FullscreenContextType>(undefined);

export default FullscreenContext;
