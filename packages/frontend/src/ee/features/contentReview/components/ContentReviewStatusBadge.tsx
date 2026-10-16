import {
    assertUnreachable,
    ContentReviewRequestStatus,
} from '@lightdash/common';
import { Badge } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

const getStatusProps = (
    status: ContentReviewRequestStatus,
): { color: string; labelKey: string } => {
    switch (status) {
        case ContentReviewRequestStatus.PENDING:
            return { color: 'yellow', labelKey: 'pending' };
        case ContentReviewRequestStatus.APPROVED:
            return { color: 'green', labelKey: 'approved' };
        case ContentReviewRequestStatus.REJECTED:
            return { color: 'red', labelKey: 'rejected' };
        case ContentReviewRequestStatus.CANCELLED:
            return { color: 'gray', labelKey: 'cancelled' };
        default:
            return assertUnreachable(status, 'Unknown review request status');
    }
};

const ContentReviewStatusBadge: FC<{ status: ContentReviewRequestStatus }> = ({
    status,
}) => {
    const { t } = useTranslation('eeMisc');
    const { color, labelKey } = getStatusProps(status);
    return (
        <Badge color={color} variant="light" size="sm" radius="sm" tt="none">
            {t(`contentReview.status.${labelKey}`)}
        </Badge>
    );
};

export default ContentReviewStatusBadge;
