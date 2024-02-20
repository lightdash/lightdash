import {
    ActionIcon,
    Loader,
    Popover,
    PopoverProps,
    Stack,
    Text,
} from '@mantine/core';
import { IconMessage } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useApp } from '../../../providers/AppProvider';
import { useCreateComment, useGetComments } from '../hooks/useComments';
import { CommentForm } from './CommentForm';
import { DashboardCommentAndReplies } from './DashboardCommentAndReplies';

type Props = {
    projectUuid: string;
    dashboardUuid: string;
    dashboardTileUuid: string;
};

export const DashboardTileComments: FC<
    Props & Pick<PopoverProps, 'opened' | 'onClose' | 'onOpen'>
> = ({
    projectUuid,
    dashboardTileUuid,
    dashboardUuid,
    opened,
    onClose,
    onOpen,
}) => {
    const { user } = useApp();
    const useCanManageDashboardComments = user.data?.ability?.can(
        'manage',
        'DashboardComments',
    );

    const { data: comments, isRefetching } = useGetComments(
        dashboardUuid,
        dashboardTileUuid,
    );
    const { mutateAsync, isLoading } = useCreateComment();

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
                onOpen?.();
            }}
            onClose={() => {
                onClose?.();
            }}
        >
            <Popover.Dropdown miw={400}>
                <Stack
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
                    {!useCanManageDashboardComments &&
                        (!comments ||
                            (comments.length === 0 && (
                                <Text fz="xs">No comments yet</Text>
                            )))}
                </Stack>
                {useCanManageDashboardComments && (
                    <CommentForm
                        userName={
                            user.data?.firstName + ' ' + user.data?.lastName
                        }
                        onSubmit={(text: string) =>
                            mutateAsync({
                                projectUuid,
                                dashboardUuid,
                                dashboardTileUuid,
                                text,
                            })
                        }
                        isSubmitting={isLoading}
                    />
                )}
            </Popover.Dropdown>

            <Popover.Target>
                <ActionIcon
                    size="sm"
                    onClick={() => (opened ? onClose?.() : onOpen?.())}
                >
                    {isRefetching ? (
                        <Loader size="xs" />
                    ) : (
                        <MantineIcon icon={IconMessage} />
                    )}
                </ActionIcon>
            </Popover.Target>
        </Popover>
    );
};
