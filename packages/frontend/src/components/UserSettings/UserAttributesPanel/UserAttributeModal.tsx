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
import { IconTrash, IconUserPlus, IconUsersPlus } from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { FC, useEffect, useState } from 'react';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
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
    const isGroupsFeatureFlagEnabled =
        useFeatureFlagEnabled('group-management');
    const form = useForm<CreateUserAttribute>({
        initialValues: {
            name: userAttribute?.name || '',
            description: userAttribute?.description,
            users: userAttribute?.users || [],
            groups: userAttribute?.groups || [],
            attributeDefault: userAttribute?.attributeDefault || null,
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
            userAttribute?.attributeDefault !== undefined &&
                userAttribute?.attributeDefault !== null,
        );
    }, [userAttribute?.attributeDefault]);

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
    const { data: groups } = useOrganizationGroups(undefined, {
        enabled: !!isGroupsFeatureFlagEnabled,
    });

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
                <Stack spacing="xs">
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
                    <Stack spacing="xxs">
                        <Text fw={500}>Default value</Text>

                        <Group h={36}>
                            <Switch
                                checked={checked}
                                onChange={(event) => {
                                    const isChecked =
                                        event.currentTarget.checked;
                                    setChecked(isChecked);
                                    if (!isChecked)
                                        form.setFieldValue(
                                            'attributeDefault',
                                            null,
                                        );
                                }}
                            />
                            {checked && (
                                <TextInput
                                    size="xs"
                                    name={`attributeDefault`}
                                    placeholder="E.g. US"
                                    required
                                    {...form.getInputProps('attributeDefault')}
                                />
                            )}
                        </Group>
                    </Stack>
                    <Stack>
                        <Stack spacing="xs">
                            <Text fw={500}>Assign to users</Text>

                            {form.values.users?.map((user, index) => {
                                return (
                                    <Group key={index}>
                                        <Select
                                            size="xs"
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
                                            size="xs"
                                            sx={{ flexGrow: 1 }}
                                            label={
                                                index === 0
                                                    ? 'Value'
                                                    : undefined
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
                                size="xs"
                                variant="default"
                                sx={{ alignSelf: 'flex-start' }}
                                leftIcon={<MantineIcon icon={IconUserPlus} />}
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

                        {isGroupsFeatureFlagEnabled && (
                            <Stack spacing="xs">
                                <Text fw={500}>Assign to groups</Text>
                                {form.values.groups.map((group, index) => {
                                    return (
                                        <Group key={index}>
                                            <Select
                                                size="xs"
                                                sx={{ flexGrow: 1 }}
                                                label={
                                                    index === 0
                                                        ? 'Group name'
                                                        : undefined
                                                }
                                                name={`groups.${index}.groupUuid`}
                                                placeholder="E.g. Marketing, Product"
                                                required
                                                searchable
                                                {...form.getInputProps(
                                                    `groups.${index}.groupUuid`,
                                                )}
                                                data={
                                                    groups?.map(
                                                        (groupInfo) => ({
                                                            value: groupInfo.uuid,
                                                            label: groupInfo.name,
                                                        }),
                                                    ) || []
                                                }
                                            />

                                            <TextInput
                                                size="xs"
                                                sx={{ flexGrow: 1 }}
                                                label={
                                                    index === 0
                                                        ? 'Value'
                                                        : undefined
                                                }
                                                name={`groups.${index}.value`}
                                                placeholder="E.g. US"
                                                required
                                                {...form.getInputProps(
                                                    `groups.${index}.value`,
                                                )}
                                            />
                                            <ActionIcon
                                                mt={
                                                    index === 0 ? 20 : undefined
                                                }
                                                color="red"
                                                variant="outline"
                                                onClick={() => {
                                                    form.setFieldValue(
                                                        'groups',
                                                        form.values.groups.filter(
                                                            (_, i) =>
                                                                i !== index,
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
                                    size="xs"
                                    variant="default"
                                    sx={{ alignSelf: 'flex-start' }}
                                    leftIcon={
                                        <MantineIcon icon={IconUsersPlus} />
                                    }
                                    onClick={() => {
                                        form.insertListItem('groups', {
                                            groupUuid: '',
                                            value: '',
                                        });
                                    }}
                                >
                                    Add group
                                </Button>
                            </Stack>
                        )}
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
