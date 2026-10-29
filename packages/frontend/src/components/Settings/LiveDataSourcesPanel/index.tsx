import {
    formatEstimatedBytes,
    type ApiConnectorType,
    type ExternalConnection,
    type ExternalConnectionApiUsage,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
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
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useSearchParams } from 'react-router';
import { useExternalConnectionApiUsage } from '../../../features/externalConnections/hooks/useExternalConnectionApiUsage';
import { useExternalConnections } from '../../../features/externalConnections/hooks/useExternalConnections';
import { getLiveSource } from '../../../features/externalConnections/liveSources/liveSourceCatalog';
import { LiveSourceIcon } from '../../../features/externalConnections/liveSources/LiveSourceIcon';
import useHealth from '../../../hooks/health/useHealth';
import tableStyles from '../../../hooks/styles/tableStyles.module.css';
import useToaster from '../../../hooks/toaster/useToaster';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { DeleteConnectionModal } from '../DataAppConnectionsPanel/DeleteConnectionModal';
import { AddLiveSourceModal } from './AddLiveSourceModal';
import { getGoogleSignInUrl, isGoogleConnector } from './googleConnection';
import { GoogleConnectionModal } from './GoogleConnectionModal';
import { GoogleSourcePickerModal } from './GoogleSourcePickerModal';
import { getPostHogSignInUrl, toPostHogFormValues } from './postHogConnection';
import { PostHogConnectionModal } from './PostHogConnectionModal';

type Props = {
    projectUuid: string;
};

const integrationLabel = (connection: ExternalConnection) =>
    connection.apiSource
        ? getLiveSource(connection.apiSource.connector).label
        : '';

const byIntegrationThenName = (a: ExternalConnection, b: ExternalConnection) =>
    integrationLabel(a).localeCompare(integrationLabel(b)) ||
    a.name.localeCompare(b.name);

const SourceRow: FC<{
    connection: ExternalConnection;
    usage: ExternalConnectionApiUsage | null;
    onEdit: () => void;
    onReconnect: (() => void) | null;
    onDelete: () => void;
}> = ({ connection, usage, onEdit, onReconnect, onDelete }) => (
    <Table.Tr>
        <Table.Td>
            {connection.apiSource ? (
                <Group gap="xs" wrap="nowrap">
                    <LiveSourceIcon
                        connector={connection.apiSource.connector}
                    />
                    <Text fz="sm">{integrationLabel(connection)}</Text>
                </Group>
            ) : (
                <Text fz="sm" c="dimmed">
                    —
                </Text>
            )}
        </Table.Td>
        <Table.Td>
            <Text fw={600} fz="sm">
                {connection.name}
            </Text>
        </Table.Td>
        <Table.Td ta="right">
            <Text fz="sm">
                {formatEstimatedBytes(usage?.responseBytes ?? 0)}
            </Text>
        </Table.Td>
        <Table.Td ta="right">
            <Text fz="sm">{(usage?.apiCalls ?? 0).toLocaleString()}</Text>
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
                    {onReconnect && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconRefresh} />}
                            onClick={onReconnect}
                        >
                            Reconnect
                        </Menu.Item>
                    )}
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
    | { kind: 'pick' }
    | { kind: 'create'; connector: ApiConnectorType }
    | { kind: 'edit'; connection: ExternalConnection }
    | { kind: 'delete'; connection: ExternalConnection };

const modalConnector = (modal: ModalState): ApiConnectorType | null => {
    switch (modal.kind) {
        case 'create':
            return modal.connector;
        case 'edit':
            return modal.connection.apiSource?.connector ?? null;
        default:
            return null;
    }
};

const LiveDataSourcesPanel: FC<Props> = ({ projectUuid }) => {
    const { data: connections, isLoading } =
        useExternalConnections(projectUuid);
    const { data: usage } = useExternalConnectionApiUsage(projectUuid);
    const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
    const closeModal = () => setModal({ kind: 'closed' });
    const { data: health } = useHealth();
    const canSignIn = health?.hasPostHogOAuth ?? false;
    const canUseGoogle = health?.hasGoogleLiveSources ?? false;
    const { showToastSuccess, showToastError } = useToaster();

    // Sign-in callbacks land here with their outcome.
    const [searchParams, setSearchParams] = useSearchParams();
    const isPickingGoogleSource =
        searchParams.get('pickGoogleSource') === 'true';
    const closeGoogleSourcePicker = () => {
        searchParams.delete('pickGoogleSource');
        setSearchParams(searchParams, { replace: true });
    };
    useEffect(() => {
        const connected = searchParams.get('connected');
        const signInError = searchParams.get('signInError');
        if (!connected && !signInError) return;
        if (signInError) {
            showToastError({
                title: 'Could not connect the source',
                subtitle: signInError,
            });
        } else {
            showToastSuccess({ title: 'Source connected' });
        }
        searchParams.delete('connected');
        searchParams.delete('signInError');
        setSearchParams(searchParams, { replace: true });
    }, [searchParams, setSearchParams, showToastError, showToastSuccess]);
    const sources = (connections ?? [])
        .filter((connection) => connection.kind === 'live_source')
        .sort(byIntegrationThenName);

    const addSourceButton = (
        <Button
            size="xs"
            variant="default"
            leftSection={<MantineIcon icon={IconPlus} />}
            onClick={() => setModal({ kind: 'pick' })}
        >
            Add data source
        </Button>
    );

    const getReconnect = (connection: ExternalConnection) => {
        const connector = connection.apiSource?.connector;
        if (connector && isGoogleConnector(connector)) {
            return canUseGoogle
                ? () =>
                      window.location.assign(
                          getGoogleSignInUrl(
                              projectUuid,
                              connector,
                              connection.name,
                              connection.externalConnectionUuid,
                          ),
                      )
                : null;
        }
        return canSignIn
            ? () =>
                  window.location.assign(
                      getPostHogSignInUrl(
                          projectUuid,
                          toPostHogFormValues(connection, canSignIn),
                          connection.externalConnectionUuid,
                      ),
                  )
            : null;
    };
    const connector = modalConnector(modal);

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
                        description="Connect PostHog, Google Analytics or Search Console so AI agents can query them alongside your warehouse."
                    />
                ) : (
                    <Paper className={tableStyles.paper}>
                        <Table
                            className={`${tableStyles.root} ${tableStyles.alignLastTdRight}`}
                            ta="left"
                        >
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th w={260}>Integration</Table.Th>
                                    <Table.Th>Name</Table.Th>
                                    <Table.Th ta="right">Data read</Table.Th>
                                    <Table.Th ta="right">API calls</Table.Th>
                                    <Table.Th></Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {sources.map((connection) => (
                                    <SourceRow
                                        key={connection.externalConnectionUuid}
                                        connection={connection}
                                        usage={
                                            usage?.find(
                                                (row) =>
                                                    row.externalConnectionUuid ===
                                                    connection.externalConnectionUuid,
                                            ) ?? null
                                        }
                                        onEdit={() =>
                                            setModal({
                                                kind: 'edit',
                                                connection,
                                            })
                                        }
                                        onReconnect={getReconnect(connection)}
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

            <AddLiveSourceModal
                opened={modal.kind === 'pick'}
                onClose={closeModal}
                projectUuid={projectUuid}
                canUseGoogle={canUseGoogle}
                onPick={(picked: ApiConnectorType) =>
                    setModal({ kind: 'create', connector: picked })
                }
            />

            {(modal.kind === 'create' || modal.kind === 'edit') &&
                connector !== null &&
                (isGoogleConnector(connector) ? (
                    <GoogleConnectionModal
                        opened
                        onClose={closeModal}
                        projectUuid={projectUuid}
                        connector={connector}
                        connection={
                            modal.kind === 'edit' ? modal.connection : null
                        }
                    />
                ) : (
                    <PostHogConnectionModal
                        opened
                        onClose={closeModal}
                        projectUuid={projectUuid}
                        connection={
                            modal.kind === 'edit' ? modal.connection : null
                        }
                        canSignIn={canSignIn}
                    />
                ))}

            {isPickingGoogleSource && (
                <GoogleSourcePickerModal
                    projectUuid={projectUuid}
                    onClose={closeGoogleSourcePicker}
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
