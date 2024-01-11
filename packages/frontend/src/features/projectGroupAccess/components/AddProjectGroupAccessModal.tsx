import { CreateProjectGroupAccess, ProjectMemberRole } from '@lightdash/common';
import { Button, Group, Modal, ModalProps, Select, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUsersGroup } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useToaster from '../../../hooks/toaster/useToaster';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { TrackPage } from '../../../providers/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../../types/Events';
import { useAddProjectGroupAccessMutation } from '../hooks/useProjectGroupAccess';

interface AddProjectGroupAccessModalProps extends ModalProps {
    projectUuid: string;
}

const AddProjectGroupAccessModal: FC<AddProjectGroupAccessModalProps> = ({
    opened,
    onClose,
    projectUuid,
}) => {
    const { showToastSuccess } = useToaster();
    const { data: organizationGroups, isLoading } = useOrganizationGroups();

    const { mutateAsync: addProjectGroupAccess, isLoading: isSubmitting } =
        useAddProjectGroupAccessMutation();

    const form = useForm<CreateProjectGroupAccess>({
        initialValues: {
            projectUuid,
            groupUuid: '',
            role: ProjectMemberRole.VIEWER,
        },
    });

    const handleSubmit = async (formData: CreateProjectGroupAccess) => {
        await addProjectGroupAccess(formData);
        showToastSuccess({ title: 'Group access added' });
        onClose();
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconUsersGroup} />
                    <Title order={4}>Add group access</Title>
                </Group>
            }
            size="lg"
        >
            <TrackPage
                name={PageName.PROJECT_ADD_GROUP_ACCESS}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                <form
                    name="add_project_group_access"
                    onSubmit={form.onSubmit(handleSubmit)}
                >
                    <Group align="flex-end" spacing="xs">
                        <Select
                            name="groupUuid"
                            withinPortal
                            label="Select group"
                            placeholder="Click here to select group"
                            nothingFound="No groups found"
                            searchable
                            required
                            disabled={isLoading}
                            data={
                                organizationGroups?.map((group) => ({
                                    value: group.uuid,
                                    label: group.name,
                                })) ?? []
                            }
                            {...form.getInputProps('groupUuid')}
                            sx={{ flexGrow: 1 }}
                        />
                        <Select
                            data={Object.values(ProjectMemberRole).map(
                                (orgMemberRole) => ({
                                    value: orgMemberRole,
                                    label: orgMemberRole.replace('_', ' '),
                                }),
                            )}
                            disabled={isLoading}
                            required
                            placeholder="Select role"
                            dropdownPosition="bottom"
                            withinPortal
                            {...form.getInputProps('role')}
                        />

                        <Button
                            disabled={isLoading || isSubmitting}
                            type="submit"
                        >
                            Give access
                        </Button>
                    </Group>
                </form>
            </TrackPage>
        </Modal>
    );
};

export default AddProjectGroupAccessModal;
