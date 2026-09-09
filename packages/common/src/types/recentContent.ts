import type { ApiSuccess } from './api/success';
import type { UUID } from './api/uuid';

export type RecentContentType = 'chart' | 'dashboard';

export type RecordRecentContentView = {
    projectUuid: UUID;
    contentType: RecentContentType;
    contentUuid: UUID;
};

export type RecentContentItem = {
    contentType: RecentContentType;
    uuid: string;
    viewedAt: Date;
};

export type ApiRecentContentResponse = ApiSuccess<RecentContentItem[]>;
