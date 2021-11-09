import { Button, Callout, FormGroup, InputGroup } from '@blueprintjs/core';
import { formatTimestamp } from 'common';
import React, { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import {
    useCreateInviteLinkMutation,
    useRevokeInvitesMutation,
} from '../../hooks/useInviteLink';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';

const InvitePanel: FC = () => {
    const { track } = useTracking();
    const { showToastSuccess } = useApp();
    const inviteLink = useCreateInviteLinkMutation();
    const revokeInvitesMutation = useRevokeInvitesMutation();

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <FormGroup
                label="Invite users to your organization"
                labelFor="invite-link-input"
            >
                {inviteLink.data ? (
                    <>
                        <InputGroup
                            id="invite-link-input"
                            type="text"
                            readOnly
                            value={`${window.location.protocol}//${window.location.host}/invite/${inviteLink.data.inviteCode}`}
                            rightElement={
                                <CopyToClipboard
                                    text={`${window.location.protocol}//${window.location.host}/invite/${inviteLink.data.inviteCode}`}
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
                    />
                )}
            </FormGroup>
            <Callout intent="warning" style={{ marginTop: 20 }}>
                <p>This action will revoke all existing invites.</p>
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
