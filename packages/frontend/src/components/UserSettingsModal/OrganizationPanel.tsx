import React, { FC, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { ApiError, formatTimestamp } from 'common';
import {
    Button,
    FormGroup,
    InputGroup,
    Intent,
    Callout,
} from '@blueprintjs/core';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useApp } from '../../providers/AppProvider';
import { lightdashApi } from '../../api';
import {
    useCreateInviteLinkMutation,
    useRevokeInvitesMutation,
} from '../../hooks/useInviteLink';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';

const updateOrgQuery = async (data: { organizationName: string }) =>
    lightdashApi<undefined>({
        url: `/org`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const OrganizationPanel: FC = () => {
    const queryClient = useQueryClient();
    const {
        errorLogs: { showError },
        showToastError,
        showToastSuccess,
        user,
    } = useApp();
    const { track } = useTracking();
    const [organizationName, setOrganizationName] = useState<
        string | undefined
    >(user.data?.organizationName);
    const inviteLink = useCreateInviteLinkMutation();
    const revokeInvitesMutation = useRevokeInvitesMutation();
    const { isLoading, error, mutate } = useMutation<
        undefined,
        ApiError,
        { organizationName: string }
    >(updateOrgQuery, {
        mutationKey: ['user_update'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user']);
            showToastSuccess({
                title: 'Organization name updated with success',
            });
        },
    });

    useEffect(() => {
        if (error) {
            const [title, ...rest] = error.error.message.split('\n');
            showError({
                title,
                body: rest.join('\n'),
            });
        }
    }, [error, showError]);

    const handleUpdate = () => {
        if (organizationName) {
            mutate({
                organizationName,
            });
        } else {
            showToastError({
                title: 'Required fields: organization name',
                timeout: 3000,
            });
        }
    };

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <FormGroup
                label="Organization name"
                labelFor="organization-name-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="organization-name-input"
                    placeholder="Lightdash"
                    type="text"
                    required
                    disabled={isLoading}
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                />
            </FormGroup>
            <div>
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
                                Share this link with your colleagues and they
                                can join your organization. This link will
                                expire at{' '}
                                <b>
                                    {formatTimestamp(inviteLink.data.expiresAt)}
                                </b>
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
                    <p>
                        This action will remove all active and expired invites
                        links.
                    </p>
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
            <div style={{ flex: 1 }} />
            <Button
                style={{ alignSelf: 'flex-end', marginTop: 20 }}
                intent={Intent.PRIMARY}
                text="Update"
                onClick={handleUpdate}
                loading={isLoading}
            />
        </div>
    );
};

export default OrganizationPanel;
