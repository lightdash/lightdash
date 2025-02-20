import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';

export type NestedLanguage = string | { [key: string]: NestedLanguage };
export interface EmbedContext {
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
    t: (input: string) => string | undefined;
}
