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
import { Connection } from '@lightdash/common';
import { lightdashApi } from '../api';
import { CONNECTORS_REGISTRY } from '../connectors_registry';
import GaConnectedModal from '../components/GAConnectedModal';

const Connections: FC = () => {
    const theme = useMantineTheme();
    const params = useParams<{ projectUuid: string }>();
    const projectUuid = params.projectUuid;

    const { data: connections } = useConnections() || [];
    const connectedMap = Object.fromEntries(
        (connections || []).map(conn => [conn.type, conn])
    );

    const [opened, { open, close }] = useDisclosure(false);
    const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
    const [selectedConfig, setSelectedConfig] = useState<any | null>(null);
    const [shopUrl, setShopUrl] = useState<string>('');


    const isLoading = false;
    const error = null;

    const handleClick = (type: string, config: any) => {
        // if (!connections) return;
        console.log('Selected connection:', connections);
        console.log('config:', config);
        console.log('type:', type);
        if(connections)    setSelectedConnection(connections.find(conn => conn.type === type) || null);
        setSelectedConfig(config);
        open();
    };

    const handleConnect = async (config: { key: string }) => {
        console.log('Connecting with config:', config);
        try {
            const payload = {
                projectUuid,
                shop_url: shopUrl || undefined,
                returnPath: '/connections',
            };

            const resp = await lightdashApi<any>({
                url: `/connectors/${config.key}/start`,
                method: 'POST',
                body: JSON.stringify(payload),               // <- serialize
                headers: { 'Content-Type': 'application/json' }, // <- set header
            });
            console.log('Starting connector OAuth:', resp);
            console.log('Redirecting to:', resp.startUrl);

            window.location.assign(resp.startUrl);
        } catch (error) {
            console.error('Failed to start connector OAuth:', error);
        } finally {
            close();
        }
    };

    const handleRefresh = () => {
        lightdashApi({
            url: selectedConfig.ingestEndpoint,
            method: 'POST',
            body: JSON.stringify({
                shopUrl: selectedConnection?.shopUrl,
            }),
        });
        close();
    };

    if (isLoading) return <PageSpinner />;
    if (error) return <ErrorState error={error} />;

    return (
        <Page withFixedContent withPaddedContent withFooter>
            <Stack spacing="xl">
                <Title order={2}>Connections</Title>
                <Text color="dimmed">
                    Connect and sync data from your external sources.
                </Text>

                <Card withBorder shadow="sm" padding="lg" radius="md">
                    <Stack spacing="md">
                        <Title order={5}>My Connections</Title>
                        <SimpleGrid cols={3} spacing="md">
                            {Object.entries(CONNECTORS_REGISTRY).map(([type, cfg]) => {
                                const actual = connectedMap[type];
                                return (
                                    <Card
                                        key={type}
                                        shadow="xs"
                                        padding="md"
                                        radius="md"
                                        withBorder
                                        onClick={() => handleClick(type, cfg)}
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
                                                    src={cfg.icon || '/logos/default.svg'}
                                                    alt={cfg.name}
                                                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                                                />
                                                <Text weight={500}>{cfg.name}</Text>
                                            </Group>
                                            <Badge color={actual ? 'teal' : 'yellow'}>
                                                {actual ? 'Connected' : 'Disconnected'}
                                            </Badge>
                                            <IconArrowRight size={16} stroke={2} />
                                        </Group>
                                    </Card>
                                );
                            })}

                            {selectedConnection && selectedConfig?.key === 'ga' ? (
                                <GaConnectedModal
                                    opened={opened}
                                    onClose={close}
                                    connectionUuid={selectedConnection.connectionUuid}
                                    config={selectedConfig || {}}
                                />
                            ) : (
                                <ConnectionsModal
                                    opened={opened}
                                    onClose={close}
                                    handleConnect={handleConnect}
                                    handleRefresh={handleRefresh}
                                    config={selectedConfig || {}}
                                    shopUrl={shopUrl}
                                    setShopUrl={setShopUrl}
                                />
                            )}
                        </SimpleGrid>
                    </Stack>
                </Card>
            </Stack>
        </Page>
    );
};

export default Connections;
