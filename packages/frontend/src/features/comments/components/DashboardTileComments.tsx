import { Comment } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Loader,
    Popover,
    PopoverProps,
    Stack,
    Text,
    Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconMessage } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useApp } from '../../../providers/AppProvider';
import { useCreateComment, useGetComments } from '../hooks/useComments';
import { CommentDetail } from './CommentDetail';

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
    const commentForm = useForm<Pick<Comment, 'text' | 'replyTo'>>({
        initialValues: {
            text: '',
            replyTo: '',
        },
    });
    const { data: comments, isRefetching } = useGetComments(
        dashboardUuid,
        dashboardTileUuid,
    );
    const { mutateAsync, isLoading } = useCreateComment();

    const handleSubmit = commentForm.onSubmit(async ({ text }) => {
        await mutateAsync({
            projectUuid,
            dashboardUuid,
            dashboardTileUuid,
            text,
        });

        commentForm.reset();
    });

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

                commentForm.reset();
            }}
            onClose={() => {
                commentForm.reset();
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
                        <CommentDetail
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
                    <form onSubmit={handleSubmit}>
                        <Stack spacing="xs" mt="xs">
                            <Textarea
                                placeholder="Type your comment here..."
                                size="xs"
                                radius="sm"
                                {...commentForm.getInputProps('text')}
                            />

                            <Button
                                loading={isLoading}
                                disabled={commentForm.values.text === ''}
                                variant="default"
                                size="xs"
                                sx={{
                                    alignSelf: 'flex-end',
                                }}
                                type="submit"
                            >
                                Add comment
                            </Button>
                        </Stack>
                    </form>
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
