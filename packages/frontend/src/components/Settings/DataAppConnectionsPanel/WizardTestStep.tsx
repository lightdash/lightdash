import {
    EXTERNAL_CONNECTION_METHODS,
    type CreateExternalConnection,
    type ExternalConnectionMethod,
    type ExternalConnectionSampleRequest,
} from '@lightdash/common';
import {
    Button,
    Checkbox,
    Group,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectionTestResult } from '../../../features/externalConnections/components/ConnectionTestResult';
import { useTestConnectionConfig } from '../../../features/externalConnections/hooks/useTestConnectionConfig';
import { type ConnectionTestResult as ConnectionTestResultValue } from './AddConnectionWizard';

type Props = {
    projectUuid: string;
    config: CreateExternalConnection;
    allowedMethods: ExternalConnectionMethod[];
    initialPath: string;
    onTestResult: (result: ConnectionTestResultValue | null) => void;
    saveSample: boolean;
    onSaveSampleChange: (value: boolean) => void;
};

/** Final wizard step: send a real request through the unsaved config (via the
 *  /test-config endpoint) to confirm it works before the connection is created.
 *  The captured result is reported up so it can be saved as a sample on create. */
export const WizardTestStep: FC<Props> = ({
    projectUuid,
    config,
    allowedMethods,
    initialPath,
    onTestResult,
    saveSample,
    onSaveSampleChange,
}) => {
    const { t } = useTranslation('settings');
    const [path, setPath] = useState(initialPath);
    const [selectedMethod, setSelectedMethod] =
        useState<ExternalConnectionMethod | null>(null);
    const [body, setBody] = useState('');
    const testMutation = useTestConnectionConfig();

    // Only the methods the connection allows can be tested — the backend rejects
    // the rest. Kept in canonical order for a stable dropdown.
    const methodOptions = EXTERNAL_CONNECTION_METHODS.filter((m) =>
        allowedMethods.includes(m),
    );
    // Clamp to a valid choice so going back and narrowing allowedMethods can't
    // leave a stale selection. Defaults to GET when allowed, else the first.
    const method: ExternalConnectionMethod =
        selectedMethod && methodOptions.includes(selectedMethod)
            ? selectedMethod
            : (methodOptions[0] ?? 'GET');

    const bodyError = (() => {
        if (method === 'GET' || !body.trim()) return null;
        try {
            JSON.parse(body);
            return null;
        } catch {
            return t('dataAppConnections.validation.invalidRequestBody');
        }
    })();

    if (allowedMethods.length === 0) {
        return (
            <Stack gap="md" mt="xl">
                <Text c="dimmed" fz="sm">
                    {t('dataAppConnections.test.imageOnly')}
                </Text>
            </Stack>
        );
    }

    const handleTest = async () => {
        let parsedBody: unknown;
        if (method !== 'GET' && body.trim()) {
            try {
                parsedBody = JSON.parse(body);
            } catch {
                return; // Invalid JSON — bodyError already surfaced.
            }
        }
        const request: ExternalConnectionSampleRequest = {
            method,
            path: path.trim() || '/',
            ...(parsedBody !== undefined ? { body: parsedBody } : {}),
        };
        try {
            const response = await testMutation.mutateAsync({
                projectUuid,
                config,
                ...request,
            });
            // Only a 2xx result is worth saving as a sample.
            onTestResult(response.status < 300 ? { request, response } : null);
        } catch {
            onTestResult(null);
        }
    };

    return (
        <Stack gap="md" mt="xl">
            <Text c="dimmed" fz="sm">
                {t('dataAppConnections.wizard.testStep.intro')}
            </Text>

            <Group align="flex-end" gap="xs">
                <Select
                    label={t('dataAppConnections.test.method')}
                    w={110}
                    allowDeselect={false}
                    value={method}
                    onChange={(v) => {
                        if (!v) return;
                        setSelectedMethod(v as ExternalConnectionMethod);
                        // A result from the previous method no longer matches
                        // the request being described — clear it.
                        testMutation.reset();
                        onTestResult(null);
                    }}
                    data={methodOptions}
                />
                <TextInput
                    label={t('dataAppConnections.test.path')}
                    description={t(
                        'dataAppConnections.wizard.testStep.pathDescription',
                    )}
                    placeholder="/v1/endpoint"
                    flex={1}
                    value={path}
                    onChange={(e) => setPath(e.currentTarget.value)}
                />
            </Group>

            {method !== 'GET' && (
                <Textarea
                    label={t('dataAppConnections.test.requestBodyJson')}
                    placeholder='{"key": "value"}'
                    rows={4}
                    ff="monospace"
                    value={body}
                    onChange={(e) => setBody(e.currentTarget.value)}
                    error={bodyError}
                />
            )}

            <Group>
                <Button
                    type="button"
                    onClick={handleTest}
                    loading={testMutation.isLoading}
                    disabled={!!bodyError}
                >
                    {t('dataAppConnections.wizard.testStep.sendTest')}
                </Button>
            </Group>

            {testMutation.data && (
                <Stack gap="sm">
                    <ConnectionTestResult response={testMutation.data} />
                    {testMutation.data.status < 300 && (
                        <Checkbox
                            label={t(
                                'dataAppConnections.wizard.testStep.saveSample',
                            )}
                            checked={saveSample}
                            onChange={(e) =>
                                onSaveSampleChange(e.currentTarget.checked)
                            }
                        />
                    )}
                </Stack>
            )}
        </Stack>
    );
};
