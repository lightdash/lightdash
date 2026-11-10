import {
    assertUnreachable,
    ContentReviewContentType,
    getDocumentUrl,
    type ContentReviewContentSummary,
    type ContentReviewUser,
    type ContentReviewSimilarContentItem,
    type SpaceSummary,
} from '@lightdash/common';
import {
    IconChartBar,
    IconFileText,
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
            return 'chart';
        case ContentReviewContentType.SQL_CHART:
            return 'SQL chart';
        case ContentReviewContentType.DASHBOARD:
            return 'dashboard';
        case ContentReviewContentType.DOCUMENT:
            return 'Document';
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
            return 'Chart';
        case ContentReviewContentType.SQL_CHART:
            return 'SQL chart';
        case ContentReviewContentType.DASHBOARD:
            return 'Dashboard';
        case ContentReviewContentType.DOCUMENT:
            return 'Document';
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
            return 'Potential duplicate';
        case 'related':
            return 'Related analysis';
        case 'same_name':
            return 'Same name';
        default:
            return 'Similar name';
    }
};

// The root spaces plus every space nested under them; stops growing on a
// malformed parent cycle instead of looping
export const getSpaceTreeUuids = (
    spaces: Pick<SpaceSummary, 'uuid' | 'parentSpaceUuid'>[],
    rootSpaceUuids: string[],
): Set<string> => {
    const expand = (treeUuids: Set<string>): Set<string> => {
        const expanded = new Set([
            ...treeUuids,
            ...spaces
                .filter(
                    (space) =>
                        space.parentSpaceUuid !== null &&
                        treeUuids.has(space.parentSpaceUuid),
                )
                .map((space) => space.uuid),
        ]);
        return expanded.size === treeUuids.size ? treeUuids : expand(expanded);
    };
    return expand(new Set(rootSpaceUuids));
};
