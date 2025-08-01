import { Stack, Title, Text,  Card, SimpleGrid, Group, Badge, useMantineTheme  } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { type FC, useState } from 'react';
import { useParams } from 'react-router';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import ErrorState from '../components/common/ErrorState';
import { IconArrowRight } from '@tabler/icons-react';
import ConnectionsModal from '../components/ConnectionsModal';

const integrations = [
    { name: 'Shopify', status: 'Connected', icon: '/logos/shopify.svg' },
    { name: 'Google Analytics', status: 'Connected', icon: '/logos/google-analytics.svg' },
    { name: 'Meta Ads', status: 'Pending setup', icon: '/logos/meta-ads.svg' },
    { name: 'Google Ads', status: 'Pending setup', icon: '/logos/google-ads.svg' },
    { name: 'PostHog', status: 'Pending setup', icon: '/logos/posthog.svg' },
];



const Connections: FC = () => {
    const theme = useMantineTheme();
    const params = useParams<{ projectUuid: string }>();
    const projectUuid = params.projectUuid;

    const [opened, { open, close }] = useDisclosure(false);
    const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
    const [shopUrl, setShopUrl] = useState('');

    const isLoading = false;
    const error = null;

    const handleClick = (name: string) => {
        console.log(`Start setup for ${name}`);
        setSelectedIntegration(name);
        open();
    };

    const handleConnect = () => {
        console.log(`Connecting to ${selectedIntegration} with URL: ${shopUrl}`);
        close();
    }
     
    const handleRefresh = () => {
        console.log('Refershing data for${selectedIntegration}');
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
                    {integrations.map((integration) => (
                    <Card
                        key={integration.name}
                        shadow="xs"
                        padding="md"
                        radius="md"
                        withBorder
                        onClick={() => handleClick(integration.name)}
                        sx={{
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        transition: '0.3s',
                        '&:hover': { boxShadow: 6 },
                        }}
                    >
                        <Group position="apart" style={{ width: '100%' }}>
                        <Group>
                            <img
                            src={integration.icon}
                            alt={integration.name}
                            style={{ width: 24, height: 24, objectFit: 'contain' }}
                            />
                            <Text weight={500}>{integration.name}</Text>
                        </Group>
                        <Badge
                            color={
                            integration.status === 'Connected' ? 'teal' : 'yellow'
                            }
                        >
                            {integration.status}
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
            selectedIntegration={selectedIntegration}
            shopUrl={shopUrl}
            setShopUrl={setShopUrl}
            onConnect={handleConnect}
            onRefresh={handleRefresh}
            integrations={integrations}
            />
        </Page>
    );
};

export default Connections;
