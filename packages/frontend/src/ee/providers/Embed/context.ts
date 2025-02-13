import { createContext } from 'react';
import { type EmbedContext } from './types';

const EmbedProviderContext = createContext<EmbedContext>({
    isEmbedded: false,
    embedToken: undefined,
    filters: undefined,
    projectUuid: undefined,
});

export default EmbedProviderContext;
