import {
    ProjectMemberRole,
    type CreateProjectGroupAccess,
    type GroupWithMembers,
} from '@lightdash/common';
import { Box, Button, Group, Modal, Select, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUsersGroup } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { TrackPage } from '../../../providers/Tracking/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../../types/Events';

interface AddProjectGroupAccessModalProps {
    projectUuid: string;
    isSubmitting: boolean;
    totalNumberOfGroups: number;
    availableGroups: GroupWithMembers[];
    organizationRoles: { value: string; label: string; group: string }[];
    onSubmit: (formData: CreateProjectGroupAccess) => void;
    onClose: () => void;
}
type FormData = {
    projectUuid: string;
    groupUuid: string;
    role: string;
};
const AddProjectGroupAccessModal: FC<AddProjectGroupAccessModalProps> = ({
    projectUuid,
    isSubmitting,
    totalNumberOfGroups,
    availableGroups,
    organizationRoles,
    onSubmit,
    onClose,
}) => {
    const defaultRole =
        organizationRoles?.find(
            (role) => role.value === ProjectMemberRole.VIEWER,
        )?.value ||
        organizationRoles?.[0]?.value ||
        ProjectMemberRole.VIEWER;

    const form = useForm<FormData>({
        initialValues: {
            projectUuid,
            groupUuid: '',
            role: defaultRole,
        },
    });

    const handleSubmit = (formData: FormData) => {
        onSubmit(formData as CreateProjectGroupAccess);
    };

    return (
        <Modal
            opened
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
                {availableGroups.length === 0 ? (
                    <Box mb="lg">
                        <SuboptimalState
                            icon={IconUsersGroup}
                            title="No groups available"
                            description={
                                totalNumberOfGroups ? (
                                    "You've already given access to all groups"
                                ) : (
                                    <Text w="70%">
                                        Your organization doesn't have any
                                        groups yet. Go to{' '}
                                        <Text span fw={500}>
                                            "Organization settings" &gt; "Users
                                            & Groups"{' '}
                                        </Text>{' '}
                                        to create a group
                                    </Text>
                                )
                            }
                        />
                    </Box>
                ) : (
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
                                data={
                                    availableGroups.map((group) => ({
                                        value: group.uuid,
                                        label: group.name,
                                    })) ?? []
                                }
                                {...form.getInputProps('groupUuid')}
                                sx={{ flexGrow: 1 }}
                            />
                            <Select
                                data={organizationRoles}
                                required
                                placeholder="Select role"
                                dropdownPosition="bottom"
                                withinPortal
                                {...form.getInputProps('role')}
                            />

                            <Button disabled={isSubmitting} type="submit">
                                Give access
                            </Button>
                        </Group>
                    </form>
                )}
            </TrackPage>
        </Modal>
    );
};

export default AddProjectGroupAccessModal;
