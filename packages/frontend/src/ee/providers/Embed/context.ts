import { createContext } from 'react';
import { type EmbedContext } from './types';

const EmbedProviderContext = createContext<EmbedContext>({
    embedToken: undefined,
});

export default EmbedProviderContext;
