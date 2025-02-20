import { useContext } from 'react';
import EmbedProviderContext from './context';
import { type EmbedContext } from './types';

function useEmbed(): EmbedContext {
    const context = useContext(EmbedProviderContext);

    if (context === undefined) {
        return {
            isEmbedded: false,
            embedToken: undefined,
            filters: undefined,
            projectUuid: undefined,
        };
    }

    return context;
}

export default useEmbed;
