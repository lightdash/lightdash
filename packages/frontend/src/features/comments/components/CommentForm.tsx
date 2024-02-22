import { Comment } from '@lightdash/common';
import {
    Autocomplete,
    AutocompleteItem,
    Avatar,
    Button,
    Grid,
    Group,
    Stack,
    Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAt } from '@tabler/icons-react';
import { FC, useMemo, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { getNameInitials } from '../utils';

type Props = {
    userName: string;
    onSubmit: (text: string) => Promise<null>;
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
    const commentForm = useForm<Pick<Comment, 'text' | 'replyTo'>>({
        initialValues: {
            text: '',
            replyTo: '',
        },
        validate: {
            text: (value) => {
                if (value.trim() === '') {
                    return 'Comment cannot be empty';
                }
                return null;
            },
        },
    });
    const { data: listUsers } = useOrganizationUsers();
    const userNames = useMemo(() => {
        return (
            listUsers?.map((user) => {
                return user.firstName + ' ' + user.lastName;
            }) || []
        );
    }, [listUsers]);
    const [message, setMessage] = useState<string>('');
    const [showUsers, setShowUsers] = useState(false);
    const handleSubmit = commentForm.onSubmit(async ({ text }) => {
        await onSubmit(text);

        commentForm.reset();
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
                        <Textarea
                            placeholder={
                                mode === 'reply' ? 'Reply...' : 'Add comment...'
                            }
                            size="xs"
                            radius="sm"
                            autosize
                            {...commentForm.getInputProps('text')}
                            value={message}
                            onKeyUp={(event) => {
                                if (event.key === '@') {
                                    setShowUsers(true);
                                }
                            }}
                            onChange={(event) => {
                                setMessage(event.currentTarget.value);
                            }}
                        />

                        {showUsers && (
                            <Autocomplete
                                w={'75%'}
                                icon={<MantineIcon icon={IconAt} />}
                                zIndex={10}
                                placeholder="Choose user to mention"
                                autoFocus={true}
                                data={userNames}
                                onBlur={() => setShowUsers(false)}
                                onItemSubmit={(item: AutocompleteItem) => {
                                    setMessage(message + item.value + ' ');
                                    setShowUsers(false);
                                }}
                            ></Autocomplete>
                        )}
                    </Grid.Col>
                </Grid>
                <Group position="right" spacing="xs">
                    {onCancel && (
                        <Button
                            compact
                            disabled={commentForm.values.text === ''}
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
                        disabled={commentForm.values.text === ''}
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
