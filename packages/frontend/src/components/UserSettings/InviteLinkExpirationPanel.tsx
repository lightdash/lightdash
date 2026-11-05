import {
    DEFAULT_INVITE_LINK_EXPIRATION_DAYS,
    MAX_INVITE_LINK_EXPIRATION_DAYS,
} from '@lightdash/common';
import { Loader, Select } from '@mantine/core';
import { type FC } from 'react';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../hooks/organization/useOrganizationSettings';
import { SettingRow } from '../common/Settings/SettingLayout';

const expirationOptions = Array.from(
    { length: MAX_INVITE_LINK_EXPIRATION_DAYS },
    (_, index) => {
        const days = index + 1;
        return {
            value: String(days),
            label: `${days} ${days === 1 ? 'day' : 'days'}`,
        };
    },
);

const InviteLinkExpirationPanel: FC = () => {
    const organizationSettings = useOrganizationSettings();
    const updateOrganizationSettings = useUpdateOrganizationSettings();
    const inviteLinkExpirationDays =
        (updateOrganizationSettings.isLoading
            ? updateOrganizationSettings.variables?.inviteLinkExpirationDays
            : undefined) ??
        organizationSettings.data?.inviteLinkExpirationDays ??
        DEFAULT_INVITE_LINK_EXPIRATION_DAYS;

    return (
        <SettingRow
            title="Invite link expiration"
            description="How long new invite links stay valid. Existing links are unchanged."
            control={
                organizationSettings.isInitialLoading ? (
                    <Loader size="sm" />
                ) : organizationSettings.data ? (
                    <Select
                        aria-label="Invite link expiration"
                        size="xs"
                        w={160}
                        data={expirationOptions}
                        value={String(inviteLinkExpirationDays)}
                        disabled={updateOrganizationSettings.isLoading}
                        onChange={(value) => {
                            if (value !== null) {
                                updateOrganizationSettings.mutate({
                                    inviteLinkExpirationDays: Number(value),
                                });
                            }
                        }}
                    />
                ) : null
            }
        />
    );
};

export default InviteLinkExpirationPanel;
