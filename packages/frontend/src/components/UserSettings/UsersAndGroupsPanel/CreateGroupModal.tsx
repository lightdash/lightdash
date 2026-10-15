import {
    type CreateGroup,
    type GroupWithMembers,
    type UpdateGroupWithMembers,
} from '@lightdash/common';
import { Button, Loader, MultiSelect, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUsersGroup } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useGroupCreateMutation,
    useGroupUpdateMutation,
} from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import useApp from '../../../providers/App/useApp';
import MantineModal from '../../common/MantineModal';

type CreateGroupModalProps = {
    opened: boolean;
    onClose: () => void;
    isEditing?: boolean;
    groupToEdit?: GroupWithMembers;
};

const CreateGroupModal: FC<CreateGroupModalProps> = ({
    opened,
    onClose,
    isEditing,
    groupToEdit,
}) => {
    const { t } = useTranslation('userSettings');
    const form = useForm<CreateGroup>({
        initialValues: {
            name: groupToEdit?.name ?? '',
            members: groupToEdit?.members ?? [],
        },
        validate: {
            name: (value: string) =>
                value.trim().length
                    ? null
                    : t('usersAndGroupsPanel.createGroupModal.nameRequired'),
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
        await mutateAsyncUpdateGroup({
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
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={
                isEditing
                    ? t('usersAndGroupsPanel.createGroupModal.editingTitle', {
                          name: groupToEdit?.name,
                      })
                    : t('usersAndGroupsPanel.createGroupModal.createGroup')
            }
            icon={IconUsersGroup}
            size="lg"
            actions={
                <Button
                    disabled={isLoading || !form.isDirty()}
                    type="submit"
                    form="create_edit_group"
                >
                    {isEditing
                        ? t('actions.save', { ns: 'common' })
                        : t('usersAndGroupsPanel.createGroupModal.createGroup')}
                </Button>
            }
        >
            <form
                id="create_edit_group"
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
                        label={t(
                            'usersAndGroupsPanel.createGroupModal.nameLabel',
                        )}
                        placeholder={t(
                            'usersAndGroupsPanel.createGroupModal.namePlaceholder',
                        )}
                        required
                        w="100%"
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                    />
                    <MultiSelect
                        comboboxProps={{
                            withinPortal: true,
                            position: 'bottom',
                        }}
                        searchable
                        label={t(
                            'usersAndGroupsPanel.createGroupModal.membersLabel',
                        )}
                        placeholder={t(
                            'usersAndGroupsPanel.createGroupModal.membersPlaceholder',
                        )}
                        nothingFoundMessage={t(
                            'usersAndGroupsPanel.createGroupModal.noUsersFound',
                        )}
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
                </Stack>
            </form>
        </MantineModal>
    );
};

export default CreateGroupModal;
