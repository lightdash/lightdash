import { Button, Collapse, Stack, Text } from '@mantine/core';
import { IconLockExclamation } from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from './MantineIcon';
import classes from './SignInExpiredState.module.css';

export const SignInExpiredState = ({ details }: { details: string }) => {
    const [showDetails, setShowDetails] = useState(false);
    return (
        <Stack align="center" gap="xs" p="md">
            <MantineIcon icon={IconLockExclamation} size="lg" color="dimmed" />
            <Text fw={500}>Sign-in expired</Text>
            <Button
                variant="subtle"
                size="xs"
                onClick={() => setShowDetails((value) => !value)}
                aria-expanded={showDetails}
            >
                {showDetails ? 'Hide details' : 'Show details'}
            </Button>
            <Collapse expanded={showDetails}>
                <Text size="xs" c="dimmed" className={classes.details}>
                    {details}
                </Text>
            </Collapse>
        </Stack>
    );
};
