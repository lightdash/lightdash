import { createContext } from 'react';
import { type EmbedContext, type EmbedExploreChart } from './types';

const EmbedProviderContext = createContext<EmbedContext>({
    embedToken: undefined,
    filters: undefined,
    projectUuid: undefined,
    content: undefined,
    writeActions: undefined,
    embedWriteContext: undefined,
    paletteUuid: undefined,
    languageMap: undefined,
    t: (_input: string) => undefined,
    onExplore: (_options: { chart: EmbedExploreChart }) => {},
    savedChart: undefined,
    onBackToDashboard: undefined,
    mode: 'direct',
    theme: 'light',
    backgroundColor: null,
    timezone: null,
});

export default EmbedProviderContext;
