import { Button, Group, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Dispatch, FC, SetStateAction } from 'react';

type Props = {
    setIsCreatingCredentials: Dispatch<SetStateAction<boolean>>;
};

export const CreateCredentialsForm: FC<Props> = ({
    setIsCreatingCredentials,
}) => {
    const addCredentialsForm = useForm({
        initialValues: {
            name: '',
            username: '',
            password: '',
        },
    });
    return (
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
                            onClick={() => setIsCreatingCredentials(false)}
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
    );
};
