import { subject } from '@casl/ability';
import { type UserAttribute } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Modal,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconEdit,
    IconInfoCircle,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import {
    useUserAttributes,
    useUserAttributesDeleteMutation,
} from '../../../hooks/useUserAttributes';
import { useApp } from '../../../providers/AppProvider';
import LoadingState from '../../common/LoadingState';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import ForbiddenPanel from '../../ForbiddenPanel';
import UserAttributeModal from './UserAttributeModal';

const UserListItem: FC<{
    orgUserAttribute: UserAttribute;
    onEdit: () => void;
    isGroupManagementEnabled?: boolean;
}> = ({ orgUserAttribute, onEdit, isGroupManagementEnabled }) => {
    const [isDeleteDialogOpen, deleteDialog] = useDisclosure(false);
    const { mutate: deleteUserAttribute } = useUserAttributesDeleteMutation();

    return (
        <tr>
            <td>
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
                    <Group spacing="sm">
                        <Text fz="xs" color="gray.6">
                            {orgUserAttribute.users.length} user
                            {orgUserAttribute.users.length !== 1 ? 's' : ''}
                        </Text>
                        {isGroupManagementEnabled && (
                            <Text fz="xs" color="gray.6">
                                {orgUserAttribute.groups.length} group
                                {orgUserAttribute.groups.length !== 1
                                    ? 's'
                                    : ''}
                            </Text>
                        )}
                    </Group>
                </Stack>
            </td>
            <td width="1%">
                <Group noWrap spacing="xs">
                    <ActionIcon
                        color="blue.4"
                        variant="outline"
                        onClick={onEdit}
                    >
                        <MantineIcon icon={IconEdit} />
                    </ActionIcon>

                    <ActionIcon
                        variant="outline"
                        onClick={deleteDialog.open}
                        color="red"
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>

                    <Modal
                        opened={isDeleteDialogOpen}
                        onClose={deleteDialog.close}
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
                            Are you sure you want to delete this user attribute
                            ?
                        </Text>
                        <Group spacing="xs" position="right">
                            <Button
                                onClick={deleteDialog.close}
                                variant="outline"
                                color="dark"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => {
                                    deleteUserAttribute(orgUserAttribute.uuid);
                                }}
                                color="red"
                            >
                                Delete
                            </Button>
                        </Group>
                    </Modal>
                </Group>
            </td>
        </tr>
    );
};

const UserAttributesPanel: FC = () => {
    const { classes } = useTableStyles();
    const { user, health } = useApp();
    const [showAddAttributeModal, addAttributeModal] = useDisclosure(false);

    const [editAttribute, setEditAttribute] = useState<
        UserAttribute | undefined
    >();

    const { data: orgUserAttributes, isInitialLoading } = useUserAttributes();
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

    if (isInitialLoading)
        return <LoadingState title="Loading user attributes" />;

    if (!user.data || !health.data) return null;

    const isGroupManagementEnabled = health.data.hasGroups;

    return (
        <Stack>
            <Group position="apart">
                <Group spacing="two">
                    <Title order={5}>
                        {isGroupManagementEnabled
                            ? 'User and group attributes'
                            : 'User attributes'}
                    </Title>
                    <Tooltip
                        multiline
                        w={400}
                        withArrow
                        label={
                            <Box>
                                User attributes are metadata defined by your
                                organization. They can be used to control and
                                cutomize the user experience through data access
                                and personalization. Learn more about using user
                                attributes by clicking on this icon.
                            </Box>
                        }
                    >
                        <ActionIcon
                            component="a"
                            href={`${health.data?.siteHelpdeskUrl}/references/user-attributes`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <MantineIcon icon={IconInfoCircle} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
                <>
                    <Button
                        size="xs"
                        leftIcon={<MantineIcon icon={IconPlus} />}
                        onClick={addAttributeModal.open}
                    >
                        Add new attribute
                    </Button>
                    <UserAttributeModal
                        opened={showAddAttributeModal}
                        onClose={addAttributeModal.close}
                        allUserAttributes={orgUserAttributes || []}
                    />
                </>
            </Group>

            {isInitialLoading ? (
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
                                    onEdit={() =>
                                        setEditAttribute(orgUserAttribute)
                                    }
                                    isGroupManagementEnabled={
                                        isGroupManagementEnabled
                                    }
                                />
                            ))}
                        </tbody>
                    </Table>
                </SettingsCard>
            )}

            {editAttribute !== undefined && (
                <UserAttributeModal
                    opened={true}
                    userAttribute={editAttribute}
                    onClose={() => setEditAttribute(undefined)}
                    allUserAttributes={orgUserAttributes || []}
                />
            )}
        </Stack>
    );
};

export default UserAttributesPanel;
