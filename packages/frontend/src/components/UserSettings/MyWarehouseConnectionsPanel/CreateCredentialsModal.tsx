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

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

export const CreateCredentialsModal: FC<Props> = ({ opened, onClose }) => {
    const addCredentialsForm = useForm({
        initialValues: {
            name: '',
            username: '',
            password: '',
        },
    });
    return (
        <Modal
            title={<Title order={4}>Add new credentials</Title>}
            opened={opened}
            onClose={onClose}
        >
            <Stack>
                <Stack spacing="xs">
                    <form
                        onSubmit={() =>
                            addCredentialsForm.onSubmit((values) => {
                                // TODO: Save credentials to database
                                return values;
                            })
                        }
                    >
                        <TextInput required size="xs" label="Name" />
                        <TextInput required size="xs" label="Username/email" />
                        <PasswordInput required size="xs" label="Password" />
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
