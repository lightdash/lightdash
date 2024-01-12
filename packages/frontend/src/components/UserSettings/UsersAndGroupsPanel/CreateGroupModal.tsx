import {
    CreateGroup,
    GroupWithMembers,
    UpdateGroupWithMembers,
} from '@lightdash/common';
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
import {
    useGroupCreateMutation,
    useGroupUpdateMutation,
} from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';

const CreateGroupModal: FC<
    ModalProps & { isEditing?: boolean; groupToEdit?: GroupWithMembers }
> = ({ opened, onClose, isEditing, groupToEdit }) => {
    const form = useForm<CreateGroup>({
        initialValues: {
            name: groupToEdit?.name ?? '',
            members: groupToEdit?.members ?? [],
        },
        validate: {
            name: (value: string) =>
                value.trim().length ? null : 'Group name is required',
        },
    });

    const { user } = useApp();
    const { data: organizationUsers, isInitialLoading: isLoadingUsers } =
        useOrganizationUsers();

    const { mutateAsync: mutateAsyncCreateGroup, isLoading: isLoadingCreate } =
        useGroupCreateMutation();

    const { mutateAsync: mutateAsyncUpdateGroup, isLoading: isLoadingUpdate } =
        useGroupUpdateMutation();

    const handleSubmitCreate = async (data: CreateGroup) => {
        await mutateAsyncCreateGroup(data);
        form.reset();
        onClose();
    };

    const handleSubmitUpdate = async (
        data: UpdateGroupWithMembers & { uuid: string },
    ) => {
        mutateAsyncUpdateGroup({
            name: form.isDirty('name') ? data.name : undefined,
            members: form.isDirty('members') ? data.members : undefined,
            uuid: data.uuid,
        });
        form.reset();
        onClose();
    };

    const users = useMemo(() => {
        if (organizationUsers === undefined) return [];
        return organizationUsers.map((u) => ({
            value: u.userUuid,
            label: u.email,
        }));
    }, [organizationUsers]);

    if (user.data?.ability?.cannot('manage', 'Group')) {
        return null;
    }

    const isLoading = isLoadingCreate || isLoadingUpdate;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconUsersGroup} />
                    <Title order={4}>
                        {isEditing
                            ? `Editing ${groupToEdit?.name}`
                            : `Create group`}
                    </Title>
                </Group>
            }
            size="lg"
        >
            <form
                name="create_edit_group"
                onSubmit={form.onSubmit((values: CreateGroup) =>
                    isEditing && groupToEdit
                        ? handleSubmitUpdate({
                              ...values,
                              uuid: groupToEdit?.uuid,
                          })
                        : handleSubmitCreate(values),
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
                            form?.setValues({
                                members: userIds.map((userUuid) => ({
                                    userUuid,
                                })),
                            });
                        }}
                    />

                    <Button
                        disabled={isLoading || !form.isDirty()}
                        type="submit"
                        sx={{ alignSelf: 'end' }}
                    >
                        {isEditing ? 'Save' : 'Create group'}
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
};

export default CreateGroupModal;
