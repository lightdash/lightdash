import { Card, Intent, MenuItem } from '@blueprintjs/core';
import { ItemRenderer, Suggest2 } from '@blueprintjs/select';
import {
    CreateProjectMember,
    OrganizationMemberRole,
    ProjectMemberRole,
    validateEmail,
} from '@lightdash/common';
import React, { FC, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useCreateProjectAccessMutation } from '../../../hooks/useProjectAccess';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import {
    BackButton,
    EmailForm,
    Panel,
    ProjectAccessForm,
    RoleSelectButton,
    SubmitButton,
} from './ProjectAccessCreation';

const renderItem: ItemRenderer<string> = (item, { modifiers, handleClick }) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem
            active={modifiers.active}
            key={item}
            text={item}
            onClick={handleClick}
            shouldDismissPopover={false}
        />
    );
};

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

    const { mutate: inviteMutation, isLoading: isInvitationLoading } =
        useCreateInviteLinkMutation();

    const methods = useForm<CreateProjectMember>({
        mode: 'onSubmit',
        defaultValues: {
            role: ProjectMemberRole.VIEWER,
        },
    });
    const [emailSelected, setEmailSelected] = useState<string>('');
    const [isUserNew, setIsUserNew] = useState<boolean>(false);

    useEffect(() => {
        if (isError) {
            methods.reset({ ...methods.getValues() }, { keepValues: true });
        }
        if (isSuccess) {
            setEmailSelected('');
            methods.setValue('role', ProjectMemberRole.VIEWER);
        }
    }, [isError, methods, isSuccess, showToastSuccess, setEmailSelected]);

    const { data: organizationUsers } = useOrganizationUsers();
    const orgUserEmails =
        organizationUsers && organizationUsers.map((orgUser) => orgUser.email);

    const handleSubmit = (formData: CreateProjectMember) => {
        track({
            name: EventName.CREATE_PROJECT_ACCESS_BUTTON_CLICKED,
        });
        createMutation({
            ...formData,
            email: emailSelected,
            sendEmail: !isUserNew,
        });

        setIsUserNew(false);
    };

    console.log('methods.formState', methods.getValues('role'));
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
                    <EmailForm
                        className={`input-wrapper`}
                        label="Enter user email address *"
                    >
                        <Suggest2
                            inputValueRenderer={(item: string) => {
                                return item;
                            }}
                            itemRenderer={renderItem}
                            items={orgUserEmails}
                            onItemSelect={(select: string) => {
                                setEmailSelected(select);
                                setIsUserNew(false);
                            }}
                            popoverProps={{
                                minimal: true,
                                popoverClassName: 'autocomplete-max-height',
                            }}
                            query={emailSelected}
                            onQueryChange={(query: string) => {
                                setEmailSelected(query);
                            }}
                            inputProps={{
                                placeholder: 'example@gmail.com',
                            }}
                            //noResults={<MenuItem disabled text="No results." />}
                            selectedItem={emailSelected}
                            itemPredicate={(
                                query: string,
                                item: string,
                                index?: undefined | number,
                                exactMatch?: undefined | false | true,
                            ) => {
                                if (exactMatch) {
                                    return (
                                        query.toLowerCase() ===
                                        item.toLowerCase()
                                    );
                                }
                                return item
                                    .toLowerCase()
                                    .includes(query.toLowerCase());
                            }}
                            createNewItemFromQuery={(email: string) => email}
                            createNewItemRenderer={(email: string) => {
                                if (validateEmail(email)) {
                                    return (
                                        <MenuItem
                                            icon="add"
                                            key={email}
                                            text={`Invite ${email} as new member of this organisation`}
                                            onClick={() => {
                                                inviteMutation({
                                                    email: email,
                                                    role: OrganizationMemberRole.MEMBER,
                                                });
                                                setIsUserNew(true);
                                            }}
                                            shouldDismissPopover={true}
                                        />
                                    );
                                }
                            }}
                        />
                    </EmailForm>

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
                        disabled={isLoading || isInvitationLoading}
                    />
                </ProjectAccessForm>
            </Card>
        </Panel>
    );
};

export default ProjectAccessCreation;
