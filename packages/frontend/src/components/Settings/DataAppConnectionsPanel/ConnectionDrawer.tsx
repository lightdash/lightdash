import {
    type ExternalConnection,
    type ExternalConnectionSample,
    type ExternalFetchResponse,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Code,
    Divider,
    Drawer,
    Group,
    ScrollArea,
    SegmentedControl,
    Stack,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine-8/core';
import { IconFlask, IconTrash } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { useConnectionSamples } from '../../../features/externalConnections/hooks/useConnectionSamples';
import { useDeleteConnectionSample } from '../../../features/externalConnections/hooks/useDeleteConnectionSample';
import { useSaveConnectionSample } from '../../../features/externalConnections/hooks/useSaveConnectionSample';
import { useTestConnection } from '../../../features/externalConnections/hooks/useTestConnection';
import useToaster from '../../../hooks/toaster/useToaster';
import MantineIcon from '../../common/MantineIcon';

const MAX_BODY_RENDER_CHARS = 4000;
const MAX_SAMPLE_PREVIEW_CHARS = 200;

type SampleRowProps = {
    sample: ExternalConnectionSample;
    projectUuid: string;
    connectionUuid: string;
};

const SampleRow: FC<SampleRowProps> = ({
    sample,
    projectUuid,
    connectionUuid,
}) => {
    const deleteMutation = useDeleteConnectionSample();
    const [confirming, setConfirming] = useState(false);

    const label =
        sample.label ?? `${sample.request.method} ${sample.request.path}`;
    const querySummary = sample.request.query
        ? ` ?${Object.entries(sample.request.query)
              .map(([k, v]) => `${k}=${v}`)
              .join('&')}`
        : '';
    const requestSummary = `${sample.request.method} ${sample.request.path}${querySummary}`;
    const responsePreview = JSON.stringify(sample.response).slice(
        0,
        MAX_SAMPLE_PREVIEW_CHARS,
    );

    const handleDelete = () => {
        if (!confirming) {
            setConfirming(true);
            return;
        }
        deleteMutation.mutate({
            projectUuid,
            connectionUuid,
            sampleUuid: sample.sampleUuid,
        });
        setConfirming(false);
    };

    return (
        <Box
            p="sm"
            style={{
                borderRadius: 'var(--mantine-radius-sm)',
                border: '1px solid var(--mantine-color-ldGray-2)',
            }}
        >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={500} fz="sm" truncate>
                        {label}
                    </Text>
                    <Text fz="xs" c="ldGray.6" ff="monospace" truncate>
                        {requestSummary}
                    </Text>
                    <Text fz="xs" c="ldGray.5" ff="monospace" lineClamp={2}>
                        {responsePreview}
                    </Text>
                </Stack>
                <ActionIcon
                    color={confirming ? 'red' : undefined}
                    variant={confirming ? 'filled' : 'subtle'}
                    size="sm"
                    loading={deleteMutation.isLoading}
                    onClick={handleDelete}
                    title={
                        confirming ? 'Click again to confirm' : 'Delete sample'
                    }
                >
                    <MantineIcon icon={IconTrash} size="sm" />
                </ActionIcon>
            </Group>
            {confirming && (
                <Text fz="xs" c="red" mt={4}>
                    Click the trash icon again to confirm deletion
                </Text>
            )}
        </Box>
    );
};

type Props = {
    projectUuid: string;
    connection: ExternalConnection | null;
    onClose: () => void;
};

export const ConnectionDrawer: FC<Props> = ({
    projectUuid,
    connection,
    onClose,
}) => {
    const [method, setMethod] = useState<'GET' | 'POST'>('GET');
    const [path, setPath] = useState('/');
    const [queryParams, setQueryParams] = useState('');
    const [requestBody, setRequestBody] = useState('');
    const [sampleLabel, setSampleLabel] = useState('');

    const { showToastError } = useToaster();
    const testMutation = useTestConnection();
    const saveSampleMutation = useSaveConnectionSample();

    const { data: samples } = useConnectionSamples(
        projectUuid,
        connection?.externalConnectionUuid,
    );

    const handleClose = () => {
        testMutation.reset();
        setMethod('GET');
        setPath('/');
        setQueryParams('');
        setRequestBody('');
        setSampleLabel('');
        onClose();
    };

    const handleTest = () => {
        if (!connection) return;

        let parsedQuery: Record<string, string> | undefined;
        if (queryParams.trim()) {
            try {
                parsedQuery = JSON.parse(queryParams);
            } catch {
                showToastError({ title: 'Query params are not valid JSON' });
                return;
            }
        }

        let parsedBody: unknown;
        if (method === 'POST' && requestBody.trim()) {
            try {
                parsedBody = JSON.parse(requestBody);
            } catch {
                showToastError({ title: 'Request body is not valid JSON' });
                return;
            }
        }

        testMutation.mutate({
            projectUuid,
            connectionUuid: connection.externalConnectionUuid,
            method,
            path,
            query: parsedQuery,
            body: parsedBody,
        });
    };

    const handleSaveSample = (data: ExternalFetchResponse) => {
        if (!connection) return;

        let parsedQuery: Record<string, string> | undefined;
        if (queryParams.trim()) {
            try {
                parsedQuery = JSON.parse(queryParams);
            } catch {
                // already validated in handleTest
            }
        }

        let parsedBody: unknown;
        if (method === 'POST' && requestBody.trim()) {
            try {
                parsedBody = JSON.parse(requestBody);
            } catch {
                // already validated in handleTest
            }
        }

        saveSampleMutation.mutate({
            projectUuid,
            connectionUuid: connection.externalConnectionUuid,
            label: sampleLabel.trim() || null,
            request: {
                method,
                path,
                query: parsedQuery,
                body: parsedBody,
            },
            response: data.body,
        });
        setSampleLabel('');
    };

    return (
        <Drawer
            opened={connection !== null}
            onClose={handleClose}
            position="right"
            size="lg"
            title={
                <Group gap="xs">
                    <MantineIcon icon={IconFlask} />
                    <Title order={5}>{connection?.name}</Title>
                </Group>
            }
        >
            <ScrollArea h="calc(100vh - 60px)" offsetScrollbars>
                <Stack p="xs" pb="xl">
                    <Stack gap="xs">
                        <Text fw={500} fz="sm">
                            Test connection
                        </Text>
                        <Text c="ldGray.6" fz="xs">
                            Send a real request through this connection and
                            optionally save it as a sample for app generation.
                        </Text>
                    </Stack>

                    <Group align="flex-end" gap="xs">
                        <SegmentedControl
                            value={method}
                            onChange={(v) => {
                                setMethod(v as 'GET' | 'POST');
                                testMutation.reset();
                            }}
                            data={['GET', 'POST']}
                            size="xs"
                        />
                        <TextInput
                            label="Path"
                            value={path}
                            onChange={(e) => setPath(e.currentTarget.value)}
                            placeholder="/v1/endpoint"
                            style={{ flexGrow: 1 }}
                        />
                    </Group>

                    <Textarea
                        label="Query params (JSON)"
                        description="Sent as URL query params. Values must be strings."
                        value={queryParams}
                        onChange={(e) => setQueryParams(e.currentTarget.value)}
                        placeholder='{"latitude": "52.52", "longitude": "13.41"}'
                        rows={3}
                        ff="monospace"
                    />

                    {method === 'POST' && (
                        <Textarea
                            label="Request body (JSON)"
                            value={requestBody}
                            onChange={(e) =>
                                setRequestBody(e.currentTarget.value)
                            }
                            placeholder='{"key": "value"}'
                            rows={4}
                            ff="monospace"
                        />
                    )}

                    <Group>
                        <Button
                            size="xs"
                            onClick={handleTest}
                            loading={testMutation.isLoading}
                            disabled={!connection}
                        >
                            Send test request
                        </Button>
                    </Group>

                    {testMutation.data && (
                        <Stack gap="xs">
                            <Group gap="xs">
                                <Badge
                                    color={
                                        testMutation.data.status < 300
                                            ? 'green'
                                            : testMutation.data.status < 500
                                              ? 'yellow'
                                              : 'red'
                                    }
                                >
                                    {testMutation.data.status}
                                </Badge>
                                <Text fz="xs" c="ldGray.6">
                                    {testMutation.data.contentType}
                                </Text>
                                {testMutation.data.truncated && (
                                    <Badge color="yellow">truncated</Badge>
                                )}
                            </Group>

                            <Code block fz="xs">
                                {JSON.stringify(
                                    testMutation.data.body,
                                    null,
                                    2,
                                ).slice(0, MAX_BODY_RENDER_CHARS)}
                            </Code>

                            <TextInput
                                label="Sample label (optional)"
                                placeholder="e.g. Current weather Berlin"
                                value={sampleLabel}
                                onChange={(e) =>
                                    setSampleLabel(e.currentTarget.value)
                                }
                                size="xs"
                            />

                            <Group>
                                <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() =>
                                        handleSaveSample(testMutation.data!)
                                    }
                                    loading={saveSampleMutation.isLoading}
                                >
                                    Save as sample
                                </Button>
                                <Text fz="xs" c="ldGray.6">
                                    Saved samples ground Claude in the
                                    API&apos;s response shape.
                                </Text>
                            </Group>
                        </Stack>
                    )}

                    <Divider my="xs" />

                    <Stack gap="xs">
                        <Text fw={500} fz="sm">
                            Saved samples
                        </Text>

                        {samples && samples.length > 0 ? (
                            <Stack
                                gap="xs"
                                mah={400}
                                style={{ overflowY: 'auto' }}
                            >
                                {samples.map((sample) => (
                                    <SampleRow
                                        key={sample.sampleUuid}
                                        sample={sample}
                                        projectUuid={projectUuid}
                                        connectionUuid={
                                            connection?.externalConnectionUuid ??
                                            ''
                                        }
                                    />
                                ))}
                            </Stack>
                        ) : (
                            <Text fz="xs" c="ldGray.6">
                                No saved samples yet — run a test above and save
                                it.
                            </Text>
                        )}
                    </Stack>
                </Stack>
            </ScrollArea>
        </Drawer>
    );
};
