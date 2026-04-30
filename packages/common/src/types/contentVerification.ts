import { type ContentType } from './content';
import { type ChartKind } from './savedCharts';

export type ContentVerificationInfo = {
    verifiedBy: {
        userUuid: string;
        firstName: string;
        lastName: string;
    };
    verifiedAt: Date;
};

type VerifiedContentListItemBase = {
    uuid: string;
    contentUuid: string;
    name: string;
    description: string | null;
    spaceUuid: string;
    spaceName: string;
    lastUpdatedAt: Date;
    views: number;
    verifiedBy: {
        userUuid: string;
        firstName: string;
        lastName: string;
    };
    verifiedAt: Date;
};

export type VerifiedChartListItem = VerifiedContentListItemBase & {
    contentType: ContentType.CHART;
    chartKind: ChartKind | null;
    exploreName: string | null;
};

export type VerifiedDashboardListItem = VerifiedContentListItemBase & {
    contentType: ContentType.DASHBOARD;
};

export type VerifiedContentListItem =
    | VerifiedChartListItem
    | VerifiedDashboardListItem;

export type ApiContentVerificationResponse = {
    status: 'ok';
    results: ContentVerificationInfo;
};

export type ApiContentVerificationDeleteResponse = {
    status: 'ok';
    results: undefined;
};

export type ApiVerifiedContentListResponse = {
    status: 'ok';
    results: VerifiedContentListItem[];
};
