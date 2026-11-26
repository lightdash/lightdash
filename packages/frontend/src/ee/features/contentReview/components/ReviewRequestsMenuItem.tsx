import { getContentReviewRequestsPath } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useReviewRequestsNav } from '../hooks/useReviewRequestsNav';
import ReviewRequestCountBadge from './ReviewRequestCountBadge';

type Props = {
    projectUuid: string;
};

// Browse menu entry for the review queue, with how many requests are waiting
// on the viewer
const ReviewRequestsMenuItem: FC<Props> = ({ projectUuid }) => {
    const { isAvailable, pendingCount } = useReviewRequestsNav(projectUuid);
    if (!isAvailable) return null;
    return (
        <Menu.Item
            component={Link}
            to={getContentReviewRequestsPath(projectUuid)}
            leftSection={<MantineIcon icon={IconSend} />}
            rightSection={
                pendingCount > 0 ? (
                    <ReviewRequestCountBadge count={pendingCount} />
                ) : null
            }
        >
            Review requests
        </Menu.Item>
    );
};

export default ReviewRequestsMenuItem;
