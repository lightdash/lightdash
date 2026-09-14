import {
    assertUnreachable,
    ContentReviewContentType,
    type ContentReviewContentSummary,
    type ContentReviewUser,
} from '@lightdash/common';
import {
    IconChartBar,
    IconLayoutDashboard,
    IconTerminal2,
} from '@tabler/icons-react';

export const getContentTypeIcon = (contentType: ContentReviewContentType) => {
    switch (contentType) {
        case ContentReviewContentType.CHART:
            return IconChartBar;
        case ContentReviewContentType.SQL_CHART:
            return IconTerminal2;
        case ContentReviewContentType.DASHBOARD:
            return IconLayoutDashboard;
        default:
            return assertUnreachable(
                contentType,
                'Unknown review content type',
            );
    }
};

export const getContentTypeColor = (
    contentType: ContentReviewContentType,
): string => {
    switch (contentType) {
        case ContentReviewContentType.CHART:
        case ContentReviewContentType.SQL_CHART:
            return 'blue.6';
        case ContentReviewContentType.DASHBOARD:
            return 'green.6';
        default:
            return assertUnreachable(
                contentType,
                'Unknown review content type',
            );
    }
};

// Lowercase noun for sentences such as "this chart"
export const getContentTypeNoun = (
    contentType: ContentReviewContentType,
): string => {
    switch (contentType) {
        case ContentReviewContentType.CHART:
            return 'chart';
        case ContentReviewContentType.SQL_CHART:
            return 'SQL chart';
        case ContentReviewContentType.DASHBOARD:
            return 'dashboard';
        default:
            return assertUnreachable(
                contentType,
                'Unknown review content type',
            );
    }
};

export const getUserFullName = (user: ContentReviewUser): string =>
    `${user.firstName} ${user.lastName}`.trim();

export const getUserInitials = (user: ContentReviewUser): string =>
    `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

export const getContentHref = (
    projectUuid: string,
    contentType: ContentReviewContentType,
    content: ContentReviewContentSummary,
): string => {
    switch (contentType) {
        case ContentReviewContentType.CHART:
            return `/projects/${projectUuid}/saved/${content.slug}`;
        case ContentReviewContentType.SQL_CHART:
            return `/projects/${projectUuid}/sql-runner/${content.slug}`;
        case ContentReviewContentType.DASHBOARD:
            return `/projects/${projectUuid}/dashboards/${content.slug}`;
        default:
            return assertUnreachable(
                contentType,
                'Unknown review content type',
            );
    }
};

export const getContentTypeLabel = (
    contentType: ContentReviewContentType,
): string => {
    switch (contentType) {
        case ContentReviewContentType.CHART:
            return 'Chart';
        case ContentReviewContentType.SQL_CHART:
            return 'SQL chart';
        case ContentReviewContentType.DASHBOARD:
            return 'Dashboard';
        default:
            return assertUnreachable(
                contentType,
                'Unknown review content type',
            );
    }
};
