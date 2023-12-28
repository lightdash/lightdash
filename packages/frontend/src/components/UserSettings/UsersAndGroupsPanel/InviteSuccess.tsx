import { InviteLink } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    CopyButton,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import React, { FC, useMemo } from 'react';
import { useToggle } from 'react-use';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';

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
            <Stack spacing="md">
                <Text>{message}</Text>
                <TextInput
                    id="invite-link-input"
                    readOnly
                    className="sentry-block ph-no-capture"
                    value={invite.inviteUrl}
                    rightSection={
                        <CopyButton value={invite.inviteUrl}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={copied ? 'Copied' : 'Copy'}
                                    withArrow
                                    position="right"
                                >
                                    <ActionIcon
                                        color={copied ? 'teal' : 'gray'}
                                        onClick={copy}
                                    >
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    }
                />
            </Stack>
        </Alert>
    );
};

export default InviteSuccess;
