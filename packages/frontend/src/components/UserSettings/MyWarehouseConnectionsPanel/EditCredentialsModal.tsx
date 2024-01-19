import {
    Button,
    Group,
    Modal,
    ModalProps,
    PasswordInput,
    Stack,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC } from 'react';
import { Credentials } from './types';

export const EditCredentialsModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'> & {
        credentials: Pick<Credentials, 'name' | 'username'>;
    }
> = ({ opened, onClose, credentials }) => {
    const form = useForm({
        initialValues: {
            name: credentials.name,
            username: credentials.username,
            password: '', // TODO: Keep empty
        },
    });
    return (
        <Modal
            title={<Title order={4}>Edit credentials</Title>}
            opened={opened}
            onClose={onClose}
        >
            <Stack>
                <Stack spacing="xs">
                    <form
                        onSubmit={
                            () => {
                                form.onSubmit(() => {});
                            }
                            // TODO: Edit credentials to database
                        }
                    >
                        <TextInput
                            required
                            size="xs"
                            label="Name"
                            {...form.getInputProps('name')}
                        />
                        <TextInput
                            required
                            size="xs"
                            label="Username/email"
                            {...form.getInputProps('username')}
                        />
                        <PasswordInput
                            required
                            size="xs"
                            label="Password"
                            {...form.getInputProps('password')}
                        />
                        <Group position="right" spacing="xs" mt="sm">
                            <Button
                                size="xs"
                                variant="outline"
                                color="dark"
                                onClick={onClose}
                            >
                                Cancel
                            </Button>

                            <Button size="xs" type="submit">
                                Save
                            </Button>
                        </Group>
                    </form>
                </Stack>
            </Stack>
        </Modal>
    );
};
