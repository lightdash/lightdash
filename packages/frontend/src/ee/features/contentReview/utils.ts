import {
    assertUnreachable,
    ContentReviewContentType,
    getDocumentUrl,
    type ContentReviewContentSummary,
    type ContentReviewUser,
    type ContentReviewSimilarContentItem,
} from '@lightdash/common';
import {
    IconChartBar,
    IconFileText,
    IconLayoutDashboard,
    IconTerminal2,
} from '@tabler/icons-react';
import i18n from '../../../i18n/i18n';

const tr = (key: string) => i18n.t(`contentReview.${key}`, { ns: 'eeMisc' });

export const getContentTypeIcon = (contentType: ContentReviewContentType) => {
    switch (contentType) {
        case ContentReviewContentType.CHART:
            return IconChartBar;
        case ContentReviewContentType.SQL_CHART:
            return IconTerminal2;
        case ContentReviewContentType.DASHBOARD:
            return IconLayoutDashboard;
        case ContentReviewContentType.DOCUMENT:
            return IconFileText;
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
        case ContentReviewContentType.DOCUMENT:
            return 'gray.6';
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
            return tr('noun.chart');
        case ContentReviewContentType.SQL_CHART:
            return tr('noun.sqlChart');
        case ContentReviewContentType.DASHBOARD:
            return tr('noun.dashboard');
        case ContentReviewContentType.DOCUMENT:
            return tr('noun.document');
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
        case ContentReviewContentType.DOCUMENT:
            return getDocumentUrl(projectUuid, content.slug);
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
            return tr('type.chart');
        case ContentReviewContentType.SQL_CHART:
            return tr('type.sqlChart');
        case ContentReviewContentType.DASHBOARD:
            return tr('type.dashboard');
        case ContentReviewContentType.DOCUMENT:
            return tr('type.document');
        default:
            return assertUnreachable(
                contentType,
                'Unknown review content type',
            );
    }
};

export const getSimilarityMatchLabel = (
    reason: ContentReviewSimilarContentItem['matchReason'],
): string => {
    switch (reason) {
        case 'potential_duplicate':
            return tr('match.potentialDuplicate');
        case 'related':
            return tr('match.related');
        case 'same_name':
            return tr('match.sameName');
        default:
            return tr('match.similarName');
    }
};
