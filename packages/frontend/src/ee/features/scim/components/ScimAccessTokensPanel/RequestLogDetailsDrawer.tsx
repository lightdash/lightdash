import { type ScimRequestLog } from '@lightdash/common';
import { Anchor, Badge, Code, Drawer, Group, Stack, Text } from '@mantine/core';
import { format } from 'date-fns';
import { type FC, type ReactNode } from 'react';
import { RequestLogStatusBadges } from './RequestLogStatusBadges';
import { SCIM_ACTION_LABELS } from './scimActionLabels';

const DetailRow: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Stack gap="xxs">
        <Text size="xs" c="dimmed" fw={500}>
            {label}
        </Text>
        {children}
    </Stack>
);

type RequestLogDetailsDrawerProps = {
    opened: boolean;
    onClose: () => void;
    log: ScimRequestLog | null;
};

export const RequestLogDetailsDrawer: FC<RequestLogDetailsDrawerProps> = ({
    opened,
    onClose,
    log,
}) => (
    <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size="md"
        title="SCIM request details"
    >
        {log && (
            <Stack gap="md">
                <DetailRow label="Timestamp">
                    <Text size="sm">
                        {format(
                            new Date(log.createdAt),
                            'yyyy/MM/dd hh:mm:ss a',
                        )}
                    </Text>
                </DetailRow>
                <DetailRow label="Action">
                    <Text size="sm">{SCIM_ACTION_LABELS[log.action]}</Text>
                </DetailRow>
                <DetailRow label="Request">
                    <Code block>
                        {log.method} {log.url}
                    </Code>
                </DetailRow>
                <DetailRow label="Status">
                    <RequestLogStatusBadges
                        status={log.status}
                        scimType={log.scimType}
                    />
                </DetailRow>
                {log.errorDetail && (
                    <DetailRow label="Error detail">
                        <Text size="sm">{log.errorDetail}</Text>
                    </DetailRow>
                )}
                <DetailRow label="Target">
                    <Text size="sm">{log.targetIdentity ?? '—'}</Text>
                </DetailRow>
                {log.targetUuid && (
                    <DetailRow label="Target UUID">
                        <Code>{log.targetUuid}</Code>
                    </DetailRow>
                )}
                {log.affectedRoles.length > 0 && (
                    <DetailRow label="Roles">
                        <Group gap="xs">
                            {log.affectedRoles.map((role) => (
                                <Badge key={role} variant="light">
                                    {role}
                                </Badge>
                            ))}
                        </Group>
                    </DetailRow>
                )}
                <DetailRow label="Token">
                    <Text size="sm">
                        {log.tokenDescription ?? 'Deleted token'}
                    </Text>
                    {log.serviceAccountUuid && (
                        <Code>{log.serviceAccountUuid}</Code>
                    )}
                </DetailRow>
                <Text size="xs" c="dimmed">
                    Request and response payloads are not stored. For full
                    payloads, check your identity provider's provisioning logs.{' '}
                    <Anchor
                        inherit
                        href="https://docs.lightdash.com/references/scim-integration/"
                        target="_blank"
                    >
                        Learn more
                    </Anchor>
                </Text>
            </Stack>
        )}
    </Drawer>
);
