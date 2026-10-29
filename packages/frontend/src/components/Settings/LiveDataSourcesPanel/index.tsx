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
    IconChevronDown,
    IconDots,
    IconPencil,
    IconPlus,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useSearchParams } from 'react-router';
import { useExternalConnections } from '../../../features/externalConnections/hooks/useExternalConnections';
import useHealth from '../../../hooks/health/useHealth';
import tableStyles from '../../../hooks/styles/tableStyles.module.css';
import useToaster from '../../../hooks/toaster/useToaster';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { DeleteConnectionModal } from '../DataAppConnectionsPanel/DeleteConnectionModal';
import {
    getApiSourceTarget,
    getGoogleSignInUrl,
    GOOGLE_SOURCES,
    isGoogleConnector,
} from './googleConnection';
import { GoogleConnectionModal } from './GoogleConnectionModal';
import { GoogleSourcePickerModal } from './GoogleSourcePickerModal';
import {
    getPostHogSignInUrl,
    isSignedInConnection,
    toPostHogFormValues,
} from './postHogConnection';
import { PostHogConnectionModal } from './PostHogConnectionModal';

type Props = {
    projectUuid: string;
};

const connectorLabel = (connector: ApiConnectorType): string => {
    switch (connector) {
        case ApiConnectorType.POSTHOG:
            return 'PostHog';
        case ApiConnectorType.SEARCH_CONSOLE:
            return 'Search Console';
        case ApiConnectorType.GA4:
            return 'Google Analytics';
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
    onReconnect: (() => void) | null;
    onDelete: () => void;
}> = ({ connection, onEdit, onReconnect, onDelete }) => (
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
                {connection.apiSource
                    ? getApiSourceTarget(connection.apiSource)
                    : '—'}
            </Text>
        </Table.Td>
        <Table.Td>
            <Text fz="sm" c="dimmed">
                {isSignedInConnection(connection) ? 'Signed in' : 'API key'}
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
    const sources = (connections ?? []).filter(
        (connection) => connection.kind === 'live_source',
    );

    const addSourceButton = (
        <Menu position="bottom-end">
            <Menu.Target>
                <Button
                    size="xs"
                    variant="default"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    rightSection={<MantineIcon icon={IconChevronDown} />}
                >
                    Add data source
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    onClick={() =>
                        setModal({
                            kind: 'create',
                            connector: ApiConnectorType.POSTHOG,
                        })
                    }
                >
                    PostHog
                </Menu.Item>
                {canUseGoogle &&
                    GOOGLE_SOURCES.map(({ connector, label }) => (
                        <Menu.Item
                            key={connector}
                            onClick={() =>
                                setModal({ kind: 'create', connector })
                            }
                        >
                            {label}
                        </Menu.Item>
                    ))}
            </Menu.Dropdown>
        </Menu>
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
                        description="Connect PostHog or a Google source to let AI agents query it alongside your warehouse."
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
                                    <Table.Th>Reads</Table.Th>
                                    <Table.Th>Access</Table.Th>
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
