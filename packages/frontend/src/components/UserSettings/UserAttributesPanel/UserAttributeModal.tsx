import { CreateUserAttribute, UserAttribute } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Modal,
    Select,
    Stack,
    Switch,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { FC, useEffect, useState } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import {
    useCreateUserAtributesMutation,
    useUpdateUserAtributesMutation,
} from '../../../hooks/useUserAttributes';
import MantineIcon from '../../common/MantineIcon';

const UserAttributeModal: FC<{
    opened: boolean;
    userAttribute?: UserAttribute;
    allUserAttributes: UserAttribute[];
    onClose: () => void;
}> = ({ opened, userAttribute, allUserAttributes, onClose }) => {
    const form = useForm<CreateUserAttribute>({
        initialValues: {
            name: userAttribute?.name || '',
            description: userAttribute?.description,
            users: userAttribute?.users || [],
            default: userAttribute?.default || null,
        },
    });
    const [inputError, setInputError] = useState<string | undefined>();
    const { mutate: createUserAttribute } = useCreateUserAtributesMutation();
    const { mutate: updateUserAttribute } = useUpdateUserAtributesMutation(
        userAttribute?.uuid,
    );
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        //Reset checked on edit
        setChecked(
            userAttribute?.default !== undefined &&
                userAttribute?.default !== null,
        );
    }, [userAttribute?.default]);

    const handleClose = () => {
        form.reset();
        setInputError(undefined);
        setChecked(false);
        if (onClose) onClose();
    };
    const handleSubmit = async (data: CreateUserAttribute) => {
        // Input validation
        if (!/^[a-z_][a-z0-9_]*$/.test(data.name)) {
            setInputError(
                `Invalid attribute name. Attribute name must contain only lowercase characters, '_' or numbers and it can't start with a number`,
            );
            return;
        }
        if (
            allUserAttributes.some(
                (attr) =>
                    attr.name === data.name &&
                    attr.uuid !== userAttribute?.uuid,
            )
        ) {
            setInputError(`Attribute with the same name already exists`);
            return;
        }

        const duplicatedUsers = data.users?.reduceRight(
            (acc, user, index) =>
                acc ||
                data.users?.some(
                    (otherUser, otherIndex) =>
                        index !== otherIndex &&
                        user.userUuid === otherUser.userUuid,
                ),
            false,
        );
        if (duplicatedUsers) {
            setInputError(`Duplicated users`);
            return;
        }
        if (userAttribute?.uuid) {
            await updateUserAttribute(data);
        } else {
            await createUserAttribute(data);
        }
        handleClose();
    };

    const { data: orgUsers } = useOrganizationUsers();
    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={
                <Title order={4}>
                    {userAttribute ? 'Update' : 'Add'} user attribute
                </Title>
            }
            size="lg"
        >
            <form
                name="add_user_attribute"
                onSubmit={form.onSubmit((values: CreateUserAttribute) =>
                    handleSubmit(values),
                )}
            >
                <Stack spacing="md">
                    <TextInput
                        name="name"
                        label="Attribute name"
                        placeholder="E.g. user_country"
                        required
                        {...form.getInputProps('name')}
                    />
                    <Text color="red" size="sm">
                        {inputError}
                    </Text>

                    <Textarea
                        name="description"
                        label="Description"
                        placeholder="E.g. The country where the user is querying data from."
                        {...form.getInputProps('description')}
                    />
                    <Stack spacing={0}>
                        <Text fw={500} mb={0}>
                            Default value
                        </Text>

                        <Group mt={0} h={36}>
                            <Switch
                                checked={checked}
                                onChange={(event) => {
                                    const isChecked =
                                        event.currentTarget.checked;
                                    setChecked(isChecked);
                                    if (!isChecked)
                                        form.setFieldValue('default', null);
                                }}
                            />
                            {checked && (
                                <TextInput
                                    name={`default`}
                                    placeholder="E.g. US"
                                    required
                                    {...form.getInputProps('default')}
                                />
                            )}
                        </Group>
                    </Stack>
                    <Stack>
                        <Text fw={500}>Assign to users</Text>

                        {form.values.users?.map((user, index) => {
                            return (
                                <Group key={index}>
                                    <Select
                                        sx={{ flexGrow: 1 }}
                                        label={
                                            index === 0
                                                ? 'User email'
                                                : undefined
                                        }
                                        name={`users.${index}.userUuid`}
                                        placeholder="E.g. test@lightdash.com"
                                        required
                                        searchable
                                        {...form.getInputProps(
                                            `users.${index}.userUuid`,
                                        )}
                                        data={
                                            orgUsers?.map((orgUser) => ({
                                                value: orgUser.userUuid,
                                                label: orgUser.email,
                                            })) || []
                                        }
                                    />

                                    <TextInput
                                        sx={{ flexGrow: 1 }}
                                        label={
                                            index === 0 ? 'Value' : undefined
                                        }
                                        name={`users.${index}.value`}
                                        placeholder="E.g. US"
                                        required
                                        {...form.getInputProps(
                                            `users.${index}.value`,
                                        )}
                                    />
                                    <ActionIcon
                                        mt={index === 0 ? 20 : undefined}
                                        color="red"
                                        variant="outline"
                                        onClick={() => {
                                            form.setFieldValue(
                                                'users',
                                                form.values.users.filter(
                                                    (_, i) => i !== index,
                                                ),
                                            );
                                        }}
                                    >
                                        <MantineIcon icon={IconTrash} />
                                    </ActionIcon>
                                </Group>
                            );
                        })}
                        <Button
                            w={200}
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            onClick={() => {
                                form.setFieldValue('users', [
                                    ...(form.values.users || []),
                                    { userUuid: '', value: '' },
                                ]);
                            }}
                        >
                            Add user
                        </Button>
                    </Stack>

                    <Group spacing="xs" position="right">
                        <Button
                            onClick={() => {
                                handleClose();
                            }}
                            variant="outline"
                        >
                            Cancel
                        </Button>
                        <Button type="submit">
                            {userAttribute ? 'Update' : 'Add'}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default UserAttributeModal;
