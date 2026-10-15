import { type InviteLink } from '@lightdash/common';
import { Alert, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import React, { useMemo, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import useApp from '../../../providers/App/useApp';
import { CopyActionIcon } from '../../common/CopyActionIcon';

const InviteSuccess: FC<{
    invite: InviteLink;
    hasMarginTop?: boolean;
    onClose?: () => void;
}> = ({ invite, hasMarginTop, onClose }) => {
    const { t } = useTranslation('userSettings');
    const { health } = useApp();
    const [show, toggle] = useToggle(true);

    const message = useMemo(() => {
        const days = Math.ceil(
            (invite.expiresAt.getTime() - new Date().getTime()) /
                (1000 * 60 * 60 * 24),
        );
        if (health.data?.hasEmailClient) {
            return (
                <Trans
                    t={t}
                    i18nKey="usersAndGroupsPanel.inviteSuccess.emailSent"
                    values={{ email: invite.email }}
                    count={days}
                    components={{ b: <b /> }}
                />
            );
        }
        return (
            <Trans
                t={t}
                i18nKey="usersAndGroupsPanel.inviteSuccess.shareLink"
                values={{ email: invite.email }}
                count={days}
                components={{ b: <b /> }}
            />
        );
    }, [health.data?.hasEmailClient, invite.email, invite.expiresAt, t]);

    if (!show) {
        return null;
    }

    return (
        <Alert
            icon={<IconCheck />}
            mt={hasMarginTop ? 'md' : 0}
            color="green"
            withCloseButton={true}
            closeButtonLabel={t('usersAndGroupsPanel.inviteSuccess.closeAlert')}
            onClose={() => {
                toggle(false);
                onClose?.();
            }}
        >
            <Stack>
                <Text size="sm">{message}</Text>
                <TextInput
                    id="invite-link-input"
                    readOnly
                    className="sentry-block ph-no-capture"
                    value={invite.inviteUrl}
                    rightSection={
                        <CopyActionIcon
                            value={invite.inviteUrl}
                            tooltipPosition="right"
                        />
                    }
                />
            </Stack>
        </Alert>
    );
};

export default InviteSuccess;
