import { type SavedChart } from '@lightdash/common';
import { useContext } from 'react';
import { useParams } from 'react-router';
import EmbedProviderContext from './context';
import { type EmbedContext } from './types';

function useEmbed(): EmbedContext {
    const context = useContext(EmbedProviderContext);
    const { projectUuid: projectUuidFromParams } = useParams<{
        projectUuid: string;
    }>();

    if (
        context.projectUuid &&
        projectUuidFromParams &&
        context.projectUuid !== projectUuidFromParams
    ) {
        throw new Error(
            'Cannot have mismatching :projectUuid in the URL route path and embed context',
        );
    }

    if (context === undefined) {
        return {
            embedToken: undefined,
            filters: undefined,
            projectUuid: undefined,
            languageMap: undefined,
            onExplore: (_options: { chart: SavedChart }) => {},
            t: (_input: string) => undefined,
            mode: 'direct',
        };
    }

    return context;
}

export default useEmbed;
