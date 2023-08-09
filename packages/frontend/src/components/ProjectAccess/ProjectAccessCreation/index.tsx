import {
    CreateProjectMember,
    InviteLink,
    OrganizationMemberRole,
    ProjectMemberRole,
    validateEmail,
} from '@lightdash/common';
import { Button, Group, Modal, Select, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUser } from '@tabler/icons-react';
import { FC, useEffect, useState } from 'react';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useCreateProjectAccessMutation } from '../../../hooks/useProjectAccess';
import { useApp } from '../../../providers/AppProvider';
import { TrackPage, useTracking } from '../../../providers/TrackingProvider';
import {
    CategoryName,
    EventName,
    PageName,
    PageType,
} from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import InviteSuccess from '../../UserSettings/UserManagementPanel/InviteSuccess';

interface ProjectAccessCreationProps {
    projectUuid: string;
    onClose: () => void;
    opened: boolean;
}

const ProjectAccessCreation: FC<ProjectAccessCreationProps> = ({
    onClose,
    projectUuid,
    opened,
}) => {
    const form = useForm<CreateProjectMember>({
        initialValues: {
            email: '',
            role: ProjectMemberRole.VIEWER,
            sendEmail: false,
        },
    });
    const { track } = useTracking();
    const { user } = useApp();
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

    const [addNewMember, setAddNewMember] = useState<boolean>(false);
    const [inviteLink, setInviteLink] = useState<InviteLink | undefined>();

    const { data: organizationUsers } = useOrganizationUsers();
    const orgUserEmails =
        organizationUsers && organizationUsers.map((orgUser) => orgUser.email);

    useEffect(() => {
        if (isError) {
            return;
        }
        if (isSuccess) {
            form.reset();
        }
    }, [isError, isSuccess, form]);

    useEffect(() => {
        if (isInvitationSuccess) {
            setInviteLink(inviteData);
            reset();
            createMutation({
                role: form.values.role,
                email: form.values.email,
                sendEmail: false,
            });
            setAddNewMember(false);
        }
    }, [
        isInvitationSuccess,
        form.values.role,
        form.values.email,
        createMutation,
        inviteData,
        reset,
    ]);

    const handleSubmit = (formData: CreateProjectMember) => {
        track({
            name: EventName.CREATE_PROJECT_ACCESS_BUTTON_CLICKED,
        });

        if (addNewMember) {
            inviteMutation({
                email: form.values.email,
                role: OrganizationMemberRole.MEMBER,
            });
        } else {
            createMutation({
                ...formData,
                email: form.values.email,
                sendEmail: true,
            });
        }
        onClose();
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconUser} />
                    <Title order={4}>
                        Provide access to your project to a new user
                    </Title>
                </Group>
            }
            size="lg"
        >
            <TrackPage
                name={PageName.INVITE_MANAGEMENT_SETTINGS}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                <form
                    name="create_project_member"
                    onSubmit={form.onSubmit((values: CreateProjectMember) =>
                        handleSubmit(values),
                    )}
                >
                    <Group align="flex-end" spacing="xs">
                        <Select
                            name="email"
                            label="Select user email address"
                            placeholder="example@gmail.com"
                            required
                            creatable
                            searchable
                            getCreateLabel={(value) =>
                                `Invite ${value} as new member of this organization`
                            }
                            onCreate={(value) => {
                                if (validateEmail(value)) {
                                    setAddNewMember(true);
                                    return value;
                                }
                                return null;
                            }}
                            disabled={isLoading}
                            data={orgUserEmails as string[]}
                            dropdownPosition="bottom"
                            withinPortal
                            w="43%"
                            {...form.getInputProps('email')}
                        />
                        {user.data?.ability?.can('manage', 'Organization') && (
                            <Select
                                data={Object.values(OrganizationMemberRole).map(
                                    (orgMemberRole) => ({
                                        value: orgMemberRole,
                                        label: orgMemberRole.replace('_', ' '),
                                    }),
                                )}
                                disabled={isLoading}
                                required
                                placeholder="Select role"
                                dropdownPosition="bottom"
                                withinPortal
                                {...form.getInputProps('role')}
                            />
                        )}
                        <Button
                            disabled={isLoading || isInvitationLoading}
                            type="submit"
                        >
                            Give Access
                        </Button>
                    </Group>
                </form>
                {inviteLink && (
                    <InviteSuccess invite={inviteLink} hasMarginTop />
                )}
            </TrackPage>
        </Modal>
    );
};

export default ProjectAccessCreation;
