import {
    type ExternalConnection,
    type ExternalConnectionSample,
    type ExternalConnectionSampleRequest,
    type ExternalFetchResponse,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    SegmentedControl,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconTrash } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { z } from 'zod';
import { ConnectionTestResult } from '../../../features/externalConnections/components/ConnectionTestResult';
import { useConnectionSamples } from '../../../features/externalConnections/hooks/useConnectionSamples';
import { useDeleteConnectionSample } from '../../../features/externalConnections/hooks/useDeleteConnectionSample';
import { useSaveConnectionSample } from '../../../features/externalConnections/hooks/useSaveConnectionSample';
import { useTestConnection } from '../../../features/externalConnections/hooks/useTestConnection';
import MantineIcon from '../../common/MantineIcon';

const MAX_SAMPLE_PREVIEW_CHARS = 200;

const parseJson = (value: string): unknown => {
    if (!value.trim()) {
        return undefined;
    }
    return JSON.parse(value);
};

const parseQueryParams = (
    value: string,
): Record<string, string> | undefined => {
    const parsed = parseJson(value);
    if (parsed === undefined) {
        return undefined;
    }
    if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        !Object.values(parsed).every((v) => typeof v === 'string')
    ) {
        throw new Error('Query params must be a JSON object of strings');
    }
    return parsed as Record<string, string>;
};

const isValidJson = (value: string): boolean => {
    try {
        parseJson(value);
        return true;
    } catch {
        return false;
    }
};

const isValidQueryParams = (value: string): boolean => {
    try {
        parseQueryParams(value);
        return true;
    } catch {
        return false;
    }
};

const exampleFormSchema = z.object({
    method: z.enum(['GET', 'POST']),
    path: z.string().min(1, 'Path is required'),
    queryParams: z.string().refine(isValidQueryParams, {
        message: 'Query params must be a JSON object with string values',
    }),
    requestBody: z.string().refine(isValidJson, {
        message: 'Request body must be valid JSON',
    }),
    sampleLabel: z.string(),
});

type ExampleFormValues = z.infer<typeof exampleFormSchema>;

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
    connection: ExternalConnection;
};

export const ConnectionExamplesPanel: FC<Props> = ({
    projectUuid,
    connection,
}) => {
    const form = useForm<ExampleFormValues>({
        initialValues: {
            method: 'GET',
            path: '/',
            queryParams: '',
            requestBody: '',
            sampleLabel: '',
        },
        validate: zodResolver(exampleFormSchema),
    });

    // The exact request that produced the current test result. Saved verbatim so
    // a sample never pairs the latest form edits with an older response.
    const [testedRequest, setTestedRequest] =
        useState<ExternalConnectionSampleRequest | null>(null);

    const testMutation = useTestConnection();
    const saveSampleMutation = useSaveConnectionSample();

    const { data: samples } = useConnectionSamples(
        projectUuid,
        connection.externalConnectionUuid,
    );

    const handleTest = () => {
        form.onSubmit((values) => {
            const request: ExternalConnectionSampleRequest = {
                method: values.method,
                path: values.path,
                query: parseQueryParams(values.queryParams),
                body:
                    values.method === 'POST'
                        ? parseJson(values.requestBody)
                        : undefined,
            };
            setTestedRequest(request);
            testMutation.mutate({
                projectUuid,
                connectionUuid: connection.externalConnectionUuid,
                ...request,
            });
        })();
    };

    const handleSaveSample = (data: ExternalFetchResponse) => {
        // Save the immutable snapshot of the request that produced this
        // response — not the current (possibly edited) form state.
        if (!testedRequest) return;

        saveSampleMutation.mutate({
            projectUuid,
            connectionUuid: connection.externalConnectionUuid,
            label: form.values.sampleLabel.trim() || null,
            request: testedRequest,
            response: data.body,
        });
        form.setFieldValue('sampleLabel', '');
    };

    return (
        <Stack gap="md">
            <Stack gap="xs">
                <Text fw={500} fz="sm">
                    Test connection and add examples
                </Text>
                <Text c="ldGray.6" fz="xs">
                    Send a real request through this connection and optionally
                    save it as a sample for app generation.
                </Text>
            </Stack>

            <Group align="flex-end" gap="xs">
                <SegmentedControl
                    value={form.values.method}
                    onChange={(v) => {
                        form.setFieldValue('method', v as 'GET' | 'POST');
                        testMutation.reset();
                    }}
                    data={['GET', 'POST']}
                    size="xs"
                    mb="xxs"
                />
                <TextInput
                    label="Path"
                    placeholder="/v1/endpoint"
                    style={{ flexGrow: 1 }}
                    {...form.getInputProps('path')}
                />
            </Group>

            <Textarea
                label="Query params (JSON)"
                description="Sent as URL query params. Values must be strings."
                placeholder='{"latitude": "52.52", "longitude": "13.41"}'
                rows={3}
                ff="monospace"
                {...form.getInputProps('queryParams')}
            />

            {form.values.method === 'POST' && (
                <Textarea
                    label="Request body (JSON)"
                    placeholder='{"key": "value"}'
                    rows={4}
                    ff="monospace"
                    {...form.getInputProps('requestBody')}
                />
            )}

            <Group>
                <Button
                    type="button"
                    size="xs"
                    onClick={handleTest}
                    loading={testMutation.isLoading}
                >
                    Send test request
                </Button>
            </Group>

            {testMutation.data && (
                <Stack gap="xs">
                    <ConnectionTestResult response={testMutation.data} />

                    <TextInput
                        label="Sample label (optional)"
                        placeholder="e.g. Current weather Berlin"
                        size="xs"
                        {...form.getInputProps('sampleLabel')}
                    />

                    <Group>
                        <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => handleSaveSample(testMutation.data!)}
                            loading={saveSampleMutation.isLoading}
                        >
                            Save as sample
                        </Button>
                        <Text fz="xs" c="ldGray.6">
                            Saved samples ground Claude in the API&apos;s
                            response shape.
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
                    <Stack gap="xs">
                        {samples.map((sample) => (
                            <SampleRow
                                key={sample.sampleUuid}
                                sample={sample}
                                projectUuid={projectUuid}
                                connectionUuid={
                                    connection.externalConnectionUuid
                                }
                            />
                        ))}
                    </Stack>
                ) : (
                    <Text fz="xs" c="ldGray.6">
                        No saved samples yet — run a test above and save it.
                    </Text>
                )}
            </Stack>
        </Stack>
    );
};
