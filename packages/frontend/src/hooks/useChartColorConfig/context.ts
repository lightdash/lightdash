import { createContext } from 'react';
import { type ChartColorMappingContextProps } from './types';

export const ChartColorMappingContext =
    createContext<ChartColorMappingContextProps | null>(null);
