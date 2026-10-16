import {
    DEFAULT_INVITE_LINK_EXPIRATION_DAYS,
    MAX_INVITE_LINK_EXPIRATION_DAYS,
} from '@lightdash/common';
import { Loader, Select } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../hooks/organization/useOrganizationSettings';

const InviteLinkExpirationPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const expirationOptions = useMemo(
        () =>
            Array.from(
                { length: MAX_INVITE_LINK_EXPIRATION_DAYS },
                (_, index) => {
                    const days = index + 1;
                    return {
                        value: String(days),
                        label: t('inviteLinkExpirationPanel.days', {
                            count: days,
                        }),
                    };
                },
            ),
        [t],
    );
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
            label={t('inviteLinkExpirationPanel.label')}
            description={t('inviteLinkExpirationPanel.description')}
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
