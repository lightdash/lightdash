import { subject } from '@casl/ability';
import { validateEmail, type InviteLink } from '@lightdash/common';

import { Button, Group, Modal, Select, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUserPlus } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
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
import InviteSuccess from '../UserSettings/UsersAndGroupsPanel/InviteSuccess';
import MantineIcon from '../common/MantineIcon';

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

    const { data: organizationUsers } = useOrganizationUsers();

    const form = useForm<{ userId: string; roleId: string }>({
        initialValues: {
            userId: '',
            roleId: 'viewer',
        },
    });

    const [inviteLink, setInviteLink] = useState<InviteLink | undefined>();
    const [emailOptions, setEmailOptions] = useState<
        { value: string; label: string }[]
    >([]);

    useEffect(() => {
        if (organizationUsers) {
            const userData = organizationUsers.map((us) => ({
                value: us.userUuid,
                label: us.email,
            }));
            setEmailOptions(userData);
        }
    }, [organizationUsers]);

    const handleSubmit = async (formData: {
        userId: string;
        roleId: string;
    }) => {
        track({
            name: EventName.CREATE_PROJECT_ACCESS_BUTTON_CLICKED,
        });
        setInviteLink(undefined);

        await upsertMutation({
            ...formData,
            sendEmail: true,
        });
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
                        (values: { userId: string; roleId: string }) =>
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
                                    return query;
                                }
                            }}
                            data={emailOptions}
                            {...form.getInputProps('userId')}
                            sx={{ flexGrow: 1 }}
                        />
                        <Select
                            data={roles}
                            disabled={isLoading}
                            required
                            placeholder="Select role"
                            dropdownPosition="bottom"
                            withinPortal
                            {...form.getInputProps('roleId')}
                        />
                        <Button disabled={isLoading} type="submit">
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
