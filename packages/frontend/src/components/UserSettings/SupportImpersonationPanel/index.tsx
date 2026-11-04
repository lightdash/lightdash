import { Switch } from '@mantine/core';
import { type FC } from 'react';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';
import { SettingRow } from '../../common/Settings/SettingLayout';

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
        <SettingRow
            title="Lightdash support access"
            description="Allow the Lightdash support team to impersonate users in your organization while helping with a support request, so they can reproduce issues from your perspective without asking for permission each time. You can turn this off at any time."
            control={
                <Switch
                    aria-label="Allow Lightdash support to impersonate users"
                    size="md"
                    checked={supportImpersonationEnabled}
                    disabled={isLoading || update.isLoading}
                    onChange={(event) =>
                        update.mutate({
                            supportImpersonationEnabled:
                                event.currentTarget.checked,
                        })
                    }
                />
            }
        />
    );
};

export default SupportImpersonationPanel;
