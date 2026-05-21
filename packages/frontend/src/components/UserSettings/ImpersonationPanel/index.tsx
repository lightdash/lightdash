import { Group, Stack, Switch, Text } from '@mantine-8/core';
import { type FC } from 'react';
import {
    useImpersonationSettings,
    useUpdateImpersonationSettings,
} from '../../../hooks/user/useImpersonation';
import Callout from '../../common/Callout';

const ImpersonationPanel: FC = () => {
    const { data: settings, isLoading } = useImpersonationSettings();
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateImpersonationSettings();

    return (
        <Stack gap="sm">
            <Group justify="space-between" wrap="nowrap">
                <Stack gap="xxs">
                    <Text fw={500} fz="sm">
                        Enable user impersonation
                    </Text>
                    <Text fz="xs" c="ldGray.6">
                        Allow organization admins to impersonate other users to
                        see Lightdash from their perspective.
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
                    If the project requires users to provide their own warehouse
                    credentials, queries run with the impersonated user's{' '}
                    <Text span inherit fw={700}>
                        personal warehouse credentials
                    </Text>{' '}
                    (including SSO-backed credentials).
                </Text>
            </Callout>
        </Stack>
    );
};

export default ImpersonationPanel;
