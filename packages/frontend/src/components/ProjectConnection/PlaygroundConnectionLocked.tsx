import { FeatureFlags } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import Callout from '../common/Callout';

export const PlaygroundConnectionLocked: FC = () => {
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const connectPath =
        connectJourneyFlag.data?.enabled === true
            ? '/onboarding/data-source'
            : '/createProject';

    return (
        <Callout variant="info" title="This project uses sample data">
            <Stack gap="sm" align="flex-start">
                <Text size="sm">
                    To use your own data, connect a warehouse. That creates a
                    new project, and this one stays as it is.
                </Text>
                <Button component={Link} to={connectPath} size="xs">
                    Connect a warehouse
                </Button>
            </Stack>
        </Callout>
    );
};
