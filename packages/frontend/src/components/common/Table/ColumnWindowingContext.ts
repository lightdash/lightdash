import { createContext } from 'react';

// Off unless a ColumnWindowingProvider above resolves the feature flag on.
export const ColumnWindowingContext = createContext(false);
