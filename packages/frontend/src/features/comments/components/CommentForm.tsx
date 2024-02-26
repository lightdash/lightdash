import { Comment } from '@lightdash/common';
import { Avatar, Button, Grid, Group, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC, useMemo, useState } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { SuggestionsItem } from '../types';
import { getNameInitials } from '../utils';
import { CommentWithMentions } from './CommentWithMentions';

type Props = {
    userName: string;
    onSubmit: (text: string, html: string, mentions: string[]) => Promise<null>;
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
    const [mentions, setMentions] = useState<string[]>([]);
    console.log({ mentions });

    const [commentText, setCommentText] = useState('');
    const [commentHtml, setCommentHtml] = useState('');
    const [shouldClearEditor, setShouldClearEditor] = useState(false);

    const commentForm = useForm<Pick<Comment, 'replyTo'>>({
        initialValues: {
            replyTo: '',
        },
    });

    const handleSubmit = commentForm.onSubmit(async () => {
        if (commentText === '') return;

        // get comment text - commentText
        // get comment html - commentHtml
        // get mentions - mentions
        // submit comment with these 3 values: text, html, mentions
        // await onSubmit(commentText);
        setShouldClearEditor(true);
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
                        {isSuccess && userNames && (
                            <CommentWithMentions
                                readonly={false}
                                setCommentText={setCommentText}
                                setCommentHtml={setCommentHtml}
                                suggestions={userNames}
                                shouldClearEditor={shouldClearEditor}
                                setShouldClearEditor={setShouldClearEditor}
                                setMentions={setMentions}
                            />
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
