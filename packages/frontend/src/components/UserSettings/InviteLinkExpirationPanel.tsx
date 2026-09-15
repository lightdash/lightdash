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

    if (organizationSettings.isInitialLoading) {
        return <Loader size="sm" />;
    }

    if (!organizationSettings.data) {
        return null;
    }

    return (
        <Select
            label="Invite link expiration"
            description="Applies to new organization invite links. Existing links are unchanged."
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
    );
};

export default InviteLinkExpirationPanel;
