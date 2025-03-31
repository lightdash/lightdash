import { type LanguageMap } from '@lightdash/common';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';

export interface EmbedContext {
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
    languageMap?: LanguageMap;
    t: (input: string) => string | undefined;
}
