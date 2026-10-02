import { Anchor, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import useApp from '../../providers/App/useApp';

export const InviteFailureActions: FC = () => {
    const { health, user } = useApp();
    if (
        health.data?.isAuthenticated &&
        user.data &&
        !user.data.organizationUuid
    ) {
        return (
            <Text size="sm" c="dimmed">
                You can also{' '}
                <Anchor component={Link} to="/join-organization" inherit>
                    find an organization for your email domain
                </Anchor>
                .
            </Text>
        );
    }
    return (
        <Text size="sm" c="dimmed">
            You can also{' '}
            <Anchor component={Link} to="/login" inherit>
                sign in
            </Anchor>{' '}
            or{' '}
            <Anchor component={Link} to="/register" inherit>
                register
            </Anchor>{' '}
            to find an organization for your email domain.
        </Text>
    );
};
