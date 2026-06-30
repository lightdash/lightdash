import {
    type CreateExternalConnection,
    type ExternalConnectionMethod,
    type ExternalConnectionSampleRequest,
} from '@lightdash/common';
import {
    Button,
    Checkbox,
    Group,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { type FC, useState } from 'react';
import { ConnectionTestResult } from '../../../features/externalConnections/components/ConnectionTestResult';
import { useTestConnectionConfig } from '../../../features/externalConnections/hooks/useTestConnectionConfig';
import { type ConnectionTestResult as ConnectionTestResultValue } from './AddConnectionWizard';

type Props = {
    projectUuid: string;
    config: CreateExternalConnection;
    method: ExternalConnectionMethod;
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
    method,
    onTestResult,
    saveSample,
    onSaveSampleChange,
}) => {
    const [path, setPath] = useState('/');
    const testMutation = useTestConnectionConfig();

    const handleTest = async () => {
        const request: ExternalConnectionSampleRequest = {
            method,
            path: path.trim() || '/',
        };
        try {
            const response = await testMutation.mutateAsync({
                projectUuid,
                config,
                ...request,
            });
            onTestResult({ request, response });
        } catch {
            onTestResult(null);
        }
    };

    return (
        <Stack gap="md" mt="xl">
            <Text c="ldGray.6" fz="sm">
                Send a test request to confirm the connection works before
                saving it. This step is optional.
            </Text>

            <Group align="flex-end" gap="xs">
                <TextInput
                    label="Path"
                    description={`Sent as a ${method} request, relative to the base URL`}
                    placeholder="/v1/endpoint"
                    style={{ flexGrow: 1 }}
                    value={path}
                    onChange={(e) => setPath(e.currentTarget.value)}
                />
                <Button
                    type="button"
                    onClick={handleTest}
                    loading={testMutation.isLoading}
                >
                    Send test
                </Button>
            </Group>

            {testMutation.data && (
                <Stack gap="sm">
                    <ConnectionTestResult response={testMutation.data} />
                    <Checkbox
                        label="Save this response as an example to ground app generation"
                        checked={saveSample}
                        onChange={(e) =>
                            onSaveSampleChange(e.currentTarget.checked)
                        }
                    />
                </Stack>
            )}
        </Stack>
    );
};
