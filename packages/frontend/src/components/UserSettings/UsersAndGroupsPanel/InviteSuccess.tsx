import { type InviteLink } from '@lightdash/common';
import { Alert, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import React, { useMemo, type FC } from 'react';
import { useToggle } from 'react-use';
import useApp from '../../../providers/App/useApp';
import { CopyActionIcon } from '../../common/CopyActionIcon';

const InviteSuccess: FC<{
    invite: InviteLink;
    hasMarginTop?: boolean;
    onClose?: () => void;
}> = ({ invite, hasMarginTop, onClose }) => {
    const { health } = useApp();
    const [show, toggle] = useToggle(true);

    const message = useMemo(() => {
        const days = Math.ceil(
            (invite.expiresAt.getTime() - new Date().getTime()) /
                (1000 * 60 * 60 * 24),
        );
        if (health.data?.hasEmailClient) {
            return (
                <>
                    We've just sent <b>{invite.email}</b> an email with their
                    invite! You can also share their invite link with them to
                    join your organization. This link will expire in {days}{' '}
                    days.
                </>
            );
        }
        return (
            <>
                Share this link with <b>{invite.email}</b> and they can join
                your organization. This link will expire in {days} days.
            </>
        );
    }, [health.data?.hasEmailClient, invite.email, invite.expiresAt]);

    if (!show) {
        return null;
    }

    return (
        <Alert
            icon={<IconCheck />}
            mt={hasMarginTop ? 'md' : 0}
            color="green"
            withCloseButton={true}
            closeButtonLabel="Close alert"
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
