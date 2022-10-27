import { Card, Intent } from '@blueprintjs/core';
import { CreateInviteLink, OrganizationMemberRole } from '@lightdash/common';
import React, { FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { isValidEmail } from '../../../utils/fieldValidators';
import InviteSuccess from '../UserManagementPanel/InviteSuccess';
import {
    BackButton,
    EmailInput,
    InviteForm,
    Panel,
    RoleSelectButton,
    SubmitButton,
} from './InvitesPanel.styles';

const InvitePanel: FC<{
    onBackClick: () => void;
}> = ({ onBackClick }) => {
    const { track } = useTracking();
    const { health, user } = useApp();
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
                    name="invite-form"
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
            {data && <InviteSuccess invite={data} hasMarginTop />}
        </Panel>
    );
};

export default InvitePanel;
