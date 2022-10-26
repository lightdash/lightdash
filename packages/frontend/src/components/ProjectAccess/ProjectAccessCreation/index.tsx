import { Card, Intent } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer, Suggest2 } from '@blueprintjs/select';
import {
    CreateProjectMember,
    InviteLink,
    OrganizationMemberRole,
    ProjectMemberRole,
    validateEmail,
} from '@lightdash/common';
import React, { FC, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useCreateProjectAccessMutation } from '../../../hooks/useProjectAccess';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import InviteSuccess from '../../UserSettings/UserManagementPanel/InviteSuccess';
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
        <MenuItem2
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

    const { showToastSuccess } = useToaster();
    const {
        mutate: createMutation,
        isError,
        isSuccess,
        isLoading,
    } = useCreateProjectAccessMutation(projectUuid);

    const {
        data: inviteData,
        mutate: inviteMutation,
        isLoading: isInvitationLoading,
        isSuccess: isInvitationSuccess,
        reset,
    } = useCreateInviteLinkMutation();

    const methods = useForm<CreateProjectMember>({
        mode: 'onSubmit',
        defaultValues: {
            role: ProjectMemberRole.VIEWER,
        },
    });
    const [emailSelected, setEmailSelected] = useState<string>('');
    const [addNewMember, setAddNewMember] = useState<boolean>(false);
    const [inviteLink, setInviteLink] = useState<InviteLink | undefined>();

    const { data: organizationUsers } = useOrganizationUsers();
    const orgUserEmails =
        organizationUsers && organizationUsers.map((orgUser) => orgUser.email);

    useEffect(() => {
        if (isError) {
            methods.reset({ ...methods.getValues() }, { keepValues: true });
        }
        if (isSuccess) {
            setEmailSelected('');
            methods.setValue('role', ProjectMemberRole.VIEWER);
        }
    }, [isError, methods, isSuccess, showToastSuccess, setEmailSelected]);

    useEffect(() => {
        if (isInvitationSuccess) {
            setInviteLink(inviteData);
            reset();
            createMutation({
                role: methods.getValues('role'),
                email: emailSelected,
                sendEmail: false,
            });
            setAddNewMember(false);
        }
    }, [
        isInvitationSuccess,
        inviteData,
        emailSelected,
        addNewMember,
        methods,
        createMutation,
        reset,
    ]);

    const handleSubmit = (formData: CreateProjectMember) => {
        track({
            name: EventName.CREATE_PROJECT_ACCESS_BUTTON_CLICKED,
        });

        if (addNewMember) {
            inviteMutation({
                email: emailSelected,
                role: OrganizationMemberRole.MEMBER,
            });
        } else {
            createMutation({
                ...formData,
                email: emailSelected,
                sendEmail: true,
            });
        }
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
                                setAddNewMember(false);
                            }}
                            popoverProps={{
                                minimal: true,
                                popoverClassName: 'autocomplete-max-height',
                            }}
                            query={emailSelected}
                            onQueryChange={(query: string) => {
                                setEmailSelected(query);
                                setAddNewMember(false);
                            }}
                            inputProps={{
                                placeholder: 'example@gmail.com',
                            }}
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
                                        <MenuItem2
                                            icon="add"
                                            key={email}
                                            text={`Invite ${email} as new member of this organisation`}
                                            onClick={() => {
                                                setAddNewMember(true);
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

            {inviteLink && <InviteSuccess invite={inviteLink} hasMarginTop />}
        </Panel>
    );
};

export default ProjectAccessCreation;
