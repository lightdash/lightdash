import { Button, Group, Text } from '@mantine/core';

export const SignInStep = ({
    signedIn,
    loading,
    onSignIn,
}: {
    signedIn: boolean;
    loading: boolean;
    onSignIn: () => void;
}) => (
    <Group>
        <Text fz="sm">{signedIn ? 'Signed in' : 'Not signed in'}</Text>
        <Button size="xs" onClick={onSignIn} loading={loading}>
            Sign in to Snowflake for AI
        </Button>
    </Group>
);
