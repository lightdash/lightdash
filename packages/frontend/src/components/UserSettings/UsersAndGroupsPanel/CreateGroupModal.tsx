import { CreateGroup } from '@lightdash/common';
import {
    Button,
    Group,
    Loader,
    Modal,
    ModalProps,
    MultiSelect,
    Stack,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUsersGroup } from '@tabler/icons-react';
import React, { FC, useMemo } from 'react';
import { useGroupCreateMutation } from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';

const CreateGroupModal: FC<ModalProps> = ({ opened, onClose }) => {
    const form = useForm<CreateGroup>({
        initialValues: {
            name: '',
            members: [],
        },
        validate: {
            name: (value: string) =>
                value.trim().length ? null : 'Group name is required',
        },
    });
    const { user } = useApp();
    const { data: organizationUsers, isLoading: isLoadingUsers } =
        useOrganizationUsers();

    const { mutateAsync, isLoading } = useGroupCreateMutation();

    const users = useMemo(() => {
        if (organizationUsers === undefined) return [];
        return organizationUsers.map((u) => ({
            value: u.userUuid,
            label: u.email,
        }));
    }, [organizationUsers]);

    const handleSubmit = async (data: CreateGroup) => {
        await mutateAsync(data);
        form.reset();
        onClose();
    };

    if (user.data?.ability?.cannot('manage', 'Group')) {
        return null;
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconUsersGroup} />
                    <Title order={4}>Create group</Title>
                </Group>
            }
            size="lg"
        >
            <form
                name="create_group"
                onSubmit={form.onSubmit((values: CreateGroup) =>
                    handleSubmit(values),
                )}
            >
                <Stack>
                    <TextInput
                        label="Group name"
                        placeholder="Name of the new group"
                        required
                        w="100%"
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                    />
                    <MultiSelect
                        withinPortal
                        searchable
                        clearable
                        clearSearchOnChange
                        clearSearchOnBlur
                        label="Group members"
                        placeholder="Add users to this group"
                        nothingFound="No users found"
                        rightSection={isLoadingUsers && <Loader size="sm" />}
                        data={users}
                        value={
                            form?.values.members?.map((v) => v.userUuid) ?? []
                        }
                        onChange={(userIds) => {
                            console.log('add users', userIds);
                            form?.setValues({
                                members: userIds.map((userUuid) => ({
                                    userUuid,
                                })),
                            });
                        }}
                    />

                    <Button
                        disabled={isLoading}
                        type="submit"
                        sx={{ alignSelf: 'end' }}
                    >
                        Create group
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
};

export default CreateGroupModal;
