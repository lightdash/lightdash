import {
    type JWT_HEADER_NAME,
    type LanguageMap,
    type SavedChart,
} from '@lightdash/common';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';

export type EmbedHeaders = {
    [JWT_HEADER_NAME]: string;
};
export interface EmbedContext {
    embedHeaders?: EmbedHeaders;
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
    languageMap?: LanguageMap;
    onExplore?: (options: { chart: SavedChart }) => void;
    t: (input: string) => string | undefined;
}
