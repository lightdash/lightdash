import { type ExternalConnection } from '@lightdash/common';
import {
    Button,
    Group,
    LoadingOverlay,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconPlug, IconPlus } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { useExternalConnections } from '../../../features/externalConnections/hooks/useExternalConnections';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import { ConnectionDrawer } from './ConnectionDrawer';
import { ConnectionsTable } from './ConnectionsTable';
import { CreateConnectionModal } from './CreateConnectionModal';
import { DeleteConnectionModal } from './DeleteConnectionModal';
import { EditConnectionModal } from './EditConnectionModal';

type Props = {
    projectUuid: string;
};

const DataAppConnectionsPanel: FC<Props> = ({ projectUuid }) => {
    const { data: connections, isLoading } =
        useExternalConnections(projectUuid);
    const [isCreating, setIsCreating] = useState(false);
    const [connectionToEdit, setConnectionToEdit] = useState<
        ExternalConnection | undefined
    >(undefined);
    const [connectionToDelete, setConnectionToDelete] = useState<
        ExternalConnection | undefined
    >(undefined);
    const [drawerConnection, setDrawerConnection] =
        useState<ExternalConnection | null>(null);

    if (isLoading) {
        return <LoadingOverlay visible={isLoading} />;
    }

    return (
        <>
            <Stack mb="lg">
                {connections && connections.length > 0 ? (
                    <>
                        <Group justify="space-between">
                            <Stack gap="xs">
                                <Title order={5}>Data app connections</Title>
                                <Text c="ldGray.6" fz="xs">
                                    External HTTP connections that data apps in
                                    this project can call. Each app must be
                                    linked to a connection under an alias.
                                </Text>
                            </Stack>
                            <Button
                                size="xs"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={() => setIsCreating(true)}
                            >
                                Add connection
                            </Button>
                        </Group>
                        <ConnectionsTable
                            connections={connections}
                            setConnectionToEdit={setConnectionToEdit}
                            setConnectionToDelete={setConnectionToDelete}
                            onSelectConnection={setDrawerConnection}
                        />
                    </>
                ) : (
                    <EmptyState
                        icon={
                            <MantineIcon
                                icon={IconPlug}
                                color="ldGray.6"
                                stroke={1}
                                size="5xl"
                            />
                        }
                        title="No connections"
                        description="You haven't created any data app connections yet!"
                    >
                        <Button onClick={() => setIsCreating(true)}>
                            Add connection
                        </Button>
                    </EmptyState>
                )}
            </Stack>

            <ConnectionDrawer
                projectUuid={projectUuid}
                connection={drawerConnection}
                onClose={() => setDrawerConnection(null)}
            />

            {isCreating && (
                <CreateConnectionModal
                    opened={isCreating}
                    onClose={() => setIsCreating(false)}
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
