import { type ContentAsCodeSyncContentType } from '../types';

const CONTENT_AS_CODE_TYPE_LABELS: Record<
    ContentAsCodeSyncContentType,
    string
> = {
    chart: 'Chart',
    dashboard: 'Dashboard',
};

export const getContentAsCodeTypeLabel = (
    contentType: ContentAsCodeSyncContentType,
): string => CONTENT_AS_CODE_TYPE_LABELS[contentType];
