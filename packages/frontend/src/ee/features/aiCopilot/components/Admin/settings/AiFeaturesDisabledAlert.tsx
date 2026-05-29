import { Alert, Text } from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { Link } from 'react-router';

export const AiFeaturesDisabledAlert = () => (
    <Alert
        icon={<IconInfoCircle />}
        radius="md"
        color="orange"
        variant="light"
        title="Ask AI features are currently disabled for all users"
    >
        <Text c="ldGray.7" size="xs">
            Re-enable them from{' '}
            <Text
                span
                component={Link}
                to="/generalSettings/ai/general"
                td="underline"
            >
                Ask AI · General
            </Text>{' '}
            so users can interact with agents again.
        </Text>
    </Alert>
);
