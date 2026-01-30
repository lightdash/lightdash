import { type Space } from '@lightdash/common';
import { Avatar, Group, Stack, Switch, Text, Tooltip } from '@mantine/core';
import {
    IconFolder,
    IconFolderOpen,
    IconInfoCircle,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useProject } from '../../../hooks/useProject';
import { useUpdateMutation } from '../../../hooks/useSpaces';
import MantineIcon from '../MantineIcon';
import DisableInheritanceConfirmModal from './DisableInheritanceConfirmModal';

interface ShareSpaceInheritanceToggleProps {
    space: Space;
    projectUuid: string;
}

export const ShareSpaceInheritanceToggle: FC<
    ShareSpaceInheritanceToggleProps
> = ({ space, projectUuid }) => {
    const { data: project } = useProject(projectUuid);
    const { mutate: updateSpace, isLoading } = useUpdateMutation(
        projectUuid,
        space.uuid,
    );
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);

    const isRootSpace = !space.parentSpaceUuid;
    const parentSpaceName =
        space.breadcrumbs && space.breadcrumbs.length > 1
            ? space.breadcrumbs[space.breadcrumbs.length - 2]?.name
            : null;

    const handleToggleChange = (checked: boolean) => {
        if (checked) {
            // Turning inheritance ON - just update
            updateSpace({
                name: space.name,
                inheritParentPermissions: true,
            });
        } else {
            // Turning inheritance OFF - show confirmation modal
            setConfirmModalOpen(true);
        }
    };

    const handleConfirmDisableInheritance = () => {
        updateSpace({
            name: space.name,
            inheritParentPermissions: false,
        });
        setConfirmModalOpen(false);
    };

    const inheritanceSource = isRootSpace
        ? `project "${project?.name ?? 'Project'}"`
        : `parent space "${parentSpaceName ?? 'Parent'}"`;

    return (
        <>
            <Group position="apart">
                <Group spacing="sm">
                    <Avatar
                        radius="xl"
                        color={
                            space.inheritParentPermissions ? 'blue' : 'orange'
                        }
                    >
                        <MantineIcon
                            icon={
                                space.inheritParentPermissions
                                    ? IconFolderOpen
                                    : IconFolder
                            }
                        />
                    </Avatar>

                    <Stack spacing={2}>
                        <Group spacing="xs">
                            <Text fw={600} fz="sm">
                                Inherit permissions
                            </Text>
                            <Tooltip
                                label={
                                    space.inheritParentPermissions
                                        ? `This space uses permissions from ${inheritanceSource}. Changes to parent permissions automatically apply here.`
                                        : 'This space has its own explicit permissions that you can customize independently.'
                                }
                                multiline
                                maw={300}
                                withinPortal
                            >
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    size={14}
                                    color="gray"
                                />
                            </Tooltip>
                        </Group>
                        <Text c="ldGray.6" fz="xs">
                            {space.inheritParentPermissions
                                ? `Permissions flow from ${inheritanceSource}`
                                : 'Using explicit permissions for this space'}
                        </Text>
                    </Stack>
                </Group>

                <Switch
                    checked={space.inheritParentPermissions}
                    onChange={(e) =>
                        handleToggleChange(e.currentTarget.checked)
                    }
                    disabled={isLoading}
                    size="md"
                />
            </Group>

            <DisableInheritanceConfirmModal
                opened={confirmModalOpen}
                onClose={() => setConfirmModalOpen(false)}
                onConfirm={handleConfirmDisableInheritance}
                inheritedPermissions={space.access.filter(
                    (a) => !a.hasDirectAccess,
                )}
                inheritanceSource={inheritanceSource}
                isLoading={isLoading}
            />
        </>
    );
};
