import {
    assertUnreachable,
    ContentReviewRequestStatus,
} from '@lightdash/common';
import { Badge } from '@mantine/core';
import { type FC } from 'react';

const getStatusProps = (
    status: ContentReviewRequestStatus,
): { color: string; label: string } => {
    switch (status) {
        case ContentReviewRequestStatus.PENDING:
            return { color: 'yellow', label: 'Pending' };
        case ContentReviewRequestStatus.APPROVED:
            return { color: 'green', label: 'Approved' };
        case ContentReviewRequestStatus.REJECTED:
            return { color: 'red', label: 'Rejected' };
        case ContentReviewRequestStatus.CANCELLED:
            return { color: 'gray', label: 'Cancelled' };
        default:
            return assertUnreachable(status, 'Unknown review request status');
    }
};

const ContentReviewStatusBadge: FC<{ status: ContentReviewRequestStatus }> = ({
    status,
}) => {
    const { color, label } = getStatusProps(status);
    return (
        <Badge color={color} variant="light" size="sm" radius="sm" tt="none">
            {label}
        </Badge>
    );
};

export default ContentReviewStatusBadge;
