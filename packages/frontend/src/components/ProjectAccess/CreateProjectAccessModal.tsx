import { subject } from '@casl/ability';
import {
    OrganizationMemberRole,
    validateEmail,
    type InviteLink,
    type Role,
} from '@lightdash/common';

import { Button, Group, Modal, Select, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUserPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useCreateInviteLinkMutation } from '../../hooks/useInviteLink';
import { useOrganizationRoles } from '../../hooks/useOrganizationRoles';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import { useCreateProjectAccessMutation } from '../../hooks/useProjectAccess';
import { useUpsertProjectUserRoleAssignmentMutation } from '../../hooks/useProjectRoles';
import useApp from '../../providers/App/useApp';
import { TrackPage } from '../../providers/Tracking/TrackingProvider';
import useTracking from '../../providers/Tracking/useTracking';
import {
    CategoryName,
    EventName,
    PageName,
    PageType,
} from '../../types/Events';
import InviteSuccess from '../UserSettings/UsersAndGroupsPanel/InviteSuccess';
import MantineIcon from '../common/MantineIcon';

interface Props {
    projectUuid: string;
    onClose: () => void;
}

const CreateProjectAccessModal: FC<Props> = ({ projectUuid, onClose }) => {
    const { track } = useTracking();
    const { user } = useApp();

    const { data: organizationUsers } = useOrganizationUsers();
    const { data: organizationRoles, isLoading: isLoadingRoles } =
        useOrganizationRoles();
    const { mutateAsync: createMutation, isLoading } =
        useCreateProjectAccessMutation(projectUuid);
    const { mutateAsync: upsertRoleMutation, isLoading: isUpsertingRole } =
        useUpsertProjectUserRoleAssignmentMutation(projectUuid);

    const {
        mutateAsync: inviteMutation,
        isLoading: isInvitationLoading,
        reset,
    } = useCreateInviteLinkMutation();

    const form = useForm<{ email: string; roleId: string }>({
        initialValues: {
            email: '',
            roleId: '',
        },
    });

    const [addNewMember, setAddNewMember] = useState<boolean>(false);
    const [inviteLink, setInviteLink] = useState<InviteLink | undefined>();
    const [emailOptions, setEmailOptions] = useState<string[]>([]);

    // Reuse existing role selection logic from ProjectAccess component
    const roleOptions = useMemo(() => {
        return organizationRoles?.map(
            (role: Pick<Role, 'roleUuid' | 'name' | 'ownerType'>) => ({
                value: role.roleUuid,
                label: role.name,
                group:
                    role.ownerType === 'system' ? 'System role' : 'Custom role',
            }),
        );
    }, [organizationRoles]);

    // Set default role to viewer when roles are loaded
    useEffect(() => {
        if (organizationRoles && !form.values.roleId) {
            const viewerRole = organizationRoles.find(
                (role) => role.name.toLowerCase() === 'viewer',
            );
            if (viewerRole) {
                form.setFieldValue('roleId', viewerRole.roleUuid);
            }
        }
    }, [organizationRoles, form]);

    useEffect(() => {
        if (organizationUsers) {
            setEmailOptions(organizationUsers.map(({ email }) => email));
        }
    }, [organizationUsers]);

    const handleSubmit = async (formData: {
        email: string;
        roleId: string;
    }) => {
        track({
            name: EventName.CREATE_PROJECT_ACCESS_BUTTON_CLICKED,
        });
        setInviteLink(undefined);

        // Check if user already exists in organization
        const existingUser = organizationUsers?.find(
            (u) => u.email === formData.email,
        );

        if (existingUser) {
            // For existing users, just assign the role using the v2 endpoint
            await upsertRoleMutation({
                userId: existingUser.userUuid,
                roleId: formData.roleId,
            });
        } else {
            // For new users, use the extended v1 endpoint with roleId
            await createMutation({
                email: formData.email,
                role: 'viewer' as any, // Required but not used when roleId is provided
                roleId: formData.roleId,
                sendEmail: true,
            });

            if (addNewMember) {
                // Invite user to organization as well
                const data = await inviteMutation({
                    email: formData.email,
                    role: OrganizationMemberRole.MEMBER,
                });

                setAddNewMember(false);
                setInviteLink(data);
                reset();
            }
        }

        form.reset();
    };

    const userCanInviteUsersToOrganization = user.data?.ability.can(
        'manage',
        subject('Organization', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    return (
        <Modal
            opened
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
                        (values: { email: string; roleId: string }) =>
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
                            disabled={
                                isLoading || isLoadingRoles || isUpsertingRole
                            }
                            getCreateLabel={(query) => {
                                if (validateEmail(query)) {
                                    return (
                                        <span style={{ wordBreak: 'keep-all' }}>
                                            This user is not a member of your
                                            organization. You need to be an
                                            organization admin to add new users
                                            to your organization.
                                        </span>
                                    );
                                }
                                return null;
                            }}
                            onCreate={(query) => {
                                if (
                                    validateEmail(query) &&
                                    userCanInviteUsersToOrganization
                                ) {
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
                            data={roleOptions}
                            disabled={
                                isLoading || isLoadingRoles || isUpsertingRole
                            }
                            required
                            placeholder="Select role"
                            dropdownPosition="bottom"
                            withinPortal
                            {...form.getInputProps('roleId')}
                        />
                        <Button
                            disabled={
                                isLoading ||
                                isInvitationLoading ||
                                isLoadingRoles ||
                                isUpsertingRole
                            }
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

export default CreateProjectAccessModal;
