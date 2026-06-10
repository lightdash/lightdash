import { Group, Stack, Switch, Text } from '@mantine-8/core';
import { type FC } from 'react';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';

const SupportImpersonationPanel: FC = () => {
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
                    Allow Lightdash support to impersonate users
                </Text>
                <Text fz="xs" c="ldGray.6">
                    When enabled, the Lightdash support team can impersonate
                    users in your organization while helping with a support
                    request, so they can reproduce issues from your perspective
                    without asking for permission each time. You can turn this
                    off at any time.
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
