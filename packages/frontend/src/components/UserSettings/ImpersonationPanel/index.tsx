import { Group, Stack, Switch, Text } from '@mantine-8/core';
import { type FC } from 'react';
import {
    useImpersonationSettings,
    useUpdateImpersonationSettings,
} from '../../../hooks/user/useImpersonation';

const ImpersonationPanel: FC = () => {
    const { data: settings, isLoading } = useImpersonationSettings();
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateImpersonationSettings();

    return (
        <Group justify="space-between" wrap="nowrap">
            <Stack gap="xxs">
                <Text fw={500} fz="sm">
                    Enable user impersonation
                </Text>
                <Text fz="xs" c="ldGray.6">
                    Allow organization admins to impersonate other users to see
                    Lightdash from their perspective.
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
    );
};

export default ImpersonationPanel;
