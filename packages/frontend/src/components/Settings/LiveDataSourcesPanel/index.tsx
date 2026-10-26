import {
    assertUnreachable,
    ApiConnectorType,
    type ExternalConnection,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Menu,
    Paper,
    Skeleton,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import {
    IconBroadcast,
    IconDots,
    IconPencil,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useExternalConnections } from '../../../features/externalConnections/hooks/useExternalConnections';
import tableStyles from '../../../hooks/styles/tableStyles.module.css';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { DeleteConnectionModal } from '../DataAppConnectionsPanel/DeleteConnectionModal';
import { PostHogConnectionModal } from './PostHogConnectionModal';

type Props = {
    projectUuid: string;
};

const connectorLabel = (connector: ApiConnectorType): string => {
    switch (connector) {
        case ApiConnectorType.POSTHOG:
            return 'PostHog';
        default:
            return assertUnreachable(
                connector,
                `Unknown connector ${connector}`,
            );
    }
};

const SourceRow: FC<{
    connection: ExternalConnection;
    onEdit: () => void;
    onDelete: () => void;
}> = ({ connection, onEdit, onDelete }) => (
    <Table.Tr>
        <Table.Td>
            <Text fw={600} fz="sm">
                {connection.name}
            </Text>
        </Table.Td>
        <Table.Td>
            <Text fz="sm">
                {connection.apiSource
                    ? connectorLabel(connection.apiSource.connector)
                    : '—'}
            </Text>
        </Table.Td>
        <Table.Td>
            <Text fz="sm" c="dimmed">
                {connection.origin}
            </Text>
        </Table.Td>
        <Table.Td>
            <Text fz="sm" c="dimmed">
                {connection.apiSource?.projectId ?? '—'}
            </Text>
        </Table.Td>
        <Table.Td w="1%">
            <Menu position="bottom-end">
                <Menu.Target>
                    <ActionIcon
                        variant="transparent"
                        size="sm"
                        aria-label={`Actions for ${connection.name}`}
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={onEdit}
                    >
                        Edit
                    </Menu.Item>
                    <Menu.Item
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={onDelete}
                    >
                        Delete
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </Table.Td>
    </Table.Tr>
);

type ModalState =
    | { kind: 'closed' }
    | { kind: 'create' }
    | { kind: 'edit'; connection: ExternalConnection }
    | { kind: 'delete'; connection: ExternalConnection };

const LiveDataSourcesPanel: FC<Props> = ({ projectUuid }) => {
    const { data: connections, isLoading } =
        useExternalConnections(projectUuid);
    const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
    const closeModal = () => setModal({ kind: 'closed' });
    const sources = (connections ?? []).filter(
        (connection) => connection.kind === 'live_source',
    );

    const addSourceButton = (
        <Button
            size="xs"
            variant="default"
            leftSection={<MantineIcon icon={IconPlus} />}
            onClick={() => setModal({ kind: 'create' })}
        >
            Add data source
        </Button>
    );

    return (
        <>
            <SettingsPage
                title="Live data sources"
                description="SaaS tools AI agents query live, without loading the data into your warehouse."
                actions={addSourceButton}
            >
                {isLoading ? (
                    <SettingsCard>
                        <Stack gap="xs">
                            <Skeleton height={48} />
                            <Skeleton height={48} />
                        </Stack>
                    </SettingsCard>
                ) : sources.length === 0 ? (
                    <SettingsEmptyState
                        icon={IconBroadcast}
                        title="No live data sources"
                        description="Connect a PostHog project to let AI agents query it alongside your warehouse."
                    />
                ) : (
                    <Paper className={tableStyles.paper}>
                        <Table
                            className={`${tableStyles.root} ${tableStyles.alignLastTdRight}`}
                            ta="left"
                        >
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th w={300}>Name</Table.Th>
                                    <Table.Th>Connector</Table.Th>
                                    <Table.Th>Host</Table.Th>
                                    <Table.Th>Project ID</Table.Th>
                                    <Table.Th></Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {sources.map((connection) => (
                                    <SourceRow
                                        key={connection.externalConnectionUuid}
                                        connection={connection}
                                        onEdit={() =>
                                            setModal({
                                                kind: 'edit',
                                                connection,
                                            })
                                        }
                                        onDelete={() =>
                                            setModal({
                                                kind: 'delete',
                                                connection,
                                            })
                                        }
                                    />
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Paper>
                )}
            </SettingsPage>

            {(modal.kind === 'create' || modal.kind === 'edit') && (
                <PostHogConnectionModal
                    opened
                    onClose={closeModal}
                    projectUuid={projectUuid}
                    connection={modal.kind === 'edit' ? modal.connection : null}
                />
            )}

            {modal.kind === 'delete' && (
                <DeleteConnectionModal
                    opened
                    onClose={closeModal}
                    projectUuid={projectUuid}
                    connection={modal.connection}
                />
            )}
        </>
    );
};

export default LiveDataSourcesPanel;
