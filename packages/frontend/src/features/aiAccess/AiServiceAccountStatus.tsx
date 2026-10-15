import { AGENT_IDENTITY_SETTINGS_PATH } from '@lightdash/common';
import { Alert, Anchor, Badge, Group, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { type AiServiceAccountStatusInfo } from './getAiServiceAccountStatus';

export const AiServiceAccountStatus = ({
    status,
}: {
    status: AiServiceAccountStatusInfo;
}) => {
    const { t } = useTranslation('aiAccess');
    return (
        <Stack gap="sm">
            <Group gap="sm">
                <Title order={5}>{t('serviceAccountForm.title')}</Title>
                {status.badge && (
                    <Badge
                        variant="light"
                        color={status.badge === 'In use' ? 'green' : 'gray'}
                    >
                        {status.badge === 'In use'
                            ? t('serviceAccountStatus.badge.inUse')
                            : t('serviceAccountStatus.badge.notInUse')}
                    </Badge>
                )}
            </Group>
            {status.message && (
                <Stack gap="xs">
                    <Text size="sm">{status.message}</Text>
                    <Anchor
                        component={Link}
                        to={AGENT_IDENTITY_SETTINGS_PATH}
                        size="sm"
                    >
                        {t('settingsPage.organizationSettings')}
                    </Anchor>
                </Stack>
            )}
            {status.alert && (
                <Alert color={status.alert.color} role="alert">
                    {status.alert.message}
                </Alert>
            )}
        </Stack>
    );
};
