import { type SavedChart } from '@lightdash/common';
import { createContext } from 'react';
import { type EmbedContext } from './types';

const EmbedProviderContext = createContext<EmbedContext>({
    embedToken: undefined,
    filters: undefined,
    projectUuid: undefined,
    languageMap: undefined,
    t: (_input: string) => undefined,
    onExplore: (_options: { chart: SavedChart }) => {},
});

export default EmbedProviderContext;
