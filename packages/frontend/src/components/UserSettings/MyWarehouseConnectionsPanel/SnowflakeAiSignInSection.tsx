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
                <Title order={5}>Agent connection</Title>
                <Text c="dimmed" fz="sm">
                    AI agents and MCP use this connection to your Snowflake
                    warehouse.
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
                                Agent connected since{' '}
                                {new Date(
                                    credential.createdAt,
                                ).toLocaleDateString()}
                            </Text>
                        </Group>
                    ) : null}
                    {credential ? (
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() => setIsRemoving(true)}
                        >
                            Disconnect
                        </Button>
                    ) : (
                        <Button
                            size="xs"
                            onClick={() => login.mutate()}
                            loading={login.isLoading}
                        >
                            Connect agent
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
