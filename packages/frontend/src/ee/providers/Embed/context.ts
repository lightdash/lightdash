import { createContext } from 'react';
import { type EmbedContext } from './types';

const EmbedProviderContext = createContext<EmbedContext>({
    embedToken: undefined,
    filters: undefined,
    projectUuid: undefined,
    languageMap: undefined,
    t: (_input: string) => undefined,
});

export default EmbedProviderContext;
