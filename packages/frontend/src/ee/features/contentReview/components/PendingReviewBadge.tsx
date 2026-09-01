import {
    getContentReviewRequestPath,
    type ContentReviewRequest,
} from '@lightdash/common';
import { Anchor, Badge, Button, Popover, Stack, Text } from '@mantine/core';
import { IconClockHour4 } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import useApp from '../../../../providers/App/useApp';
import { useCancelContentReviewRequest } from '../hooks/useContentReviewRequests';
import classes from './PendingReviewBadge.module.css';

type Props = {
    request: ContentReviewRequest;
};

const PendingReviewBadge: FC<Props> = ({ request }) => {
    const { user } = useApp();
    const requestedAgo = useTimeAgo(new Date(request.createdAt));
    const { mutate: cancelRequest, isLoading: isCancelling } =
        useCancelContentReviewRequest(request.projectUuid);
    const isRequester = user.data?.userUuid === request.requestedBy.userUuid;

    return (
        <Popover position="bottom" withArrow shadow="md" withinPortal>
            <Popover.Target>
                <Badge
                    component="button"
                    color="yellow"
                    variant="light"
                    size="sm"
                    radius="sm"
                    tt="none"
                    fw={500}
                    leftSection={
                        <MantineIcon icon={IconClockHour4} size={12} />
                    }
                    className={classes.badge}
                >
                    Review pending
                </Badge>
            </Popover.Target>
            <Popover.Dropdown maw={280}>
                <Stack gap="xs">
                    <Text fz="sm">
                        {isRequester
                            ? 'You asked'
                            : `${request.requestedBy.firstName} ${request.requestedBy.lastName} asked`}{' '}
                        for a review {requestedAgo}. It will move to the shared
                        space once approved.
                    </Text>
                    <Anchor
                        component={Link}
                        to={getContentReviewRequestPath(
                            request.projectUuid,
                            request.uuid,
                        )}
                        fz="sm"
                    >
                        Open request
                    </Anchor>
                    {isRequester && (
                        <Button
                            variant="default"
                            size="xs"
                            loading={isCancelling}
                            onClick={() => cancelRequest(request.uuid)}
                        >
                            Cancel request
                        </Button>
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default PendingReviewBadge;
