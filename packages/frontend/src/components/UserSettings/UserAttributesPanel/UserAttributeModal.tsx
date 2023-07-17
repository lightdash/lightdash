import { CreateOrgAttribute, OrgAttribute } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCircleX, IconPlus } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import {
    useUpdateUserAtributesMutation,
    useUserAtributesMutation,
} from '../../../hooks/useUserAttributes';
import MantineIcon from '../../common/MantineIcon';

const UserAttributeModal: FC<{
    opened: boolean;
    userAttribute?: OrgAttribute;
    onClose: () => void;
}> = ({ opened, userAttribute, onClose }) => {
    const form = useForm<CreateOrgAttribute>({
        initialValues: {
            name: userAttribute?.name || '',
            description: userAttribute?.description || undefined,
            users: userAttribute?.users || [],
        },
    });
    const [inputError, setInputError] = useState<string>();
    const { mutate: createUserAttribute } = useUserAtributesMutation();
    const { mutate: updateUserAttribute } = useUpdateUserAtributesMutation(
        userAttribute?.uuid,
    );
    const handleSubmit = async (data: CreateOrgAttribute) => {
        // Input validation
        if (!/^[a-z_][a-z0-9_]*$/.test(data.name)) {
            setInputError(
                `Invalid attribute name. Attribute name must contain only lowercase characters, '_' or numbers and it can't start with a number`,
            );
            return;
        }
        if (userAttribute?.uuid) {
            await updateUserAttribute(data);
        } else {
            await createUserAttribute(data);
        }
        form.reset();
        onClose();
    };
    const { data: orgUsers } = useOrganizationUsers();
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Title order={4}>
                    {userAttribute ? 'Update' : 'Add'} user attribute
                </Title>
            }
            size="lg"
        >
            <form
                name="invite_user"
                onSubmit={form.onSubmit((values: CreateOrgAttribute) =>
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
                    <Stack>
                        <Text fw={500}>Assing to users</Text>

                        {form.values.users?.length > 0 && (
                            <Group>
                                <Text w={200} fw={500}>
                                    User email
                                </Text>
                                <Text fw={500}>Value</Text>
                            </Group>
                        )}

                        {form.values.users?.map((user, index) => {
                            return (
                                <Group key={index}>
                                    <Select
                                        w={200}
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
                                        name={`users.${index}.value`}
                                        placeholder="E.g. US"
                                        required
                                        {...form.getInputProps(
                                            `users.${index}.value`,
                                        )}
                                    />
                                    <Button
                                        pr={5}
                                        leftIcon={
                                            <MantineIcon icon={IconCircleX} />
                                        }
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
                                    />
                                </Group>
                            );
                        })}
                        <Button
                            w={200}
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            onClick={() => {
                                form.setFieldValue('users', [
                                    ...(form.values.users || []),
                                    { userUuid: '', email: '', value: '' },
                                ]);
                            }}
                        >
                            Add user
                        </Button>
                    </Stack>

                    <Group spacing="xs" position="right" mt="md">
                        <Button
                            onClick={() => {
                                if (onClose) onClose();
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
