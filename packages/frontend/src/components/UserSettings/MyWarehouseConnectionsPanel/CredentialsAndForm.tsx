import {
    ActionIcon,
    Button,
    Collapse,
    Group,
    PasswordInput,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconEdit, IconEditOff, IconTrash } from '@tabler/icons-react';
import { Dispatch, FC, SetStateAction } from 'react';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    credential: {
        name: string;
        username: string;
    };
    isCreatingCredentials: boolean;
    isEditingWarehouseCredentials: boolean;
    setIsEditingWarehouseCredentials: Dispatch<SetStateAction<boolean>>;
    setIsDeletingWarehouseCredentials: Dispatch<
        SetStateAction<string | undefined>
    >;
};

const EditCredentialsForm: FC<
    Pick<Props, 'credential' | 'setIsEditingWarehouseCredentials'>
> = ({ credential, setIsEditingWarehouseCredentials }) => {
    const form = useForm({
        initialValues: {
            name: credential.name,
            username: credential.username,
            password: '', // TODO: Keep empty
        },
    });
    return (
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
                    onClick={() => setIsEditingWarehouseCredentials(false)}
                >
                    Cancel
                </Button>

                <Button size="xs" type="submit">
                    Save
                </Button>
            </Group>
        </form>
    );
};

export const CredentialsAndForm: FC<Props> = ({
    credential,
    isCreatingCredentials,
    isEditingWarehouseCredentials,
    setIsEditingWarehouseCredentials,
    setIsDeletingWarehouseCredentials,
}) => (
    <>
        <Group position="apart">
            <Text fw={500}>{credential.name}</Text>
            <Group spacing="xs">
                <ActionIcon
                    disabled={isCreatingCredentials}
                    onClick={() =>
                        setIsEditingWarehouseCredentials((prev) => !prev)
                    }
                >
                    <MantineIcon
                        icon={
                            isEditingWarehouseCredentials
                                ? IconEditOff
                                : IconEdit
                        }
                    />
                </ActionIcon>
                <ActionIcon
                    disabled={
                        isCreatingCredentials || isEditingWarehouseCredentials
                    }
                    onClick={() =>
                        setIsDeletingWarehouseCredentials(credential.name)
                    }
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Group>
        </Group>

        <Collapse in={isEditingWarehouseCredentials} pl="xs">
            <EditCredentialsForm
                credential={credential}
                setIsEditingWarehouseCredentials={
                    setIsEditingWarehouseCredentials
                }
            />
        </Collapse>
    </>
);
