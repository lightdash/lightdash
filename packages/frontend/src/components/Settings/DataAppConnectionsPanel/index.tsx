import { type ExternalConnection } from '@lightdash/common';
import { Button, Skeleton, Stack } from '@mantine-8/core';
import { IconPlug, IconPlus } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useSearchParams } from 'react-router';
import { useExternalConnections } from '../../../features/externalConnections/hooks/useExternalConnections';
import Callout from '../../common/Callout';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { AddConnectionWizard } from './AddConnectionWizard';
import { ConnectionsTable } from './ConnectionsTable';
import { DeleteConnectionModal } from './DeleteConnectionModal';
import { EditConnectionModal } from './EditConnectionModal';

type Props = {
    projectUuid: string;
};

const DataAppConnectionsPanel: FC<Props> = ({ projectUuid }) => {
    const { data: connections, isLoading } =
        useExternalConnections(projectUuid);
    // Deep-link support: the builder's connection picker links here with
    // `?create=1` to open the wizard straight away.
    const [searchParams, setSearchParams] = useSearchParams();
    const [isCreating, setIsCreating] = useState(
        () => searchParams.get('create') === '1',
    );
    const closeCreate = useCallback(() => {
        setIsCreating(false);
        if (searchParams.has('create')) {
            searchParams.delete('create');
            setSearchParams(searchParams, { replace: true });
        }
    }, [searchParams, setSearchParams]);
    const [connectionToEdit, setConnectionToEdit] = useState<
        ExternalConnection | undefined
    >(undefined);
    const [connectionToDelete, setConnectionToDelete] = useState<
        ExternalConnection | undefined
    >(undefined);
    const addConnectionButton = (
        <Button
            size="xs"
            variant="default"
            leftSection={<MantineIcon icon={IconPlus} />}
            onClick={() => setIsCreating(true)}
        >
            Add connection
        </Button>
    );
    const dataWarning = (
        <Callout variant="warning" title="Data leaves Lightdash">
            Apps linked to a connection can send any data they can query to that
            connection&apos;s external host. Only add connections to hosts you
            trust with this project&apos;s data.
        </Callout>
    );

    return (
        <>
            <SettingsPage
                title="Data app connections"
                description="Manage external connections used by this project's data apps."
                actions={addConnectionButton}
            >
                <Stack gap="md">
                    {isLoading || (connections && connections.length > 0) ? (
                        <SettingsCard>
                            <Stack gap="md">
                                {dataWarning}

                                {isLoading ? (
                                    <Stack gap="xs">
                                        <Skeleton height={48} />
                                        <Skeleton height={48} />
                                    </Stack>
                                ) : (
                                    <ConnectionsTable
                                        connections={connections}
                                        setConnectionToEdit={
                                            setConnectionToEdit
                                        }
                                        setConnectionToDelete={
                                            setConnectionToDelete
                                        }
                                    />
                                )}
                            </Stack>
                        </SettingsCard>
                    ) : (
                        <Stack gap="md">
                            {dataWarning}
                            <SettingsEmptyState
                                icon={IconPlug}
                                title="No connections"
                                description="Create a connection to let data apps call an external HTTP service."
                            />
                        </Stack>
                    )}
                </Stack>
            </SettingsPage>

            {isCreating && (
                <AddConnectionWizard
                    opened={isCreating}
                    onClose={closeCreate}
                    projectUuid={projectUuid}
                />
            )}

            {connectionToEdit && (
                <EditConnectionModal
                    opened={!!connectionToEdit}
                    onClose={() => setConnectionToEdit(undefined)}
                    projectUuid={projectUuid}
                    connection={connectionToEdit}
                />
            )}

            {connectionToDelete && (
                <DeleteConnectionModal
                    opened={!!connectionToDelete}
                    onClose={() => setConnectionToDelete(undefined)}
                    projectUuid={projectUuid}
                    connection={connectionToDelete}
                />
            )}
        </>
    );
};

export default DataAppConnectionsPanel;
