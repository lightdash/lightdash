import { Anchor, Stack, Text } from '@mantine/core';
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
            <Anchor component={Link} to="/join-organization">
                Find an organization for your email domain
            </Anchor>
        );
    }
    return (
        <Stack gap="xs">
            <Text>
                Sign in or register to find an organization for your email
                domain.
            </Text>
            <Anchor component={Link} to="/login">
                Sign in
            </Anchor>
            <Anchor component={Link} to="/register">
                Register
            </Anchor>
        </Stack>
    );
};
