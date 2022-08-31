import { Button, Card, InputGroup, Intent } from '@blueprintjs/core';
import {
    CreateInviteLink,
    formatTimestamp,
    OrganizationMemberRole,
} from '@lightdash/common';
import React, { FC, useEffect } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useForm } from 'react-hook-form';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { isValidEmail } from '../../../utils/fieldValidators';
import {
    BackButton,
    EmailInput,
    InvitedCallout,
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
    const { health, user } = useApp();
    const { showToastSuccess } = useToaster();
    const { data, mutate, isError, isLoading, isSuccess } =
        useCreateInviteLinkMutation();
    const methods = useForm<Omit<CreateInviteLink, 'expiresAt'>>({
        mode: 'onSubmit',
        defaultValues: {
            role: OrganizationMemberRole.EDITOR,
        },
    });

    useEffect(() => {
        if (isError) {
            methods.reset({ ...methods.getValues() }, { keepValues: true });
        }
        if (isSuccess) {
            methods.setValue('email', '');
            methods.setValue('role', OrganizationMemberRole.EDITOR);
        }
    }, [isError, methods, isSuccess]);

    const handleSubmit = (formData: Omit<CreateInviteLink, 'expiresAt'>) => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        mutate(formData);
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
                        label="Enter user email address"
                        placeholder="example@gmail.com"
                        disabled={isLoading}
                        rules={{
                            required: 'Required field',
                            validate: {
                                isValidEmail: isValidEmail('Email'),
                            },
                        }}
                    />
                    {user.data?.ability?.can('manage', 'Organization') && (
                        <RoleSelectButton
                            name="role"
                            disabled={isLoading}
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
                    )}
                    <SubmitButton
                        intent={Intent.PRIMARY}
                        text={
                            health.data?.hasEmailClient
                                ? 'Send invite'
                                : 'Generate invite'
                        }
                        type="submit"
                        disabled={isLoading}
                    />
                </InviteForm>
            </Card>
            {data && (
                <InviteFormGroup
                    label={
                        health.data?.hasEmailClient ? undefined : (
                            <span>
                                <b>{data.email}</b> has been added
                            </span>
                        )
                    }
                    labelFor="invite-link-input"
                >
                    {health.data?.hasEmailClient && (
                        <InvitedCallout intent="success">
                            {data.email} has been invited.
                        </InvitedCallout>
                    )}
                    <InputGroup
                        id="invite-link-input"
                        className="cohere-block"
                        type="text"
                        readOnly
                        value={data.inviteUrl}
                        rightElement={
                            <CopyToClipboard
                                text={data.inviteUrl}
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
                        Share this link with {data.email} and they can join your
                        organization. This link will expire at{' '}
                        <b>{formatTimestamp(data.expiresAt)}</b>
                    </ShareLinkCallout>
                </InviteFormGroup>
            )}
        </Panel>
    );
};

export default InvitePanel;
