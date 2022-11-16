import { Button, InputGroup } from '@blueprintjs/core';
import { InviteLink } from '@lightdash/common';
import React, { FC, useMemo } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useToggle } from 'react-use';
import useToaster from '../../../hooks/toaster/useToaster';
import { useApp } from '../../../providers/AppProvider';
import { InviteSuccessCallout, MessageWrapper } from './InviteSuccess.styles';

const InviteSuccess: FC<{ invite: InviteLink; hasMarginTop?: boolean }> = ({
    invite,
    hasMarginTop,
}) => {
    const { health } = useApp();
    const { showToastSuccess } = useToaster();
    const [show, toggle] = useToggle(true);

    const message = useMemo(() => {
        const days = Math.ceil(
            (invite.expiresAt.getTime() - new Date().getTime()) /
                (1000 * 60 * 60 * 24),
        );
        if (health.data?.hasEmailClient) {
            return (
                <>
                    <b>{invite.email}</b> has been invited! You can also share
                    this link with them and they can join your organization.
                    This link will expire in {days} days.
                </>
            );
        }
        return (
            <>
                Share this link with <b>{invite.email}</b> and they can join
                your organization. This link will expire in {days} days.
            </>
        );
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (!show) {
        return null;
    }

    return (
        <InviteSuccessCallout intent="success" $hasMarginTop={hasMarginTop}>
            <MessageWrapper>
                <p>{message}</p>
                <Button
                    aria-label="Close"
                    icon="cross"
                    onClick={toggle}
                    minimal
                    small
                />
            </MessageWrapper>
            <InputGroup
                id="invite-link-input"
                className="cohere-block"
                type="text"
                readOnly
                value={invite.inviteUrl}
                rightElement={
                    <CopyToClipboard
                        text={invite.inviteUrl}
                        options={{ message: 'Copied' }}
                        onCopy={() =>
                            showToastSuccess({
                                title: 'Invite link copied',
                            })
                        }
                    >
                        <Button minimal icon="clipboard" />
                    </CopyToClipboard>
                }
            />
        </InviteSuccessCallout>
    );
};

export default InviteSuccess;
