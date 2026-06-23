import { type ExternalConnection } from '@lightdash/common';
import { Button, Group, Skeleton, Stack, Text, Title } from '@mantine-8/core';
import { IconPlug, IconPlus } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { useExternalConnections } from '../../../features/externalConnections/hooks/useExternalConnections';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
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

    return (
        <>
            <Stack gap="sm">
                <Group gap="xxs">
                    <Title order={5}>Data app connections</Title>
                </Group>

                <SettingsCard mb="lg">
                    <Stack gap="md">
                        <Group justify="space-between">
                            <Text c="ldGray.6" size="sm">
                                External HTTP connections that data apps in this
                                project can call. Each app must be linked to a
                                connection under an alias.
                            </Text>
                            <Button
                                size="xs"
                                variant="default"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={() => setIsCreating(true)}
                                style={{ alignSelf: 'flex-end' }}
                            >
                                Add connection
                            </Button>
                        </Group>

                        {isLoading ? (
                            <Stack gap="xs">
                                <Skeleton height={48} />
                                <Skeleton height={48} />
                            </Stack>
                        ) : connections && connections.length > 0 ? (
                            <ConnectionsTable
                                connections={connections}
                                setConnectionToEdit={setConnectionToEdit}
                                setConnectionToDelete={setConnectionToDelete}
                                onSelectConnection={setDrawerConnection}
                            />
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
                                pt="xl"
                                pb="xl"
                            />
                        )}
                    </Stack>
                </SettingsCard>
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
