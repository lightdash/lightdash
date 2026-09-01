import {
    EXTERNAL_CONNECTION_METHODS,
    type ApiSaveExternalConnectionSampleRequest,
    type ExternalConnection,
    type ExternalConnectionMethod,
    type ExternalConnectionSample,
    type ExternalConnectionSampleRequest,
    type ExternalFetchResponse,
    type UpdateExternalConnection,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type ClipboardEvent, type FC, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { ConnectionTestResult } from '../../../features/externalConnections/components/ConnectionTestResult';
import { useConnectionSamples } from '../../../features/externalConnections/hooks/useConnectionSamples';
import { useDeleteConnectionSample } from '../../../features/externalConnections/hooks/useDeleteConnectionSample';
import { useSaveConnectionSample } from '../../../features/externalConnections/hooks/useSaveConnectionSample';
import { useTestConnection } from '../../../features/externalConnections/hooks/useTestConnection';
import { ConfirmDeleteButton } from '../../common/ConfirmDeleteButton';
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
    method: z.enum(EXTERNAL_CONNECTION_METHODS),
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

    const handleDelete = () =>
        deleteMutation.mutate({
            projectUuid,
            connectionUuid,
            sampleUuid: sample.sampleUuid,
        });

    return (
        <Box
            p="sm"
            style={{
                borderRadius: 'var(--mantine-radius-sm)',
                border: '1px solid var(--mantine-color-ldGray-2)',
            }}
        >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4} flex={1} miw={0}>
                    <Text fw={500} fz="sm" truncate>
                        {label}
                    </Text>
                    <Text fz="xs" c="dimmed" ff="monospace" truncate>
                        {requestSummary}
                    </Text>
                    <Text fz="xs" c="ldGray.5" ff="monospace" lineClamp={2}>
                        {responsePreview}
                    </Text>
                </Stack>
                <ConfirmDeleteButton
                    size="sm"
                    loading={deleteMutation.isLoading}
                    aria-label="Delete sample"
                    tooltip="Click again to confirm"
                    onConfirm={handleDelete}
                >
                    <MantineIcon icon={IconTrash} size="sm" />
                </ConfirmDeleteButton>
            </Group>
        </Box>
    );
};

type Props = {
    projectUuid: string;
    connection: ExternalConnection;
    config: UpdateExternalConnection;
    configFingerprint: string;
    hasUnsavedChanges: boolean;
    isSampleQueued: boolean;
    onQueueSample: (sample: ApiSaveExternalConnectionSampleRequest) => void;
    onClearQueuedSample: () => void;
};

export const ConnectionExamplesPanel: FC<Props> = ({
    projectUuid,
    connection,
    config,
    configFingerprint,
    hasUnsavedChanges,
    isSampleQueued,
    onQueueSample,
    onClearQueuedSample,
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

    // The exact request and config that produced the current test result. Saved
    // verbatim so a sample never pairs later edits with an older response.
    const [testedRequest, setTestedRequest] = useState<{
        request: ExternalConnectionSampleRequest;
        configFingerprint: string;
    } | null>(null);

    const testMutation = useTestConnection();
    const saveSampleMutation = useSaveConnectionSample();

    const { data: samples } = useConnectionSamples(
        projectUuid,
        connection.externalConnectionUuid,
    );
    const allowedMethods = config.allowedMethods ?? connection.allowedMethods;
    const methodOptions = EXTERNAL_CONNECTION_METHODS.filter((method) =>
        allowedMethods.includes(method),
    );
    const method = methodOptions.includes(form.values.method)
        ? form.values.method
        : (methodOptions[0] ?? 'GET');
    // This panel stays mounted across tabs, so a draft edit can make the last
    // response stale. Keep the request inputs, but only expose results produced
    // by the current config.
    const validTestedRequest =
        testedRequest?.configFingerprint === configFingerprint
            ? testedRequest.request
            : null;
    const validTestResponse = validTestedRequest
        ? testMutation.data
        : undefined;

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
                method,
                path: values.path,
                query: buildQuery(values.queryParams),
                body:
                    method !== 'GET'
                        ? parseJson(values.requestBody)
                        : undefined,
            };
            setTestedRequest({ request, configFingerprint });
            testMutation.mutate({
                projectUuid,
                connectionUuid: connection.externalConnectionUuid,
                config,
                ...request,
            });
        })();
    };

    const handleSaveSample = (data: ExternalFetchResponse) => {
        // Save the immutable snapshot of the request that produced this
        // response — not the current (possibly edited) form state.
        if (!validTestedRequest) return;

        const sample: ApiSaveExternalConnectionSampleRequest = {
            label: form.values.sampleLabel.trim() || null,
            request: validTestedRequest,
            response: data.body,
        };
        if (hasUnsavedChanges) {
            onQueueSample(sample);
        } else {
            saveSampleMutation.mutate({
                projectUuid,
                connectionUuid: connection.externalConnectionUuid,
                ...sample,
            });
        }
        form.setFieldValue('sampleLabel', '');
    };

    return (
        <Stack gap="md">
            <Stack gap="xs">
                <Text fw={500} fz="sm">
                    Test connection and add examples
                </Text>
                <Text c="dimmed" fz="xs">
                    Send a real request through this connection and optionally
                    save it as a sample for app generation.
                </Text>
                {isSampleQueued && (
                    <Group gap="xs">
                        <Text c="dimmed" fz="xs">
                            A tested sample is queued and will be added when you
                            save the connection.
                        </Text>
                        <Button
                            type="button"
                            variant="subtle"
                            size="compact-xs"
                            onClick={onClearQueuedSample}
                        >
                            Remove
                        </Button>
                    </Group>
                )}
            </Stack>

            {methodOptions.length === 0 && (
                <Text c="dimmed" fz="sm">
                    This image-only connection does not allow proxied requests,
                    so there is nothing to test here.
                </Text>
            )}

            {methodOptions.length > 0 && (
                <Group align="flex-end" gap="xs">
                    <Select
                        label="Method"
                        w={110}
                        allowDeselect={false}
                        value={method}
                        onChange={(v) => {
                            if (!v) return;
                            form.setFieldValue(
                                'method',
                                v as ExternalConnectionMethod,
                            );
                            testMutation.reset();
                        }}
                        data={methodOptions}
                    />
                    <TextInput
                        label="Path"
                        placeholder="/v1/endpoint"
                        style={{ flexGrow: 1 }}
                        onPaste={handlePathPaste}
                        {...form.getInputProps('path')}
                    />
                </Group>
            )}

            {methodOptions.length > 0 && (
                <Stack gap={4}>
                    <Text fz="sm" fw={500}>
                        Query params
                    </Text>
                    <Text c="dimmed" fz="xs">
                        Sent as URL query params. Tip: paste a URL with a query
                        string into the path field to fill these in
                        automatically.
                    </Text>
                    {form.values.queryParams.map((param, index) => (
                        <Group key={param.uuid} gap="xs" wrap="nowrap">
                            <TextInput
                                size="xs"
                                placeholder="key"
                                flex={1}
                                {...form.getInputProps(
                                    `queryParams.${index}.key`,
                                )}
                            />
                            <TextInput
                                size="xs"
                                placeholder="value"
                                flex={1}
                                {...form.getInputProps(
                                    `queryParams.${index}.value`,
                                )}
                            />
                            <ActionIcon
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
            )}

            {methodOptions.length > 0 && method !== 'GET' && (
                <Textarea
                    label="Request body (JSON)"
                    placeholder='{"key": "value"}'
                    rows={4}
                    ff="monospace"
                    {...form.getInputProps('requestBody')}
                />
            )}

            {methodOptions.length > 0 && (
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
            )}

            {methodOptions.length > 0 && validTestResponse && (
                <Stack gap="xs">
                    <ConnectionTestResult response={validTestResponse} />

                    {validTestResponse.status < 300 && (
                        <>
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
                                    onClick={() =>
                                        handleSaveSample(validTestResponse)
                                    }
                                    loading={saveSampleMutation.isLoading}
                                >
                                    {hasUnsavedChanges
                                        ? 'Save with connection'
                                        : 'Save as sample'}
                                </Button>
                                <Text fz="xs" c="dimmed">
                                    {hasUnsavedChanges
                                        ? 'The sample will be added after you save the connection.'
                                        : 'Saved samples ground Claude in the API response shape.'}
                                </Text>
                            </Group>
                        </>
                    )}
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
                    <Text fz="xs" c="dimmed">
                        {methodOptions.length === 0
                            ? 'No saved samples yet.'
                            : 'No saved samples yet — run a test above and save it.'}
                    </Text>
                )}
            </Stack>
        </Stack>
    );
};
