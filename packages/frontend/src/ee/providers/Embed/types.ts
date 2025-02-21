import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';

export interface EmbedContext {
    isEmbedded: boolean;
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
}
