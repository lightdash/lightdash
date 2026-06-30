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
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type ClipboardEvent, type FC, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { ConnectionTestResult } from '../../../features/externalConnections/components/ConnectionTestResult';
import { useConnectionSamples } from '../../../features/externalConnections/hooks/useConnectionSamples';
import { useDeleteConnectionSample } from '../../../features/externalConnections/hooks/useDeleteConnectionSample';
import { useSaveConnectionSample } from '../../../features/externalConnections/hooks/useSaveConnectionSample';
import { useTestConnection } from '../../../features/externalConnections/hooks/useTestConnection';
import MantineIcon from '../../common/MantineIcon';

const MAX_SAMPLE_PREVIEW_CHARS = 200;

type QueryParam = { uuid: string; key: string; value: string };

const parseJson = (value: string): unknown => {
    if (!value.trim()) {
        return undefined;
    }
    return JSON.parse(value);
};

const isValidJson = (value: string): boolean => {
    try {
        parseJson(value);
        return true;
    } catch {
        return false;
    }
};

/** Collapse the key/value rows into the `Record<string, string>` the API
 *  expects, dropping rows with a blank key. Returns undefined when empty. */
const buildQuery = (
    params: QueryParam[],
): Record<string, string> | undefined => {
    const entries = params
        .map((p) => [p.key.trim(), p.value] as const)
        .filter(([key]) => key.length > 0);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

/** Split a pasted path or full URL into its path and any query params, so the
 *  user doesn't have to hand-enter query params they already have in a URL. */
const parsePathInput = (
    raw: string,
): { path: string; query: { key: string; value: string }[] } => {
    let pathPart = raw;
    let search = '';
    const queryIndex = raw.indexOf('?');
    if (queryIndex >= 0) {
        pathPart = raw.slice(0, queryIndex);
        search = raw.slice(queryIndex + 1);
    }
    // A full URL was pasted — reduce it to pathname + search.
    try {
        const url = new URL(raw);
        pathPart = url.pathname;
        search = url.search.replace(/^\?/, '');
    } catch {
        // Not an absolute URL; keep the parts from the '?' split above.
    }
    const query: { key: string; value: string }[] = [];
    if (search) {
        new URLSearchParams(search).forEach((value, key) => {
            query.push({ key, value });
        });
    }
    return { path: pathPart, query };
};

const exampleFormSchema = z.object({
    method: z.enum(['GET', 'POST']),
    path: z.string().min(1, 'Path is required'),
    queryParams: z.array(
        z.object({
            uuid: z.string(),
            key: z.string(),
            value: z.string(),
        }),
    ),
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
            queryParams: [],
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

    // Pasting a URL (or path) with a query string splits the query out into the
    // key/value rows instead of leaving it stuck in the path. The pasted URL is
    // treated as the whole request, so it replaces any existing query params.
    // Only intercept when there's a query to extract; otherwise paste normally.
    const handlePathPaste = (event: ClipboardEvent<HTMLInputElement>) => {
        const pasted = event.clipboardData.getData('text');
        if (!pasted.includes('?')) return;
        event.preventDefault();
        const { path, query } = parsePathInput(pasted);
        form.setFieldValue('path', path);
        form.setFieldValue(
            'queryParams',
            query.map((q) => ({ uuid: uuidv4(), ...q })),
        );
    };

    const handleTest = () => {
        form.onSubmit((values) => {
            const request: ExternalConnectionSampleRequest = {
                method: values.method,
                path: values.path,
                query: buildQuery(values.queryParams),
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
                    onPaste={handlePathPaste}
                    {...form.getInputProps('path')}
                />
            </Group>

            <Stack gap={4}>
                <Text fz="sm" fw={500}>
                    Query params
                </Text>
                <Text c="ldGray.6" fz="xs">
                    Sent as URL query params. Tip: paste a URL with a query
                    string into the path field to fill these in automatically.
                </Text>
                {form.values.queryParams.map((param, index) => (
                    <Group key={param.uuid} gap="xs" wrap="nowrap">
                        <TextInput
                            size="xs"
                            placeholder="key"
                            style={{ flex: 1 }}
                            {...form.getInputProps(`queryParams.${index}.key`)}
                        />
                        <TextInput
                            size="xs"
                            placeholder="value"
                            style={{ flex: 1 }}
                            {...form.getInputProps(
                                `queryParams.${index}.value`,
                            )}
                        />
                        <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() =>
                                form.removeListItem('queryParams', index)
                            }
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Group>
                ))}
                <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() =>
                        form.insertListItem('queryParams', {
                            uuid: uuidv4(),
                            key: '',
                            value: '',
                        })
                    }
                >
                    Add query param
                </Button>
            </Stack>

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
