import { type ScimRequestLog } from '@lightdash/common';
import { Anchor, Badge, Code, Drawer, Group, Stack, Text } from '@mantine/core';
import { format } from 'date-fns';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RequestLogStatusBadges } from './RequestLogStatusBadges';
import { getScimActionLabel } from './scimActionLabels';

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
}) => {
    const { t } = useTranslation('serviceAccounts');
    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="md"
            title={t('scim.details.title')}
        >
            {log && (
                <Stack gap="md">
                    <DetailRow label={t('scim.details.timestamp')}>
                        <Text size="sm">
                            {format(
                                new Date(log.createdAt),
                                'yyyy/MM/dd hh:mm:ss a',
                            )}
                        </Text>
                    </DetailRow>
                    <DetailRow label={t('scim.details.action')}>
                        <Text size="sm">{getScimActionLabel(log.action)}</Text>
                    </DetailRow>
                    <DetailRow label={t('scim.details.request')}>
                        <Code block>
                            {log.method} {log.url}
                        </Code>
                    </DetailRow>
                    <DetailRow label={t('scim.details.status')}>
                        <RequestLogStatusBadges
                            status={log.status}
                            scimType={log.scimType}
                        />
                    </DetailRow>
                    {log.errorDetail && (
                        <DetailRow label={t('scim.details.errorDetail')}>
                            <Text size="sm">{log.errorDetail}</Text>
                        </DetailRow>
                    )}
                    <DetailRow label={t('scim.details.target')}>
                        <Text size="sm">{log.targetIdentity ?? '—'}</Text>
                    </DetailRow>
                    {log.targetUuid && (
                        <DetailRow label={t('scim.details.targetUuid')}>
                            <Code>{log.targetUuid}</Code>
                        </DetailRow>
                    )}
                    {log.affectedRoles.length > 0 && (
                        <DetailRow label={t('scim.details.roles')}>
                            <Group gap="xs">
                                {log.affectedRoles.map((role) => (
                                    <Badge key={role} variant="light">
                                        {role}
                                    </Badge>
                                ))}
                            </Group>
                        </DetailRow>
                    )}
                    <DetailRow label={t('createModal.token')}>
                        <Text size="sm">
                            {log.tokenDescription ??
                                t('scim.details.deletedToken')}
                        </Text>
                        {log.serviceAccountUuid && (
                            <Code>{log.serviceAccountUuid}</Code>
                        )}
                    </DetailRow>
                    <Text size="xs" c="dimmed">
                        {t('scim.details.payloadsNote')}{' '}
                        <Anchor
                            inherit
                            href="https://docs.lightdash.com/references/scim-integration/"
                            target="_blank"
                        >
                            {t('scim.learnMore')}
                        </Anchor>
                    </Text>
                </Stack>
            )}
        </Drawer>
    );
};
