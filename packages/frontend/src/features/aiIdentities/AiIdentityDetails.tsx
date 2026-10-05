import { type AiIdentity } from '@lightdash/common';
import { Badge, Group, Table, Text } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import classes from './AiIdentitiesPage.module.css';
import { RelativeTime } from './AiIdentityEventDisplay';
import { AiIdentityStatusBadge } from './AiIdentityStatusBadge';

const DetailRow: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Table.Tr>
        <Table.Th w={150} fw={500} c="dimmed" fz="sm">
            {label}
        </Table.Th>
        <Table.Td>{children}</Table.Td>
    </Table.Tr>
);

export const AiIdentityDetails: FC<{ identity: AiIdentity }> = ({
    identity,
}) => (
    <Table withRowBorders={false} verticalSpacing={6} horizontalSpacing={0}>
        <Table.Tbody>
            <DetailRow label="First name">
                <Text fz="sm">{identity.firstName || '—'}</Text>
            </DetailRow>
            <DetailRow label="Last name">
                <Text fz="sm">{identity.lastName || '—'}</Text>
            </DetailRow>
            <DetailRow label="Email">
                <Text fz="sm">{identity.email}</Text>
            </DetailRow>
            <DetailRow label="Snowflake login">
                <Text
                    fz="sm"
                    c={identity.snowflakeLogin ? undefined : 'dimmed'}
                >
                    {identity.snowflakeLogin ?? 'Not recorded yet'}
                </Text>
            </DetailRow>
            <DetailRow label="AI identity">
                <Group gap={6} wrap="nowrap">
                    <Text fz="sm" className={classes.identityName}>
                        {identity.twinName ?? '—'}
                    </Text>
                    {identity.twinNameOverride && (
                        <Badge size="xs" variant="light" color="gray">
                            override
                        </Badge>
                    )}
                </Group>
            </DetailRow>
            <DetailRow label="Status">
                <AiIdentityStatusBadge identity={identity} />
            </DetailRow>
            <DetailRow label="Last checked">
                <RelativeTime value={identity.checkedAt} />
            </DetailRow>
        </Table.Tbody>
    </Table>
);
