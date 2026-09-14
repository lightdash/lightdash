import { getContentReviewRequestsPath } from '@lightdash/common';
import { Badge, Menu } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useContentReviewAvailability } from '../hooks/useContentReviewAvailability';
import { usePendingContentReviewCount } from '../hooks/useContentReviewRequests';

type Props = {
    projectUuid: string;
};

// Browse menu entry for the review queue, with how many requests are waiting
// on the viewer
const ReviewRequestsMenuItem: FC<Props> = ({ projectUuid }) => {
    const { isAvailable } = useContentReviewAvailability();
    const { data: pendingCount = 0 } = usePendingContentReviewCount(
        projectUuid,
        isAvailable,
    );
    if (!isAvailable) return null;
    return (
        <Menu.Item
            component={Link}
            to={getContentReviewRequestsPath(projectUuid)}
            leftSection={<MantineIcon icon={IconSend} />}
            rightSection={
                pendingCount > 0 ? (
                    <Badge size="xs" color="yellow" variant="light" circle>
                        {pendingCount}
                    </Badge>
                ) : null
            }
        >
            Review requests
        </Menu.Item>
    );
};

export default ReviewRequestsMenuItem;
