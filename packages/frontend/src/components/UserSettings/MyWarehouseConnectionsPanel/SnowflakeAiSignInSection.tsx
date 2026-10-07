import {
    UserWarehouseCredentialPurpose,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { useSnowflakeAiLoginPopup } from '../../../hooks/useSnowflake';
import MantineIcon from '../../common/MantineIcon';
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
                <Title order={5}>Snowflake agent sign-in</Title>
                <Text c="dimmed" fz="sm">
                    AI agents and MCP use this separate Snowflake sign-in.
                </Text>
                <Group gap="sm">
                    {credential ? (
                        <Group gap="xs">
                            <MantineIcon
                                icon={IconCheck}
                                color="green"
                                size={16}
                            />
                            <Text fz="sm">
                                Signed in for agent sessions since{' '}
                                {new Date(
                                    credential.createdAt,
                                ).toLocaleDateString()}
                            </Text>
                        </Group>
                    ) : (
                        <Text fz="sm">Not signed in</Text>
                    )}
                    {credential ? (
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() => setIsRemoving(true)}
                        >
                            Sign out
                        </Button>
                    ) : (
                        <Button
                            size="xs"
                            onClick={() => login.mutate()}
                            loading={login.isLoading}
                        >
                            Sign in for agent sessions
                        </Button>
                    )}
                </Group>
                {!credential && login.error && (
                    <Text c="red" fz="sm" role="alert">
                        {login.error.message}
                    </Text>
                )}
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
