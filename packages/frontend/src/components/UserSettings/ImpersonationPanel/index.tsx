import { Box, Switch, Text } from '@mantine/core';
import { type FC } from 'react';
import {
    useImpersonationSettings,
    useUpdateImpersonationSettings,
} from '../../../hooks/user/useImpersonation';
import Callout from '../../common/Callout';
import { SettingRow } from '../../common/Settings/SettingLayout';

const ImpersonationPanel: FC = () => {
    const { data: settings, isLoading } = useImpersonationSettings();
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateImpersonationSettings();

    return (
        <SettingRow
            title="User impersonation"
            description="Allow organization admins to impersonate other users to see the app from their perspective."
            control={
                <Switch
                    aria-label="User impersonation"
                    size="md"
                    checked={settings?.impersonationEnabled ?? false}
                    disabled={isLoading || isUpdating}
                    onChange={(event) => {
                        updateSettings({
                            impersonationEnabled: event.currentTarget.checked,
                        });
                    }}
                />
            }
        >
            <Box mt="sm">
                <Callout variant="warning">
                    <Text fz="xs">
                        If the project requires users to provide their own
                        warehouse credentials, queries run with the impersonated
                        user's{' '}
                        <Text span inherit fw={600}>
                            personal warehouse credentials
                        </Text>{' '}
                        (including SSO-backed credentials).
                    </Text>
                </Callout>
            </Box>
        </SettingRow>
    );
};

export default ImpersonationPanel;
