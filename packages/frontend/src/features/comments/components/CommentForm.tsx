import { Comment } from '@lightdash/common';
import { Avatar, Button, Grid, Group, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { convertToRaw, EditorState } from 'draft-js';
import { FC, useMemo, useState } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { getNameInitials } from '../utils';
import { CommentMentionInput } from './CommentMentionInput';

import '@draft-js-plugins/mention/lib/plugin.css';

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
    const [editorState, setEditorState] = useState(() =>
        EditorState.createEmpty(),
    );
    const commentForm = useForm<Pick<Comment, 'replyTo'>>({
        initialValues: {
            replyTo: '',
        },
    });
    const [mentions, setMentions] = useState<string[]>([]);

    const { data: listUsers } = useOrganizationUsers();
    let userNames = useMemo(
        () =>
            listUsers?.map((user) => ({
                name: user.firstName + ' ' + user.lastName,
                id: user.userUuid,
            })) || [],

        [listUsers],
    );

    const handleSubmit = commentForm.onSubmit(async () => {
        const content = editorState.getCurrentContent();

        if (content.hasText()) {
            await onSubmit(
                JSON.stringify(convertToRaw(editorState.getCurrentContent())),
            );

            setEditorState(EditorState.createEmpty());
        }
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
                        {userNames && (
                            <CommentMentionInput
                                editorState={editorState}
                                setEditorState={setEditorState}
                                mentions={userNames}
                                placeholder={`${
                                    mode === 'reply' ? 'Reply' : 'Add comment'
                                } (type @ to mention someone)`}
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
