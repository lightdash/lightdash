import { ContentType } from '@lightdash/common';

// `contentType` values marking a content-mention node as a file or repository
// (vs chart / dashboard / data app). Those nodes carry the path / `owner/repo`
// in `label` and no context payload.
export const FILE_MENTION_CONTENT_TYPE = 'file';
export const REPOSITORY_MENTION_CONTENT_TYPE = 'repository';

export const getContentMentionContentType = (value: unknown) => {
    if (value === FILE_MENTION_CONTENT_TYPE) return FILE_MENTION_CONTENT_TYPE;
    if (value === REPOSITORY_MENTION_CONTENT_TYPE)
        return REPOSITORY_MENTION_CONTENT_TYPE;
    if (value === ContentType.DASHBOARD) return ContentType.DASHBOARD;
    if (value === ContentType.DATA_APP) return ContentType.DATA_APP;
    return ContentType.CHART;
};
