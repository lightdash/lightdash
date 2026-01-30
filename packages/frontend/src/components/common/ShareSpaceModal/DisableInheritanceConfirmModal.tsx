import { type SpaceShare } from '@lightdash/common';
import { Avatar, Group, List, Stack, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../MantineModal';
import { getInitials, getUserNameOrEmail } from './Utils';

interface DisableInheritanceConfirmModalProps {
    opened: boolean;
    onClose: () => void;
    onConfirm: () => void;
    inheritedPermissions: SpaceShare[];
    inheritanceSource: string;
    isLoading?: boolean;
}

const DisableInheritanceConfirmModal: FC<
    DisableInheritanceConfirmModalProps
> = ({
    opened,
    onClose,
    onConfirm,
    inheritedPermissions,
    inheritanceSource,
    isLoading = false,
}) => {
    const hasInheritedPermissions = inheritedPermissions.length > 0;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Switch to explicit permissions?"
            icon={IconArrowRight}
            size="md"
            onConfirm={onConfirm}
            confirmLabel="Switch to Explicit"
            confirmLoading={isLoading}
            confirmDisabled={isLoading}
        >
            <Stack spacing="md">
                <Text fz="sm">
                    Turning off inheritance will stop this space from
                    automatically receiving permission changes from{' '}
                    {inheritanceSource}.
                </Text>

                {hasInheritedPermissions ? (
                    <>
                        <Text fz="sm">
                            The following inherited permissions will be copied
                            as direct permissions on this space:
                        </Text>
                        <List spacing="xs" size="sm" withPadding>
                            {inheritedPermissions
                                .slice(0, 5)
                                .map((permission) => (
                                    <List.Item key={permission.userUuid}>
                                        <Group spacing="xs">
                                            <Avatar
                                                size="xs"
                                                radius="xl"
                                                color="blue"
                                            >
                                                {getInitials(
                                                    permission.userUuid,
                                                    permission.firstName,
                                                    permission.lastName,
                                                    permission.email,
                                                )}
                                            </Avatar>
                                            <Text span fz="sm">
                                                {getUserNameOrEmail(
                                                    permission.userUuid,
                                                    permission.firstName,
                                                    permission.lastName,
                                                    permission.email,
                                                )}
                                            </Text>
                                            <Text span fz="sm" c="ldGray.6">
                                                ({permission.role})
                                            </Text>
                                            {permission.inheritedFrom && (
                                                <Text span fz="xs" c="ldGray.5">
                                                    - from{' '}
                                                    {permission.inheritedFrom}
                                                </Text>
                                            )}
                                        </Group>
                                    </List.Item>
                                ))}
                            {inheritedPermissions.length > 5 && (
                                <List.Item>
                                    <Text fz="sm" c="ldGray.6">
                                        ...and {inheritedPermissions.length - 5}{' '}
                                        more
                                    </Text>
                                </List.Item>
                            )}
                        </List>
                        <Text fz="sm" c="ldGray.6">
                            You can modify these permissions after switching.
                        </Text>
                    </>
                ) : (
                    <Text fz="sm" c="ldGray.6">
                        This space has no inherited permissions to copy.
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};

export default DisableInheritanceConfirmModal;
