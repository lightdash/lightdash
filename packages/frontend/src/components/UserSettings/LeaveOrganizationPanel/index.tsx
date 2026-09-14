import { OrganizationMemberRole } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { IconLogout } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { DeleteOrganizationPanel } from '../DeleteOrganizationPanel';
import { LeaveOrganizationModal } from './LeaveOrganizationModal';

export const LeaveOrganizationPanel: FC<{ showDeleteAction?: boolean }> = ({
    showDeleteAction = true,
}) => {
    const { user } = useApp();
    const { isInitialLoading: isOrganizationLoading, data: organization } =
        useOrganization();

    const isAdmin = user.data?.role === OrganizationMemberRole.ADMIN;

    // Only admins can list org users — non-admins skip this query.
    const { data: orgUsers, isInitialLoading: isOrgUsersLoading } =
        useOrganizationUsers({ enabled: isAdmin });

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
            Leave '{organization.name.trim() || 'Unnamed organization'}'
        </Button>
    );

    return (
        <Stack align="flex-end" gap="sm">
            {button}
            {isOnlyAdmin ? (
                <>
                    <Text fz="sm" c="dimmed" maw={360} ta="right">
                        {orgUsers?.length === 1
                            ? 'You are the only member. To leave, permanently delete this organization and its content.'
                            : 'You are the only admin. Add or promote another admin before leaving. To remove this workspace instead, delete the organization.'}
                    </Text>
                    {showDeleteAction &&
                        user.data.ability.can('delete', 'Organization') && (
                            <DeleteOrganizationPanel />
                        )}
                </>
            ) : null}

            <LeaveOrganizationModal
                opened={showModal}
                onClose={() => setShowModal(false)}
            />
        </Stack>
    );
};
