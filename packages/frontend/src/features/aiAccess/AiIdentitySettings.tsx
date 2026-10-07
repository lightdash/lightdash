import {
    type AiAccessPolicy,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { Stack, Text, Title } from '@mantine/core';
import { type ReactNode } from 'react';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { SnowflakeIdentityCard } from './AiSnowflakeIdentity';
import { AiWarehouseSignals } from './AiWarehouseSignals';

export const AiIdentitySettings = ({
    projectUuid,
    connection,
    policy,
    capabilities,
    connectionSelector,
}: {
    projectUuid: string;
    connection: string | null;
    policy: AiAccessPolicy | null;
    capabilities: AiWarehouseCapabilities;
    connectionSelector: ReactNode;
}) => (
    <Stack gap="xl">
        <SnowflakeIdentityCard
            projectUuid={projectUuid}
            connection={connection}
            policy={policy}
            connectionSelector={connectionSelector}
        />
        <SettingsCard>
            <Stack>
                <Stack gap={4}>
                    <Title order={5}>In the warehouse</Title>
                    <Text c="dimmed" fz="xs">
                        Read the marker and manage the warehouse rules.
                    </Text>
                </Stack>
                <AiWarehouseSignals marker={capabilities.marker} />
            </Stack>
        </SettingsCard>
    </Stack>
);
