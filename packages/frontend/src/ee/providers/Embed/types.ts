import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';

export interface EmbedContext {
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
}
