import {
    ContentType,
    type ContentReviewContentSummary,
    type ContentReviewContentType,
    type ContentReviewUser,
} from '@lightdash/common';
import { IconChartBar, IconLayoutDashboard } from '@tabler/icons-react';

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

export const getContentTypeIcon = (contentType: ContentReviewContentType) =>
    contentType === ContentType.CHART ? IconChartBar : IconLayoutDashboard;

export const getContentTypeColor = (
    contentType: ContentReviewContentType,
): string => (contentType === ContentType.CHART ? 'blue.6' : 'green.6');

export const getUserFullName = (user: ContentReviewUser): string =>
    `${user.firstName} ${user.lastName}`.trim();

export const getUserInitials = (user: ContentReviewUser): string =>
    `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
