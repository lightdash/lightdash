import { type SharedSignInExpiry } from '@lightdash/common';
import { Anchor, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import useApp from '../../../providers/App/useApp';

export const SharedSignInExpiredMessage: FC<{
    message: string;
    expiry: SharedSignInExpiry;
    onNavigate?: () => void;
}> = ({ message, expiry, onNavigate }) => {
    const { user } = useApp();
    const { activeProjectUuid } = useActiveProjectUuid();
    const isOwner =
        !!expiry.ownerUserUuid && expiry.ownerUserUuid === user.data?.userUuid;

    return (
        <Stack gap={4} align="flex-start">
            <Text mb={0} fz="xs">
                {message}
            </Text>
            {isOwner && activeProjectUuid && (
                <Anchor
                    component={Link}
                    to={`/generalSettings/projectManagement/${activeProjectUuid}/settings`}
                    fz="xs"
                    fw={600}
                    onClick={onNavigate}
                >
                    Reconnect
                </Anchor>
            )}
        </Stack>
    );
};
