import { ContentAsCodeType } from '@lightdash/common'; // pragma: allowlist secret

const CONTENT_AS_CODE_TYPE_LABELS: Record<ContentAsCodeType, string> = {
    [ContentAsCodeType.CHART]: 'Chart',
    [ContentAsCodeType.DASHBOARD]: 'Dashboard',
    [ContentAsCodeType.SQL_CHART]: 'SQL chart',
    [ContentAsCodeType.SPACE]: 'Space',
    [ContentAsCodeType.AI_AGENT]: 'AI agent',
    [ContentAsCodeType.SCHEDULED_DELIVERY]: 'Scheduled delivery',
    [ContentAsCodeType.ALERT]: 'Alert',
    [ContentAsCodeType.GOOGLE_SHEETS_SYNC]: 'Google Sheets sync',
    [ContentAsCodeType.VIRTUAL_VIEW]: 'Virtual view',
    [ContentAsCodeType.EXTERNAL_CONNECTION]: 'External connection',
};

const isContentAsCodeType = (value: string): value is ContentAsCodeType =>
    Object.values(ContentAsCodeType).includes(value as ContentAsCodeType);

export const getContentAsCodeTypeLabel = (contentType: string): string => {
    if (isContentAsCodeType(contentType)) {
        return CONTENT_AS_CODE_TYPE_LABELS[contentType];
    }

    return contentType.replace(/_/g, ' ');
};
