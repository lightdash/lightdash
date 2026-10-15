import { Group, Stack, Switch, Text } from '@mantine/core';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
    useImpersonationSettings,
    useUpdateImpersonationSettings,
} from '../../../hooks/user/useImpersonation';
import Callout from '../../common/Callout';

const ImpersonationPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { data: settings, isLoading } = useImpersonationSettings();
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateImpersonationSettings();

    return (
        <Stack gap="sm">
            <Group justify="space-between" wrap="nowrap">
                <Stack gap="xxs">
                    <Text fw={500} fz="sm">
                        {t('impersonationPanel.title')}
                    </Text>
                    <Text fz="xs" c="dimmed">
                        {t('impersonationPanel.description')}
                    </Text>
                </Stack>
                <Switch
                    checked={settings?.impersonationEnabled ?? false}
                    disabled={isLoading || isUpdating}
                    onChange={(event) => {
                        updateSettings({
                            impersonationEnabled: event.currentTarget.checked,
                        });
                    }}
                />
            </Group>
            <Callout variant="warning">
                <Text fz="xs">
                    <Trans
                        t={t}
                        i18nKey="impersonationPanel.credentialsWarning"
                        components={{
                            bold: <Text span inherit fw={600} />,
                        }}
                    />
                </Text>
            </Callout>
        </Stack>
    );
};

export default ImpersonationPanel;
