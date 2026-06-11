import { FeatureFlags, OrganizationMemberRole } from '@lightdash/common';
import { Box, Button, Group, Tooltip } from '@mantine-8/core';
import { IconLogout } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { LeaveOrganizationModal } from './LeaveOrganizationModal';

export const LeaveOrganizationPanel: FC = () => {
    const { user } = useApp();
    const { isInitialLoading: isOrganizationLoading, data: organization } =
        useOrganization();

    const { data: leaveOrganizationFlag } = useServerFeatureFlag(
        FeatureFlags.LeaveOrganization,
    );
    const isLeaveOrganizationEnabled = leaveOrganizationFlag?.enabled === true;

    const isAdmin = user.data?.role === OrganizationMemberRole.ADMIN;

    // Only admins can list org users — non-admins skip this query.
    const { data: orgUsers, isInitialLoading: isOrgUsersLoading } =
        useOrganizationUsers({
            enabled: isAdmin && isLeaveOrganizationEnabled,
        });

    const [showModal, setShowModal] = useState(false);

    const isOnlyAdmin = useMemo(() => {
        if (!isAdmin || !orgUsers) return false;
        const admins = orgUsers.filter(
            (member) => member.role === OrganizationMemberRole.ADMIN,
        );
        return (
            admins.length === 1 && admins[0].userUuid === user.data?.userUuid
        );
    }, [isAdmin, orgUsers, user.data?.userUuid]);

    if (!isLeaveOrganizationEnabled) return null;
    if (isOrganizationLoading || !organization || !user.data) return null;
    if (isAdmin && isOrgUsersLoading) return null;

    const button = (
        <Button
            variant="outline"
            color="red"
            leftSection={<MantineIcon icon={IconLogout} />}
            onClick={() => setShowModal(true)}
            disabled={isOnlyAdmin}
        >
            Leave '{organization.name}'
        </Button>
    );

    return (
        <Group justify="flex-end">
            {isOnlyAdmin ? (
                <Tooltip
                    label="You are the only admin in this organization. Promote another member to admin before leaving."
                    multiline
                    w={260}
                    withArrow
                >
                    <Box>{button}</Box>
                </Tooltip>
            ) : (
                button
            )}

            <LeaveOrganizationModal
                opened={showModal}
                onClose={() => setShowModal(false)}
            />
        </Group>
    );
};
