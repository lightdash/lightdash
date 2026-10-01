import { type UserAllowedOrganization } from '@lightdash/common';
import { Button, Card, Group } from '@mantine/core';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import { useJoinOrganizationMutation } from '../../hooks/user/useJoinOrganizationMutation';
import {
    formatMemberCount,
    getOrganizationDisplayName,
} from './organizationLandingCopy';
import { OrganizationRowIdentity } from './OrganizationRowIdentity';

export const JoinableOrganizationCard: FC<{
    organization: UserAllowedOrganization;
}> = ({ organization }) => {
    const navigate = useNavigate();
    const joinOrganization = useJoinOrganizationMutation();
    const displayName = getOrganizationDisplayName(organization.name);

    return (
        <Card p="sm">
            <Group justify="space-between" wrap="nowrap">
                <OrganizationRowIdentity
                    displayName={displayName}
                    detail={formatMemberCount(organization.membersCount)}
                />
                <Button
                    flex="none"
                    loading={joinOrganization.isLoading}
                    onClick={() =>
                        joinOrganization.mutate(organization.organizationUuid, {
                            onSuccess: () => void navigate('/'),
                        })
                    }
                >
                    Join
                </Button>
            </Group>
        </Card>
    );
};
