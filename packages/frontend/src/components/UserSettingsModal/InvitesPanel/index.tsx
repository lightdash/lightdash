import { Button, Callout, Card, InputGroup, Intent } from '@blueprintjs/core';
import {
    CreateInviteLink,
    formatTimestamp,
    OrganizationMemberRole,
} from '@lightdash/common';
import React, { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useForm } from 'react-hook-form';
import {
    useCreateInviteLinkMutation,
    useRevokeInvitesMutation,
} from '../../../hooks/useInviteLink';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { isValidEmail } from '../../../utils/fieldValidators';
import {
    BackButton,
    EmailInput,
    InviteForm,
    InviteFormGroup,
    Panel,
    RoleSelectButton,
    ShareLinkCallout,
    SubmitButton,
} from './InvitesPanel.styles';

const InvitePanel: FC<{
    onBackClick: () => void;
}> = ({ onBackClick }) => {
    const { track } = useTracking();
    const { showToastSuccess } = useApp();
    const inviteLink = useCreateInviteLinkMutation();
    const revokeInvitesMutation = useRevokeInvitesMutation();
    const methods = useForm<Omit<CreateInviteLink, 'expiresAt'>>({
        mode: 'onSubmit',
        defaultValues: {
            role: OrganizationMemberRole.EDITOR,
        },
    });

    const handleSubmit = (formData: Omit<CreateInviteLink, 'expiresAt'>) => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        inviteLink.mutate(formData);
        methods.setValue('email', '');
        methods.setValue('role', OrganizationMemberRole.EDITOR);
    };

    return (
        <Panel>
            <BackButton
                icon="chevron-left"
                text="Back to all users"
                onClick={onBackClick}
            />
            <Card>
                <InviteForm
                    name="add_saved_charts_to_dashboard"
                    methods={methods}
                    onSubmit={handleSubmit}
                >
                    <EmailInput
                        name="email"
                        label="Enter users email address"
                        placeholder="example@gmail.com"
                        disabled={inviteLink.isLoading}
                        rules={{
                            required: 'Required field',
                            validate: {
                                isValidEmail: isValidEmail('Email'),
                            },
                        }}
                    />
                    <RoleSelectButton
                        name="role"
                        disabled={inviteLink.isLoading}
                        options={Object.values(OrganizationMemberRole).map(
                            (orgMemberRole) => ({
                                value: orgMemberRole,
                                label: orgMemberRole,
                            }),
                        )}
                        rules={{
                            required: 'Required field',
                        }}
                    />
                    <SubmitButton
                        intent={Intent.PRIMARY}
                        text="Generate invite"
                        type="submit"
                        disabled={inviteLink.isLoading}
                    />
                </InviteForm>
            </Card>
            {inviteLink.data && (
                <InviteFormGroup
                    label={
                        <span>
                            <b>{inviteLink.data.email}</b>'s invite link
                        </span>
                    }
                    labelFor="invite-link-input"
                >
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
                    <ShareLinkCallout intent="primary">
                        Share this link with {inviteLink.data.email} and they
                        can join your organization. This link will expire at{' '}
                        <b>{formatTimestamp(inviteLink.data.expiresAt)}</b>
                    </ShareLinkCallout>
                </InviteFormGroup>
            )}
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
        </Panel>
    );
};

export default InvitePanel;
