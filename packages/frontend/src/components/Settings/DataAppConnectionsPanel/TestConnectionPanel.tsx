import {
    type ExternalConnection,
    type ExternalFetchResponse,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Code,
    Divider,
    Group,
    NativeSelect,
    SegmentedControl,
    Stack,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine-8/core';
import { IconFlask } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { useSaveConnectionSample } from '../../../features/externalConnections/hooks/useSaveConnectionSample';
import { useTestConnection } from '../../../features/externalConnections/hooks/useTestConnection';
import useToaster from '../../../hooks/toaster/useToaster';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    projectUuid: string;
    connections: ExternalConnection[];
};

const MAX_BODY_RENDER_CHARS = 4000;

export const TestConnectionPanel: FC<Props> = ({
    projectUuid,
    connections,
}) => {
    const [selectedUuid, setSelectedUuid] = useState<string>(
        connections[0]?.externalConnectionUuid ?? '',
    );
    const [method, setMethod] = useState<'GET' | 'POST'>('GET');
    const [path, setPath] = useState('/');
    const [requestBody, setRequestBody] = useState('');

    const { showToastError } = useToaster();
    const testMutation = useTestConnection();
    const saveSampleMutation = useSaveConnectionSample();

    const selectedConnection = connections.find(
        (c) => c.externalConnectionUuid === selectedUuid,
    );

    const handleTest = () => {
        if (!selectedConnection) return;

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
            connectionUuid: selectedConnection.externalConnectionUuid,
            method,
            path,
            body: parsedBody,
        });
    };

    const handleSaveSample = (data: ExternalFetchResponse) => {
        if (!selectedConnection) return;
        saveSampleMutation.mutate({
            projectUuid,
            connectionUuid: selectedConnection.externalConnectionUuid,
            sample: data.body,
        });
    };

    const connectionOptions = connections.map((c) => ({
        value: c.externalConnectionUuid,
        label: c.name,
    }));

    return (
        <Stack>
            <Divider />
            <Group>
                <MantineIcon icon={IconFlask} size="md" />
                <Title order={5}>Test connection</Title>
            </Group>
            <Text c="ldGray.6" fz="xs">
                Send a real request through the connection and optionally save
                the response shape as a sample for app generation.
            </Text>

            <NativeSelect
                label="Connection"
                data={connectionOptions}
                value={selectedUuid}
                onChange={(e) => {
                    setSelectedUuid(e.currentTarget.value);
                    testMutation.reset();
                }}
                w={320}
            />

            <Group align="flex-end" gap="xs">
                <SegmentedControl
                    value={method}
                    onChange={(v) => setMethod(v as 'GET' | 'POST')}
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

            {method === 'POST' && (
                <Textarea
                    label="Request body (JSON)"
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.currentTarget.value)}
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
                    disabled={!selectedConnection}
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
                        {JSON.stringify(testMutation.data.body, null, 2).slice(
                            0,
                            MAX_BODY_RENDER_CHARS,
                        )}
                    </Code>

                    <Group>
                        <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleSaveSample(testMutation.data!)}
                            loading={saveSampleMutation.isLoading}
                        >
                            Save as sample
                        </Button>
                        <Text fz="xs" c="ldGray.6">
                            Saved samples are used during app generation to
                            ground Claude in the API&apos;s response shape.
                        </Text>
                    </Group>
                </Stack>
            )}
        </Stack>
    );
};
