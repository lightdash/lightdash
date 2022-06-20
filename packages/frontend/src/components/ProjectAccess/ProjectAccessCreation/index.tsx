import { Card, Intent } from '@blueprintjs/core';
import { CreateProjectMember, ProjectMemberRole } from '@lightdash/common';
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
    Panel,
    ProjectAccessForm,
    RoleSelectButton,
    SubmitButton,
} from './ProjectAccessCreation';

const ProjectAccessCreation: FC<{
    onBackClick: () => void;
}> = ({ onBackClick }) => {
    const { track } = useTracking();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { showToastSuccess } = useApp();
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
            name: EventName.CREATE_PROJECT_ACCESS_BUTTON_CLICKED,
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
                <ProjectAccessForm
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
                        options={Object.values(ProjectMemberRole).map(
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
                        text={'Give access'}
                        type="submit"
                        disabled={isLoading}
                    />
                </ProjectAccessForm>
            </Card>
        </Panel>
    );
};

export default ProjectAccessCreation;
