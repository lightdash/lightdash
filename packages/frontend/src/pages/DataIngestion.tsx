// src/pages/DataIngestion.tsx (or wherever your route lives)

import { Stack, Title, Text, Button, Card } from '@mantine/core';
import { type FC } from 'react';
import { useParams } from 'react-router';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import ErrorState from '../components/common/ErrorState';

const DataIngestion: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const projectUuid = params.projectUuid;

    // Placeholder loading/error logic
    const isLoading = false;
    const error = null;

    if (isLoading) return <PageSpinner />;
    if (error) return <ErrorState error={error} />;

    return (
        <Page withFixedContent withPaddedContent withFooter>
            <Stack spacing="xl">
                <Title order={2}>Data Ingestion</Title>
                <Text color="dimmed">
                    Connect and sync data from your external sources.
                </Text>

                <Card withBorder shadow="sm" padding="lg" radius="md">
                    <Stack spacing="sm">
                        <Title order={4}>Start a new integration</Title>
                        <Text size="sm" color="dimmed">
                            Add a connector to begin syncing your data into the platform.
                        </Text>
                        <Button variant="filled" color="blue">
                            + Add Data Source
                        </Button>
                    </Stack>
                </Card>

                <Card withBorder shadow="sm" padding="lg" radius="md">
                    <Title order={5}>Connected Sources</Title>
                    <Text size="sm" color="dimmed">
                        No data sources connected yet.
                    </Text>
                </Card>
            </Stack>
        </Page>
    );
};

export default DataIngestion;
