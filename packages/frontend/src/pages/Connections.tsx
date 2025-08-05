import { Stack, Title, Text, Card, SimpleGrid, Group, Badge, useMantineTheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { type FC, useState } from 'react';
import { useParams } from 'react-router';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import ErrorState from '../components/common/ErrorState';
import { IconArrowRight } from '@tabler/icons-react';
import ConnectionsModal from '../components/ConnectionsModal';
import useConnections from '../hooks/useConnections';
import { Connection, ConnectionType } from '@lightdash/common';
import { lightdashApi } from '../api';



const Connections: FC = () => {
    const theme = useMantineTheme();
    const params = useParams<{ projectUuid: string }>();

    const { data: connections } = useConnections() || [];
    const [opened, { open, close }] = useDisclosure(false);
    const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);

    const updateConnectionName = (newName: string) => {
    if (selectedConnection) {
        setSelectedConnection({
            ...selectedConnection,
            name: newName,
        });
    }
};


    const isLoading = false;
    const error = null;

    const handleClick = (name: string) => {
        console.log(`Start setup for ${name}`);
        if (!connections) return;
        setSelectedConnection(connections.find(conn => conn.name === name) || null);
        open();
    };


    const handleConnect = () => {
        if (!selectedConnection) return;
        console.log(`Connecting to ${selectedConnection} with URL: ${selectedConnection.name}`);

        const redirectUrl = `${selectedConnection.startUrl}?shop=${encodeURIComponent(selectedConnection.name)}`;
        console.log(`Redirecting to: ${redirectUrl}`);
        window.open(redirectUrl, '_blank');
 
    }

    const handleRefresh = () => {
        console.log('Refershing data for${selectedIntegration}');
        lightdashApi({
            url: '/auth/shopify/refresh',
            method: 'POST',
            body: JSON.stringify({
                shopUrl: selectedConnection?.name,
            }),
        });
        // Optionally close the modal after refreshing
        close();
    };


    if (isLoading) return <PageSpinner />;
    if (error) return <ErrorState error={error} />;
    if (!connections || connections.length === 0) return <div>No connections found. </div>;

    return (
        <Page withFixedContent withPaddedContent withFooter>
            <Stack spacing="xl">
                <Title order={2}>Connections</Title>
                <Text color="dimmed">
                    Connect and sync data from your external sources. Refresh page to verify connection status.
                </Text>

                <Card withBorder shadow="sm" padding="lg" radius="md">
                    <Stack spacing="md">
                        <Title order={5}>My Connections</Title>
                        <SimpleGrid cols={3} spacing="md">
                            {connections.map((conn) => (
                                <Card
                                    key={conn.name}
                                    shadow="xs"
                                    padding="md"
                                    radius="md"
                                    withBorder
                                    onClick={() => handleClick(conn.name)}
                                    sx={{
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        transition: '0.3s',
                                        '&:hover': { boxShadow: theme.shadows.md },
                                    }}
                                >
                                    <Group position="apart" style={{ width: '100%' }}>
                                        <Group>
                                            <img
                                                src={conn.icon || '/logos/default.svg'}
                                                alt={conn.name}
                                                style={{ width: 24, height: 24, objectFit: 'contain' }}
                                            />
                                            <Text weight={500}>{conn.name}</Text>
                                        </Group>
                                        <Badge
                                            color={
                                                conn.is_connected ? 'teal' : 'yellow'
                                            }
                                        >
                                            {conn.is_connected ? 'Connected' : 'Disconnected'}
                                        </Badge>
                                        <IconArrowRight size={16} stroke={2} />
                                    </Group>
                                </Card>
                            ))}
                        </SimpleGrid>
                    </Stack>
                </Card>
            </Stack>
            <ConnectionsModal
                opened={opened}
                onClose={close}
                selectedConnection={selectedConnection}
                updateConnection={updateConnectionName}
                handleConnect={handleConnect}
                handleRefresh={handleRefresh}
            />
        </Page>
    );
};

export default Connections;
