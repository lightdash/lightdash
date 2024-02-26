import { Comment } from '@lightdash/common';
import { Avatar, Button, Grid, Group, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedState } from '@mantine/hooks';
import { FC, useMemo } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { SuggestionsItem } from '../types';
import { getNameInitials } from '../utils';
import {
    CommentWithMentions,
    useTipTapEditorWithMentions,
} from './CommentWithMentions';

type Props = {
    userName: string;
    onSubmit: (text: string, mentions: string[]) => Promise<null>;
    isSubmitting: boolean;
    onCancel?: () => void;
    mode?: 'reply' | 'new';
};

export const CommentForm: FC<Props> = ({
    userName,
    onSubmit,
    isSubmitting,
    onCancel,
    mode = 'new',
}) => {
    const { data: listUsers, isSuccess } = useOrganizationUsers();
    let userNames: SuggestionsItem[] = useMemo(
        () =>
            listUsers?.map((user) => ({
                label: user.firstName + ' ' + user.lastName,
                id: user.userUuid,
            })) || [],

        [listUsers],
    );
    const [commentText, setCommentText] = useDebouncedState('', 500);
    const editor = useTipTapEditorWithMentions({
        readonly: false,
        content: '',
        suggestions: userNames,
        setCommentText,
    });

    const commentForm = useForm<Pick<Comment, 'replyTo'>>({
        initialValues: {
            replyTo: '',
        },
    });
    const [mentions, setMentions] = useState<string[]>([]);

    const handleSubmit = commentForm.onSubmit(async () => {
        if (commentText === '') return;
        await onSubmit(commentText);
        editor?.commands.clearContent();
    });

    return (
        <form onSubmit={handleSubmit}>
            <Stack spacing="xs" mt="xs">
                <Grid columns={24}>
                    <Grid.Col span={2}>
                        <Avatar radius="xl" size="sm">
                            {getNameInitials(userName)}
                        </Avatar>
                    </Grid.Col>
                    <Grid.Col span={22}>
                        {editor && userNames && isSuccess && (
                            <CommentWithMentions editor={editor} />
                        )}
                    </Grid.Col>
                </Grid>
                <Group position="right" spacing="xs">
                    {onCancel && (
                        <Button
                            compact
                            variant="default"
                            size="xs"
                            onClick={onCancel}
                        >
                            Cancel
                        </Button>
                    )}

                    <Button
                        compact
                        loading={isSubmitting}
                        size="xs"
                        sx={{
                            alignSelf: 'flex-end',
                        }}
                        type="submit"
                    >
                        {mode === 'reply' ? 'Reply' : 'Add comment'}
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};
