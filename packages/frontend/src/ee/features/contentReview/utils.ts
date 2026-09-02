import {
    ContentType,
    type ContentReviewContentType,
    type ContentReviewUser,
} from '@lightdash/common';
import { IconChartBar, IconLayoutDashboard } from '@tabler/icons-react';

export const getContentTypeIcon = (contentType: ContentReviewContentType) =>
    contentType === ContentType.CHART ? IconChartBar : IconLayoutDashboard;

export const getContentTypeColor = (
    contentType: ContentReviewContentType,
): string => (contentType === ContentType.CHART ? 'blue.6' : 'green.6');

export const getUserFullName = (user: ContentReviewUser): string =>
    `${user.firstName} ${user.lastName}`.trim();

export const getUserInitials = (user: ContentReviewUser): string =>
    `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
