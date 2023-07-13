import { subject } from '@casl/ability';
import { OrgUserAttribute } from '@lightdash/common';
import {
    Button,
    Flex,
    Group,
    Modal,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconCircleX,
    IconEdit,
    IconInfoCircle,
} from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useDeleteOrganizationUserMutation } from '../../../hooks/useOrganizationUsers';
import { useUserAttributes } from '../../../hooks/useUserAttributes';
import { useApp } from '../../../providers/AppProvider';
import LoadingState from '../../common/LoadingState';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import ForbiddenPanel from '../../ForbiddenPanel';
import UserAttributeModal from './UserAttributeModal';

const UserListItem: FC<{
    orgUserAttribute: OrgUserAttribute;
}> = ({ orgUserAttribute }) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    const { mutate, isLoading: isDeleting } =
        useDeleteOrganizationUserMutation();

    console.debug('isEditDialogOpen', isEditDialogOpen);
    console.debug('mutate', mutate);

    return (
        <>
            <tr>
                <td width={800}>
                    <Flex justify="space-between" align="center">
                        <Stack spacing="xs">
                            <Group spacing="two">
                                <Text>{orgUserAttribute.name}</Text>
                                {orgUserAttribute.description && (
                                    <Tooltip
                                        multiline
                                        maw={300}
                                        withArrow
                                        label={orgUserAttribute.description}
                                    >
                                        <MantineIcon
                                            icon={IconInfoCircle}
                                            color="gray.6"
                                        />
                                    </Tooltip>
                                )}
                            </Group>
                            <Text fz="xs" color="gray.6">
                                {' '}
                                {orgUserAttribute.users.length} user
                                {orgUserAttribute.users.length != 1 ? 's' : ''}
                            </Text>
                        </Stack>
                    </Flex>
                </td>
                <td>
                    <Flex justify="space-between" align="right">
                        <Button
                            variant="subtle"
                            onClick={() => setIsEditDialogOpen(true)}
                        >
                            <MantineIcon
                                icon={IconEdit}
                                size="xlg"
                                color="gray.7"
                            />
                        </Button>
                        <Button
                            leftIcon={<MantineIcon icon={IconCircleX} />}
                            variant="outline"
                            onClick={() => setIsDeleteDialogOpen(true)}
                            color="red"
                        >
                            Delete
                        </Button>
                        <Modal
                            opened={isDeleteDialogOpen}
                            onClose={() =>
                                !isDeleting
                                    ? setIsDeleteDialogOpen(false)
                                    : undefined
                            }
                            title={
                                <Group spacing="xs">
                                    <MantineIcon
                                        size="lg"
                                        icon={IconAlertCircle}
                                        color="red"
                                    />
                                    <Title order={4}>Delete</Title>
                                </Group>
                            }
                        >
                            <Text pb="md">
                                Are you sure you want to delete this user
                                attribute ?
                            </Text>
                            <Group spacing="xs" position="right">
                                <Button
                                    disabled={isDeleting}
                                    onClick={() => setIsDeleteDialogOpen(false)}
                                    variant="outline"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => {}}
                                    disabled={isDeleting}
                                    color="red"
                                >
                                    Delete
                                </Button>
                            </Group>
                        </Modal>
                    </Flex>
                </td>
            </tr>
        </>
    );
};

const UserAttributesPanel: FC = () => {
    const { classes } = useTableStyles();
    const { user } = useApp();
    const [showInviteModal, setShowInviteModal] = useState(false);
    const { data: orgUserAttributes, isLoading } = useUserAttributes();
    const { data: organization } = useOrganization();
    if (
        user.data?.ability.cannot(
            'manage',
            subject('Organization', {
                organizationUuid: organization?.organizationUuid,
            }),
        )
    ) {
        return <ForbiddenPanel />;
    }

    return (
        <Stack>
            <Group position="apart">
                <Group spacing="two">
                    <Title order={5}>User attributes</Title>
                    <Tooltip
                        multiline
                        w={400}
                        withArrow
                        label={
                            <div>
                                User attributes are metadata defined by your
                                organization. They can used to control and
                                cutomize the user experience through data access
                                and personzalization. Learn more about using
                                user attributes in the{' '}
                                <a
                                    href="https://docs.lightdash.com"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {' '}
                                    docs
                                </a>
                                .
                            </div>
                        }
                    >
                        {/* TODO add link to docs */}
                        {/* TODO keep tooltip open on hover */}

                        <MantineIcon icon={IconInfoCircle} color="gray.6" />
                    </Tooltip>
                </Group>
                <>
                    <Button onClick={() => setShowInviteModal(true)}>
                        Add new attributes
                    </Button>
                    <UserAttributeModal
                        opened={showInviteModal}
                        onClose={() => setShowInviteModal(false)}
                        onChange={() => {}}
                    />
                </>
            </Group>

            {isLoading ? (
                <LoadingState title="Loading user attributes" />
            ) : orgUserAttributes?.length === 0 ? (
                <SettingsCard shadow="none">
                    You don't have any attributes defined
                </SettingsCard>
            ) : (
                <SettingsCard shadow="none" p={0}>
                    <Table className={classes.root}>
                        <thead>
                            <tr>
                                <th>Attribute name</th>

                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {orgUserAttributes?.map((orgUserAttribute) => (
                                <UserListItem
                                    key={orgUserAttribute.uuid}
                                    orgUserAttribute={orgUserAttribute}
                                />
                            ))}
                        </tbody>
                    </Table>
                </SettingsCard>
            )}
        </Stack>
    );
};

export default UserAttributesPanel;
