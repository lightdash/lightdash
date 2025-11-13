import { type LanguageMap, type SavedChart } from '@lightdash/common';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';

export const EMBED_KEY = 'lightdash-embed';

export type InMemoryEmbed = {
    projectUuid?: string;
    token?: string;
};

export type EmbedMode = 'sdk' | 'direct';

export interface EmbedContext {
    // The JWT token used to authenticate the user
    embedToken?: string;
    // Dashboard filters available to the JWT user
    filters?: SdkFilter[];
    // The project UUID of the project the JWT user is embedded in
    projectUuid?: string;
    // Powers localization of the dashboard
    languageMap?: LanguageMap;
    // The function to call when the user clicks "Explore from here"
    onExplore?: (options: { chart: SavedChart }) => void;
    // Localization function
    t: (input: string) => string | undefined;
    // The function to call when the user clicks "Back to dashboard" from an Explore
    onBackToDashboard?: () => void;
    // The chart that the user is exploring
    savedChart?: SavedChart;
    // The UUID of the saved query being viewed in an embedded Chart
    savedQueryUuid?: string;
    // The mode of the embed: 'sdk' when embedded via SDK (no URL sync), 'direct' when navigating directly to /embed (sync URL)
    mode: EmbedMode;
}
