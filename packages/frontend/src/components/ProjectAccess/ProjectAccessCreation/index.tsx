import { Button, Card, InputGroup, Intent, MenuItem } from '@blueprintjs/core';
import { ItemRenderer, Suggest2 } from '@blueprintjs/select';
import {
    CreateProjectMember,
    formatTimestamp,
    InviteLink,
    OrganizationMemberRole,
    ProjectMemberRole,
    validateEmail,
} from '@lightdash/common';
import { FC, useEffect, useState } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
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
    InviteFormGroup,
    Panel,
    ProjectAccessForm,
    RoleSelectButton,
    ShareLinkCallout,
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
                                        <MenuItem
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

            {inviteLink && (
                <InviteFormGroup
                    label={
                        <span>
                            <b>{inviteLink.email}</b> has been added
                        </span>
                    }
                    labelFor="invite-link-input"
                >
                    <InputGroup
                        id="invite-link-input"
                        className="cohere-block"
                        type="text"
                        readOnly
                        value={inviteLink.inviteUrl}
                        rightElement={
                            <CopyToClipboard
                                text={inviteLink.inviteUrl}
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
                        Share this link with {inviteLink.email} and they can
                        join your organization. This link will expire at{' '}
                        <b>{formatTimestamp(inviteLink.expiresAt)}</b>
                    </ShareLinkCallout>
                </InviteFormGroup>
            )}
        </Panel>
    );
};

export default ProjectAccessCreation;
