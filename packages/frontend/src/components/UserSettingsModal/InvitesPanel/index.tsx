import { Button, Callout, FormGroup, InputGroup } from '@blueprintjs/core';
import { formatTimestamp } from '@lightdash/common';
import React, { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import {
    useCreateInviteLinkMutation,
    useRevokeInvitesMutation,
} from '../../../hooks/useInviteLink';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { BackButton } from './InvitesPanel.styles';

const InvitePanel: FC<{
    onBackClick: () => void;
}> = ({ onBackClick }) => {
    const { track } = useTracking();
    const { showToastSuccess } = useApp();
    const inviteLink = useCreateInviteLinkMutation();
    const revokeInvitesMutation = useRevokeInvitesMutation();

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <BackButton
                icon="chevron-left"
                text="Back to all users"
                onClick={onBackClick}
            />
            <FormGroup
                label="Invite users to your organization"
                labelFor="invite-link-input"
            >
                {inviteLink.data ? (
                    <>
                        <InputGroup
                            id="invite-link-input"
                            className="cohere-block"
                            type="text"
                            readOnly
                            value={inviteLink.data.inviteUrl}
                            rightElement={
                                <CopyToClipboard
                                    text={inviteLink.data.inviteUrl}
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
                        <Callout intent="primary" style={{ marginTop: 10 }}>
                            Share this link with your colleagues and they can
                            join your organization. This link will expire at{' '}
                            <b>{formatTimestamp(inviteLink.data.expiresAt)}</b>
                        </Callout>
                    </>
                ) : (
                    <Button
                        text="Create invite link"
                        style={{ marginTop: 10 }}
                        loading={inviteLink.isLoading}
                        onClick={() => {
                            track({
                                name: EventName.INVITE_BUTTON_CLICKED,
                            });
                            inviteLink.mutate();
                        }}
                        data-cy="create-invite-link-button"
                    />
                )}
            </FormGroup>
            <Callout intent="warning" style={{ marginTop: 20 }}>
                <p>This action will revoke all pending invitations.</p>
                <Button
                    intent="danger"
                    text="Revoke all invites"
                    loading={inviteLink.isLoading}
                    onClick={() => {
                        track({
                            name: EventName.REVOKE_INVITES_BUTTON_CLICKED,
                        });
                        revokeInvitesMutation.mutate();
                        inviteLink.reset();
                    }}
                />
            </Callout>
        </div>
    );
};

export default InvitePanel;
