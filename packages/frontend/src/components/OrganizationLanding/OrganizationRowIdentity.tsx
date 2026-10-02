import { Avatar, Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';

export const OrganizationRowIdentity: FC<{
    displayName: string;
    detail: string;
}> = ({ displayName, detail }) => (
    <Group gap="sm" wrap="nowrap" miw={0}>
        <Avatar size="md" radius="xl" flex="none">
            {displayName[0]?.toUpperCase()}
        </Avatar>
        <Stack gap="two" miw={0}>
            <Text fw={600} truncate="end" title={displayName}>
                {displayName}
            </Text>
            <Text fz="xs" c="dimmed" truncate="end">
                {detail}
            </Text>
        </Stack>
    </Group>
);
