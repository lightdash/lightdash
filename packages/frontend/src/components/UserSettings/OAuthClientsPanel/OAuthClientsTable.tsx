import { type OAuthClientSummary } from '@lightdash/common';
import {
    ActionIcon,
    CopyButton,
    Group,
    Menu,
    Paper,
    Table,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconCheck,
    IconCopy,
    IconDots,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useDeleteOAuthClient } from '../../../hooks/useOAuthClients';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { EditOAuthClientModal } from './EditOAuthClientModal';
import classesModule from './OAuthClientsTable.module.css';

const OAuthClientRow: FC<{
    client: OAuthClientSummary;
}> = ({ client }) => {
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const { mutate: deleteClient, isLoading: isDeleting } =
        useDeleteOAuthClient();

    return (
        <>
            <Table.Tr>
                <Table.Td>
                    <Text fw={500} fz="sm">
                        {client.clientName}
                    </Text>
                </Table.Td>
                <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                        <Text
                            fz="sm"
                            c="dimmed"
                            className={classesModule.clientId}
                        >
                            {client.clientId}
                        </Text>
                        <CopyButton value={client.clientId}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={copied ? 'Copied' : 'Copy'}
                                    withArrow
                                    position="right"
                                >
                                    <ActionIcon
                                        size="xs"
                                        onClick={copy}
                                        variant="transparent"
                                        color="ldGray.6"
                                    >
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    </Group>
                </Table.Td>
                <Table.Td>
                    <Text fz="sm">{client.redirectUris.join(', ')}</Text>
                </Table.Td>
                <Table.Td>
                    <Text fz="sm">
                        {new Date(client.createdAt).toLocaleDateString()}
                    </Text>
                </Table.Td>
                <Table.Td w="1%">
                    <Menu withinPortal position="bottom-end">
                        <Menu.Target>
                            <ActionIcon
                                variant="transparent"
                                size="sm"
                                color="ldGray.6"
                            >
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconPencil} />}
                                onClick={() => setIsEditModalOpen(true)}
                            >
                                Edit
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconTrash} />}
                                color="red"
                                onClick={() => setIsDeleteModalOpen(true)}
                            >
                                Delete
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Table.Td>
            </Table.Tr>

            {isEditModalOpen && (
                <EditOAuthClientModal
                    client={client}
                    onClose={() => setIsEditModalOpen(false)}
                />
            )}

            <MantineModal
                opened={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title={`Delete ${client.clientName}`}
                variant="delete"
                resourceType="OAuth application"
                resourceLabel={client.clientName}
                actions={
                    <ActionIcon
                        component="button"
                        variant="filled"
                        color="red"
                        size="lg"
                        loading={isDeleting}
                        onClick={() => {
                            deleteClient(client.clientId);
                            setIsDeleteModalOpen(false);
                        }}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
                }
            />
        </>
    );
};

export const OAuthClientsTable: FC<{
    clients: OAuthClientSummary[];
}> = ({ clients }) => {
    const { cx, classes } = useTableStyles();

    return (
        <Paper withBorder style={{ overflow: 'hidden' }}>
            <Table className={cx(classes.root, classes.alignLastTdRight)}>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th className={classesModule.nameColumn}>
                            Name
                        </Table.Th>
                        <Table.Th>Client ID</Table.Th>
                        <Table.Th className={classesModule.redirectColumn}>
                            Redirect URIs
                        </Table.Th>
                        <Table.Th>Created</Table.Th>
                        <Table.Th />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {clients.map((client) => (
                        <OAuthClientRow key={client.clientId} client={client} />
                    ))}
                </Table.Tbody>
            </Table>
        </Paper>
    );
};
