import { Group, Stack, Switch, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';

const SupportImpersonationPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { data, isLoading } = useOrganizationSettings();
    const update = useUpdateOrganizationSettings();

    // The API returns the effective value already; reflect an in-flight edit
    // optimistically so the toggle doesn't snap back while saving.
    const pending = update.isLoading ? update.variables : undefined;
    const supportImpersonationEnabled =
        pending?.supportImpersonationEnabled ??
        data?.supportImpersonationEnabled ??
        false;

    return (
        <Group justify="space-between" wrap="nowrap">
            <Stack gap="xxs">
                <Text fw={500} fz="sm">
                    {t('supportImpersonationPanel.title')}
                </Text>
                <Text fz="xs" c="dimmed">
                    {t('supportImpersonationPanel.description')}
                </Text>
            </Stack>
            <Switch
                checked={supportImpersonationEnabled}
                disabled={isLoading || update.isLoading}
                onChange={(event) =>
                    update.mutate({
                        supportImpersonationEnabled:
                            event.currentTarget.checked,
                    })
                }
            />
        </Group>
    );
};

export default SupportImpersonationPanel;
