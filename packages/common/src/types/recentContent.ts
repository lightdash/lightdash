import type { ApiSuccess } from './api/success';
import type { UUID } from './api/uuid';
import type { ChartContent, DashboardContent, DataAppContent } from './content';

export type RecentContentType = 'chart' | 'dashboard' | 'data_app';

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

export type RecentContentEntry = RecentContentItem & {
    content: ChartContent | DashboardContent | DataAppContent;
};

export type ApiRecentContentResponse = ApiSuccess<RecentContentEntry[]>;
