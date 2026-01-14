import {
    ProjectMemberRole,
    type CreateProjectGroupAccess,
    type GroupWithMembers,
} from '@lightdash/common';
import { Box, Button, Group, Select, Text } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconUsersGroup } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { TrackPage } from '../../../providers/Tracking/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../../types/Events';

type RoleItem = { value: string; label: string };
type GroupedRoles = { group: string; items: RoleItem[] }[];

interface AddProjectGroupAccessModalProps
    extends Pick<MantineModalProps, 'onClose'> {
    projectUuid: string;
    isSubmitting: boolean;
    totalNumberOfGroups: number;
    availableGroups: GroupWithMembers[];
    organizationRoles: GroupedRoles;
    onSubmit: (formData: CreateProjectGroupAccess) => void;
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
    // Flatten roles to find default value
    const allRoles = organizationRoles?.flatMap((group) => group.items) ?? [];
    const defaultRole =
        allRoles.find((role) => role.value === ProjectMemberRole.VIEWER)
            ?.value ||
        allRoles[0]?.value ||
        ProjectMemberRole.VIEWER;

    const form = useForm<FormData>({
        initialValues: {
            projectUuid,
            groupUuid: '',
            role: defaultRole,
        },
        validate: {
            groupUuid: (value) => (value ? null : 'Group is required'),
            role: (value) => (value ? null : 'Role is required'),
        },
    });

    const handleSubmit = (formData: FormData) => {
        onSubmit(formData as CreateProjectGroupAccess);
    };

    const hasNoAvailableGroups = availableGroups.length === 0;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Add group access"
            icon={IconUsersGroup}
            cancelLabel={hasNoAvailableGroups ? false : 'Cancel'}
            actions={
                !hasNoAvailableGroups ? (
                    <Button
                        type="submit"
                        form="add-project-group-access"
                        disabled={isSubmitting}
                    >
                        Give access
                    </Button>
                ) : undefined
            }
        >
            <TrackPage
                name={PageName.PROJECT_ADD_GROUP_ACCESS}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                {hasNoAvailableGroups ? (
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
                        id="add-project-group-access"
                        onSubmit={form.onSubmit(handleSubmit)}
                    >
                        <Group align="flex-end" gap="xs">
                            <Select
                                name="groupUuid"
                                label="Select group"
                                placeholder="Click here to select group"
                                searchable
                                required
                                data={
                                    availableGroups.map((group) => ({
                                        value: group.uuid,
                                        label: group.name,
                                    })) ?? []
                                }
                                {...form.getInputProps('groupUuid')}
                                style={{ flexGrow: 1 }}
                            />
                            <Select
                                data={organizationRoles}
                                required
                                label="Role"
                                placeholder="Select role"
                                {...form.getInputProps('role')}
                            />
                        </Group>
                    </form>
                )}
            </TrackPage>
        </MantineModal>
    );
};

export default AddProjectGroupAccessModal;
