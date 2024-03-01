import {
    ActionIcon,
    Box,
    Divider,
    Popover,
    PopoverProps,
    Stack,
    Text,
} from '@mantine/core';
import { IconMessage } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useApp } from '../../../providers/AppProvider';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useCreateComment } from '../hooks/useComments';
import { CommentForm } from './CommentForm';
import { DashboardCommentAndReplies } from './DashboardCommentAndReplies';

type Props = {
    dashboardTileUuid: string;
};

export const DashboardTileComments: FC<
    Props & Pick<PopoverProps, 'opened' | 'onClose' | 'onOpen'>
> = ({ dashboardTileUuid, opened, onClose, onOpen }) => {
    const { user } = useApp();
    const { track } = useTracking();

    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const userCanManageDashboardComments = useDashboardContext(
        (c) => c.dashboardCommentsCheck?.userCanManageDashboardComments,
    );
    const comments = useDashboardContext(
        (c) => c.dashboardComments && c.dashboardComments[dashboardTileUuid],
    );

    const { mutateAsync, isLoading } = useCreateComment();

    if (!projectUuid || !dashboardUuid) {
        return null;
    }

    return (
        <Popover
            withArrow
            withinPortal
            shadow="md"
            position="bottom-end"
            offset={4}
            arrowOffset={10}
            opened={opened}
            onOpen={() => {
                track({
                    name: EventName.COMMENTS_CLICKED,
                    properties: {
                        dashboardUuid,
                        dashboardTileUuid,
                    },
                });
                onOpen?.();
            }}
            onClose={() => {
                onClose?.();
            }}
        >
            <Popover.Dropdown p={0} miw={400}>
                <Stack
                    p="sm"
                    spacing="xs"
                    sx={{
                        maxHeight: 300,
                        overflowY: 'auto',
                    }}
                >
                    {comments?.map((comment) => (
                        <DashboardCommentAndReplies
                            key={comment.commentId}
                            comment={comment}
                            projectUuid={projectUuid}
                            dashboardUuid={dashboardUuid}
                            dashboardTileUuid={dashboardTileUuid}
                        />
                    ))}
                    {!userCanManageDashboardComments &&
                        (!comments || comments.length === 0) && (
                            <Text fz="xs">No comments yet</Text>
                        )}
                </Stack>
                <Divider />
                <Box p="sm" pt="xs">
                    {userCanManageDashboardComments && (
                        <CommentForm
                            userName={
                                user.data?.firstName + ' ' + user.data?.lastName
                            }
                            onSubmit={(
                                text: string,
                                textHtml: string,
                                mentions: string[],
                            ) =>
                                mutateAsync({
                                    projectUuid,
                                    dashboardUuid,
                                    dashboardTileUuid,
                                    text,
                                    textHtml,
                                    mentions,
                                })
                            }
                            isSubmitting={isLoading}
                        />
                    )}
                </Box>
            </Popover.Dropdown>

            <Popover.Target>
                <ActionIcon
                    size="sm"
                    onClick={() => (opened ? onClose?.() : onOpen?.())}
                >
                    <MantineIcon icon={IconMessage} />
                </ActionIcon>
            </Popover.Target>
        </Popover>
    );
};
