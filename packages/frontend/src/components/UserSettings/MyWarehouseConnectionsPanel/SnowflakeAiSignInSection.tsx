import {
    UserWarehouseCredentialPurpose,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useSnowflakeAiLoginPopup } from '../../../hooks/useSnowflake';
import { DeleteCredentialsModal } from './DeleteCredentialsModal';

export const SnowflakeAiSignInSection = ({
    credentials,
}: {
    credentials: UserWarehouseCredentials[];
}) => {
    const credential = credentials.find(
        ({ purpose }) => purpose === UserWarehouseCredentialPurpose.AI,
    );
    const login = useSnowflakeAiLoginPopup();
    const [isRemoving, setIsRemoving] = useState(false);
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>Snowflake sign-in for AI</Title>
                <Text c="dimmed" fz="sm">
                    AI agents and MCP use this separate Snowflake sign-in.
                </Text>
                <Group gap="sm">
                    <Text fz="sm">
                        {credential ? 'Signed in' : 'Not signed in'}
                    </Text>
                    <Button
                        size="xs"
                        onClick={() => login.mutate()}
                        loading={login.isLoading}
                    >
                        Sign in to Snowflake for AI
                    </Button>
                    {credential && (
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() => setIsRemoving(true)}
                        >
                            Remove
                        </Button>
                    )}
                </Group>
            </Stack>
            {credential && (
                <DeleteCredentialsModal
                    opened={isRemoving}
                    onClose={() => setIsRemoving(false)}
                    warehouseCredentialsToBeDeleted={credential}
                />
            )}
        </Paper>
    );
};
