import { createContext } from 'react';
import { type EmbedContext } from './types';

const EmbedProviderContext = createContext<EmbedContext>({
    embedToken: undefined,
    filters: undefined,
    projectUuid: undefined,
    t: (_input: string) => {
        return undefined;
    },
});

export default EmbedProviderContext;
