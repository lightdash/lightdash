import { Badge, Group } from '@mantine/core';
import { type FC } from 'react';

export const RequestLogStatusBadges: FC<{
    status: number;
    scimType: string | null;
}> = ({ status, scimType }) => (
    <Group gap="xs" wrap="nowrap">
        <Badge variant="light" color={status < 400 ? 'green' : 'red'}>
            {status}
        </Badge>
        {scimType && (
            <Badge variant="light" color="orange">
                {scimType}
            </Badge>
        )}
    </Group>
);
