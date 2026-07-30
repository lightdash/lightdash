import { subject } from '@casl/ability';
import {
    OrganizationMemberRole,
    validateEmail,
    type InviteLink,
} from '@lightdash/common';
import { Button, Group, Select } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconUserPlus } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useCreateInviteLinkMutation } from '../../hooks/useInviteLink';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
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
import MantineModal from '../common/MantineModal';
import { groupComboboxItems } from '../common/Select/utils';
import InviteSuccess from '../UserSettings/UsersAndGroupsPanel/InviteSuccess';

interface Props {
    projectUuid: string;
    roles: { value: string; label: string; group: string }[];
    onClose: () => void;
}

const CreateProjectAccessModal: FC<Props> = ({
    projectUuid,
    roles,
    onClose,
}) => {
    const { track } = useTracking();
    const { user } = useApp();

    const { mutateAsync: upsertMutation, isLoading } =
        useUpsertProjectUserRoleAssignmentMutation(projectUuid);

    const {
        mutateAsync: inviteMutation,
        isLoading: isInvitationLoading,
        reset: resetInvitation,
    } = useCreateInviteLinkMutation({ showSuccessToast: false });

    const { data: organizationUsers } = useOrganizationUsers();

    const form = useForm<{ userId: string; roleId: string }>({
        initialValues: {
            userId: '',
            roleId: 'viewer',
        },
    });

    const [inviteLink, setInviteLink] = useState<InviteLink | undefined>();
    const [emailSearch, setEmailSearch] = useState('');

    const emailOptions = useMemo(
        () =>
            (organizationUsers ?? []).map((us) => ({
                value: us.userUuid,
                label: us.email,
            })),
        [organizationUsers],
    );

    const handleSubmit = async (formData: {
        userId: string;
        roleId: string;
    }) => {
        track({
            name: EventName.CREATE_PROJECT_ACCESS_BUTTON_CLICKED,
        });
        setInviteLink(undefined);

        // Existing members are selected by uuid; a new member is selected by email
        const isExistingMember = emailOptions.some(
            ({ value }) => value === formData.userId,
        );

        if (isExistingMember) {
            await upsertMutation({
                userId: formData.userId,
                roleId: formData.roleId,
                sendEmail: true,
            });
        } else {
            const invite = await inviteMutation({
                email: formData.userId,
                role: OrganizationMemberRole.MEMBER,
            });
            await upsertMutation({
                userId: invite.userUuid,
                roleId: formData.roleId,
                sendEmail: false,
            });
            setInviteLink(invite);
            resetInvitation();
        }

        form.reset();
        setEmailSearch('');
    };

    const userCanInviteUsersToOrganization = user.data?.ability.can(
        'manage',
        subject('Organization', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const searchedEmail = emailSearch.trim();
    const canCreateEmail =
        userCanInviteUsersToOrganization &&
        validateEmail(searchedEmail) &&
        !emailOptions.some(({ label }) => label === searchedEmail);
    const userOptions = canCreateEmail
        ? [
              ...emailOptions,
              {
                  value: searchedEmail,
                  label: searchedEmail,
                  isCreateOption: true,
              },
          ]
        : emailOptions;

    const isSubmitting = isLoading || isInvitationLoading;

    const formId = 'add-user-to-project';

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Add user access"
            icon={IconUserPlus}
            size="lg"
            actions={
                <Button
                    type="submit"
                    form={formId}
                    disabled={isSubmitting}
                    loading={isSubmitting}
                >
                    Give access
                </Button>
            }
        >
            <TrackPage
                name={PageName.PROJECT_ADD_USER}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                <form
                    id={formId}
                    onSubmit={form.onSubmit(
                        (values: { userId: string; roleId: string }) =>
                            handleSubmit(values),
                    )}
                >
                    <Group align="flex-end" gap="xs">
                        <Select
                            allowDeselect={false}
                            name="email"
                            comboboxProps={{ withinPortal: true }}
                            radius="md"
                            label="Enter user email address"
                            placeholder="example@gmail.com"
                            nothingFoundMessage={
                                validateEmail(searchedEmail) &&
                                !userCanInviteUsersToOrganization
                                    ? 'You need to be an organization admin to add new users.'
                                    : 'Nothing found'
                            }
                            searchable
                            required
                            disabled={isSubmitting}
                            searchValue={emailSearch}
                            onSearchChange={setEmailSearch}
                            data={userOptions}
                            renderOption={({ option }) => {
                                const isCreateOption =
                                    'isCreateOption' in option &&
                                    option.isCreateOption;
                                return isCreateOption ? (
                                    <span style={{ wordBreak: 'keep-all' }}>
                                        This user is not a member of your
                                        organization. Select to invite them.
                                    </span>
                                ) : (
                                    option.label
                                );
                            }}
                            {...form.getInputProps('userId')}
                            style={{ flexGrow: 1 }}
                        />

                        <Select
                            allowDeselect={false}
                            data={groupComboboxItems(roles)}
                            disabled={isSubmitting}
                            required
                            radius="md"
                            placeholder="Select role"
                            comboboxProps={{
                                withinPortal: true,
                                position: 'bottom',
                                middlewares: { flip: false },
                            }}
                            {...form.getInputProps('roleId')}
                        />
                    </Group>
                </form>

                {inviteLink && (
                    <InviteSuccess invite={inviteLink} hasMarginTop />
                )}
            </TrackPage>
        </MantineModal>
    );
};

export default CreateProjectAccessModal;
