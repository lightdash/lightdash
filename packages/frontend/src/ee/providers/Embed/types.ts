import { type LanguageMap, type SavedChart } from '@lightdash/common';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';

export const EMBED_KEY = 'lightdash-embed';

export type InMemoryEmbed = {
    projectUuid?: string;
    token?: string;
};

export interface EmbedContext {
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
    languageMap?: LanguageMap;
    onExplore?: (options: { chart: SavedChart }) => void;
    t: (input: string) => string | undefined;
}
