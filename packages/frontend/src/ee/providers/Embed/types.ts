import {
    type AnonymousAccount,
    type CreateEmbedJwt,
    type LanguageMap,
    type SavedChart,
} from '@lightdash/common';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';

export const EMBED_KEY = 'lightdash-embed';

export type EmbedTheme = 'light' | 'dark';

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
    // The content claim decoded from the JWT
    content?: CreateEmbedJwt['content'];
    // Write-action configuration decoded from the JWT
    writeActions?: CreateEmbedJwt['writeActions'];
    // Server-computed permissions for the write-action actor
    embedWriteContext?: AnonymousAccount['embedWriteContext'];
    // An optional org palette override for SDK dashboards
    paletteUuid?: string;
    // Powers localization of the dashboard
    languageMap?: LanguageMap;
    // The function to call when the user clicks "Explore from here"
    onExplore?: (options: { chart: SavedChart; returnUrl?: string }) => void;
    // Localization function
    t: (input: string) => string | undefined;
    // The function to call when the user clicks "Back to dashboard" from an Explore
    onBackToDashboard?: () => void;
    exploreBackLabel?: string;
    // The chart that the user is exploring
    savedChart?: SavedChart;
    // The UUID of the saved query being viewed in an embedded Chart
    savedQueryUuid?: string;
    // The UUID of the data app being viewed in a standalone embedded App
    appUuid?: string;
    // The mode of the embed: 'sdk' when embedded via SDK (no URL sync), 'direct' when navigating directly to /embed (sync URL)
    mode: EmbedMode;
    // Theme color scheme for the embed, set via ?theme=light|dark URL param
    theme: EmbedTheme;
    // Custom background color for the embed, set via ?backgroundColor=<css-color> URL param
    backgroundColor: string | null;
    // Session query timezone (IANA), set via ?timezone=<IANA> URL param; overrides the chart pin
    timezone: string | null;
}
