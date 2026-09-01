import {
    ContentType,
    type ContentReviewContentSummary,
    type ContentReviewContentType,
} from '@lightdash/common';

export const getContentHref = (
    projectUuid: string,
    contentType: ContentReviewContentType,
    content: ContentReviewContentSummary,
): string =>
    contentType === ContentType.CHART
        ? `/projects/${projectUuid}/saved/${content.slug}`
        : `/projects/${projectUuid}/dashboards/${content.slug}`;

export const getContentTypeLabel = (
    contentType: ContentReviewContentType,
): string => (contentType === ContentType.CHART ? 'Chart' : 'Dashboard');
