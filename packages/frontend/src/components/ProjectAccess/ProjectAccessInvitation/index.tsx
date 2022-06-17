import { Card, Intent } from '@blueprintjs/core';
import {
    CreateProjectMember,
    OrganizationMemberRole,
    ProjectMemberRole,
} from '@lightdash/common';
import React, { FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { useCreateProjectAccessMutation } from '../../../hooks/useProjectAccess';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { isValidEmail } from '../../../utils/fieldValidators';
import {
    BackButton,
    EmailInput,
    InviteForm,
    Panel,
    RoleSelectButton,
    SubmitButton,
} from './ProjectAccessInvitation';

const ProjectAccessInvitation: FC<{
    onBackClick: () => void;
}> = ({ onBackClick }) => {
    const { track } = useTracking();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { showToastSuccess, health, user } = useApp();
    const {
        mutate: createMutation,
        isError,
        isSuccess,
        isLoading,
    } = useCreateProjectAccessMutation(projectUuid);
    const methods = useForm<CreateProjectMember>({
        mode: 'onSubmit',
        defaultValues: {
            role: ProjectMemberRole.VIEWER,
        },
    });

    useEffect(() => {
        if (isError) {
            methods.reset({ ...methods.getValues() }, { keepValues: true });
        }
        if (isSuccess) {
            methods.setValue('email', '');
            methods.setValue('role', ProjectMemberRole.VIEWER);
        }
    }, [isError, methods, isSuccess, showToastSuccess]);

    const handleSubmit = (formData: CreateProjectMember) => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        createMutation(formData);
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
        </Panel>
    );
};

export default ProjectAccessInvitation;
