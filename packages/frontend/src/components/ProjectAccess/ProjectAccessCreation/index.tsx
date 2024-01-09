import {
    CreateProjectMember,
    InviteLink,
    OrganizationMemberRole,
    ProjectMemberRole,
    validateEmail,
} from '@lightdash/common';
import { Button, Group, Modal, ModalProps, Select, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUserPlus } from '@tabler/icons-react';
import { FC, useEffect, useState } from 'react';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useCreateProjectAccessMutation } from '../../../hooks/useProjectAccess';
import { TrackPage, useTracking } from '../../../providers/TrackingProvider';
import {
    CategoryName,
    EventName,
    PageName,
    PageType,
} from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import InviteSuccess from '../../UserSettings/UsersAndGroupsPanel/InviteSuccess';

interface ProjectAccessCreationProps extends ModalProps {
    projectUuid: string;
}

const ProjectAccessCreation: FC<ProjectAccessCreationProps> = ({
    opened,
    onClose,
    projectUuid,
}) => {
    const { track } = useTracking();
    const { data: organizationUsers } = useOrganizationUsers();
    const { mutateAsync: createMutation, isLoading } =
        useCreateProjectAccessMutation(projectUuid);

    const {
        mutateAsync: inviteMutation,
        isLoading: isInvitationLoading,
        reset,
    } = useCreateInviteLinkMutation();

    const form = useForm<Pick<CreateProjectMember, 'email' | 'role'>>({
        initialValues: {
            email: '',
            role: ProjectMemberRole.VIEWER,
        },
    });

    const [addNewMember, setAddNewMember] = useState<boolean>(false);
    const [inviteLink, setInviteLink] = useState<InviteLink | undefined>();
    const [emailOptions, setEmailOptions] = useState<string[]>([]);

    useEffect(() => {
        if (organizationUsers) {
            setEmailOptions(organizationUsers.map(({ email }) => email));
        }
    }, [organizationUsers]);

    const handleSubmit = async (
        formData: Pick<CreateProjectMember, 'email' | 'role'>,
    ) => {
        track({
            name: EventName.CREATE_PROJECT_ACCESS_BUTTON_CLICKED,
        });
        setInviteLink(undefined);

        if (addNewMember) {
            const data = await inviteMutation({
                email: formData.email,
                role: OrganizationMemberRole.MEMBER,
            });
            await createMutation({
                ...formData,
                sendEmail: false,
            });
            setAddNewMember(false);
            setInviteLink(data);
            reset();
            form.reset();
        } else {
            await createMutation({
                ...formData,
                sendEmail: true,
            });
            form.reset();
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconUserPlus} />
                    <Title order={4}>Add user access</Title>
                </Group>
            }
            size="lg"
        >
            <TrackPage
                name={PageName.PROJECT_ADD_USER}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                <form
                    name="add_user_to_project"
                    onSubmit={form.onSubmit(
                        (values: Pick<CreateProjectMember, 'email' | 'role'>) =>
                            handleSubmit(values),
                    )}
                >
                    <Group align="flex-end" spacing="xs">
                        <Select
                            name={'email'}
                            withinPortal
                            label="Enter user email address"
                            placeholder="example@gmail.com"
                            nothingFound="Nothing found"
                            searchable
                            creatable
                            required
                            disabled={isLoading}
                            getCreateLabel={(query) =>
                                validateEmail(query)
                                    ? `Invite "${query}" as new member of this organization`
                                    : null
                            }
                            onCreate={(query) => {
                                if (validateEmail(query)) {
                                    setAddNewMember(true);
                                    setEmailOptions((prevState) => [
                                        ...prevState,
                                        query,
                                    ]);
                                    return query;
                                }
                            }}
                            data={emailOptions}
                            {...form.getInputProps('email')}
                            sx={{ flexGrow: 1 }}
                        />
                        <Select
                            data={Object.values(ProjectMemberRole).map(
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
                        <Button
                            disabled={isLoading || isInvitationLoading}
                            type="submit"
                        >
                            Give access
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
