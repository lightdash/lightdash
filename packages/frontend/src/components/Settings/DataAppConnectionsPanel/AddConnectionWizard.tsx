import {
    type ApiKeyLocation,
    type CreateExternalConnection,
    type ExternalConnectionAuthType,
    type ExternalConnectionMethod,
    type ExternalConnectionSampleRequest,
    type ExternalFetchResponse,
} from '@lightdash/common';
import {
    PasswordInput,
    SegmentedControl,
    Select,
    Stack,
    Stepper,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { IconPlugConnected } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { MethodsField } from '../../../features/externalConnections/components/MethodsField';
import { PathRulesField } from '../../../features/externalConnections/components/PathRulesField';
import { useCreateExternalConnection } from '../../../features/externalConnections/hooks/useCreateExternalConnection';
import { useSaveConnectionSample } from '../../../features/externalConnections/hooks/useSaveConnectionSample';
import {
    resolvePathPrefixes,
    type PathMode,
    type PathPrefix,
} from '../../../features/externalConnections/utils/pathRules';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';
import { WizardTestStep } from './WizardTestStep';

// Content types stay hidden in the onboarding wizard and the optional numeric
// limits fall back to server defaults. Power users tune them in the Edit form.
const DEFAULT_ALLOWED_CONTENT_TYPES = ['application/json'];

// RFC 7230 token chars — must match the backend's apiKeyName validator.
const HTTP_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

const TEST_STEP = 3;

type WizardValues = {
    name: string;
    origin: string;
    type: ExternalConnectionAuthType;
    secret: string;
    apiKeyName: string;
    apiKeyLocation: ApiKeyLocation;
    allowedMethods: ExternalConnectionMethod[];
    pathMode: PathMode;
    allowedPathPrefixes: PathPrefix[];
};

export type ConnectionTestResult = {
    request: ExternalConnectionSampleRequest;
    response: ExternalFetchResponse;
};

const validateOrigin = (value: string): string | null => {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return 'Enter a valid URL, e.g. https://api.example.com';
    }
    if (url.protocol !== 'https:') {
        return 'URL must start with https://';
    }
    if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
        return 'Enter just the base URL, with no path or query';
    }
    return null;
};

const toCreatePayload = (values: WizardValues): CreateExternalConnection => ({
    name: values.name.trim(),
    origin: values.origin,
    type: values.type,
    secret: values.type !== 'none' ? values.secret : null,
    apiKeyName: values.type === 'api_key' ? values.apiKeyName.trim() : null,
    apiKeyLocation: values.type === 'api_key' ? values.apiKeyLocation : null,
    allowedMethods: values.allowedMethods,
    allowedPathPrefixes: resolvePathPrefixes(
        values.pathMode,
        values.allowedPathPrefixes,
    ),
    allowedContentTypes: DEFAULT_ALLOWED_CONTENT_TYPES,
});

const ConnectStep: FC<{ form: UseFormReturnType<WizardValues> }> = ({
    form,
}) => (
    <Stack gap="sm" mt="xl">
        <Text c="ldGray.6" fz="sm">
            Give your connection a name and the base URL of the API your data
            apps should be able to call.
        </Text>
        <TextInput
            required
            label="Name"
            placeholder="My API"
            data-autofocus
            {...form.getInputProps('name')}
        />
        <TextInput
            required
            label="Base URL"
            description="The remote origin apps may call (https only, no path)"
            placeholder="https://api.example.com"
            {...form.getInputProps('origin')}
        />
    </Stack>
);

const AuthStep: FC<{ form: UseFormReturnType<WizardValues> }> = ({ form }) => {
    const { type } = form.values;
    return (
        <Stack gap="sm" mt="xl">
            <Stack gap={4}>
                <Text fz="sm" fw={500}>
                    How should we authenticate?
                </Text>
                <SegmentedControl
                    fullWidth
                    data={[
                        { value: 'none', label: 'None' },
                        { value: 'api_key', label: 'API key' },
                        { value: 'bearer_token', label: 'Bearer token' },
                    ]}
                    value={type}
                    onChange={(value) =>
                        form.setFieldValue(
                            'type',
                            value as ExternalConnectionAuthType,
                        )
                    }
                />
            </Stack>

            {type !== 'none' && (
                <PasswordInput
                    required
                    label={type === 'api_key' ? 'API key' : 'Bearer token'}
                    placeholder={
                        type === 'api_key'
                            ? 'Your secret API key'
                            : 'Your bearer token'
                    }
                    {...form.getInputProps('secret')}
                />
            )}

            {type === 'api_key' && (
                <>
                    <TextInput
                        required
                        label="API key name"
                        description="The header or query parameter the key is sent in"
                        placeholder="X-Api-Key"
                        {...form.getInputProps('apiKeyName')}
                    />
                    <Select
                        label="Send key as"
                        data={[
                            { value: 'header', label: 'Request header' },
                            { value: 'query', label: 'Query parameter' },
                        ]}
                        {...form.getInputProps('apiKeyLocation')}
                    />
                </>
            )}
        </Stack>
    );
};

const AccessStep: FC<{ form: UseFormReturnType<WizardValues> }> = ({
    form,
}) => (
    <Stack gap="lg" mt="xl">
        <MethodsField
            label="Which methods can apps use?"
            value={form.values.allowedMethods}
            onChange={(value) => form.setFieldValue('allowedMethods', value)}
            error={form.errors.allowedMethods}
        />
        <PathRulesField
            label="Which paths can apps call?"
            mode={form.values.pathMode}
            onModeChange={(mode) => form.setFieldValue('pathMode', mode)}
            prefixes={form.values.allowedPathPrefixes}
            onPrefixesChange={(prefixes) =>
                form.setFieldValue('allowedPathPrefixes', prefixes)
            }
            error={form.errors.allowedPathPrefixes}
        />
    </Stack>
);

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
};

export const AddConnectionWizard: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
}) => {
    const [active, setActive] = useState(0);
    // The last successful test on the current visit to the test step. Captured
    // verbatim so it can be saved as a sample after the connection is created.
    const [testResult, setTestResult] = useState<ConnectionTestResult | null>(
        null,
    );
    const [saveSample, setSaveSample] = useState(true);

    const { mutateAsync: createConnection, isLoading: isCreating } =
        useCreateExternalConnection();
    const { mutateAsync: saveConnectionSample, isLoading: isSavingSample } =
        useSaveConnectionSample();

    const form = useForm<WizardValues>({
        initialValues: {
            name: '',
            origin: '',
            type: 'none',
            secret: '',
            apiKeyName: '',
            apiKeyLocation: 'header',
            allowedMethods: ['GET'],
            pathMode: 'all',
            allowedPathPrefixes: [],
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
            origin: validateOrigin,
            secret: (value, values) =>
                values.type !== 'none' && value.length === 0
                    ? 'A secret is required for this auth method'
                    : null,
            apiKeyName: (value, values) => {
                if (values.type !== 'api_key') return null;
                if (value.trim().length === 0)
                    return 'API key name is required';
                return HTTP_TOKEN.test(value.trim())
                    ? null
                    : 'Use a valid header or query parameter name';
            },
            allowedMethods: (value) =>
                value.length === 0 ? 'Select at least one method' : null,
            allowedPathPrefixes: (value, values) => {
                if (values.pathMode !== 'restricted') return null;
                const nonEmpty = value
                    .map((p) => p.value.trim())
                    .filter(Boolean);
                return nonEmpty.length === 0
                    ? 'Add at least one path, or allow all paths'
                    : null;
            },
        },
    });

    const config = toCreatePayload(form.values);
    const testMethod: ExternalConnectionMethod =
        form.values.allowedMethods.includes('GET') ? 'GET' : 'POST';

    // Going back may change the config, so a captured test result no longer
    // describes what would be created — drop it until the user re-tests.
    const goBackTo = (step: number) => {
        setActive(step);
        if (step < TEST_STEP) {
            setTestResult(null);
        }
    };

    const goToAuth = () => {
        const name = form.validateField('name');
        const origin = form.validateField('origin');
        if (!name.hasError && !origin.hasError) {
            setActive(1);
        }
    };

    const goToAccess = () => {
        const secret = form.validateField('secret');
        const apiKeyName = form.validateField('apiKeyName');
        if (!secret.hasError && !apiKeyName.hasError) {
            setActive(2);
        }
    };

    const goToTest = () => {
        const methods = form.validateField('allowedMethods');
        const prefixes = form.validateField('allowedPathPrefixes');
        if (!methods.hasError && !prefixes.hasError) {
            setActive(TEST_STEP);
        }
    };

    const handleCreate = async () => {
        try {
            const connection = await createConnection({
                projectUuid,
                data: config,
            });
            // Best-effort: a saved sample grounds app generation, but its
            // failure must not undo a successful create.
            if (saveSample && testResult) {
                try {
                    await saveConnectionSample({
                        projectUuid,
                        connectionUuid: connection.externalConnectionUuid,
                        label: null,
                        request: testResult.request,
                        response: testResult.response.body,
                    });
                } catch {
                    // Sample save toast is shown by the hook; connection exists.
                }
            }
            onClose();
        } catch {
            // The create hook surfaces the API error as a toast; stay on the
            // test step so the user can fix and retry.
        }
    };

    const handleStepClick = (step: number) => {
        if (step < active) goBackTo(step);
    };

    const footerProps: Pick<
        MantineModalProps,
        | 'onConfirm'
        | 'confirmLabel'
        | 'confirmLoading'
        | 'cancelLabel'
        | 'cancelDisabled'
        | 'onCancel'
    > = (() => {
        switch (active) {
            case 0:
                return {
                    onConfirm: goToAuth,
                    confirmLabel: 'Next',
                    cancelLabel: 'Cancel',
                };
            case 1:
                return {
                    onConfirm: goToAccess,
                    confirmLabel: 'Next',
                    cancelLabel: 'Back',
                    onCancel: () => goBackTo(0),
                };
            case 2:
                return {
                    onConfirm: goToTest,
                    confirmLabel: 'Next',
                    cancelLabel: 'Back',
                    onCancel: () => goBackTo(1),
                };
            default:
                return {
                    onConfirm: handleCreate,
                    confirmLabel: 'Create connection',
                    confirmLoading: isCreating || isSavingSample,
                    cancelLabel: 'Back',
                    cancelDisabled: isCreating || isSavingSample,
                    onCancel: () => goBackTo(2),
                };
        }
    })();

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Add data app connection"
            icon={IconPlugConnected}
            size="lg"
            {...footerProps}
        >
            <Stepper
                active={active}
                onStepClick={handleStepClick}
                allowNextStepsSelect={false}
                wrap={false}
                size="sm"
            >
                <Stepper.Step label="Basics">
                    <ConnectStep form={form} />
                </Stepper.Step>
                <Stepper.Step label="Auth">
                    <AuthStep form={form} />
                </Stepper.Step>
                <Stepper.Step label="Rules">
                    <AccessStep form={form} />
                </Stepper.Step>
                <Stepper.Step label="Test">
                    <WizardTestStep
                        projectUuid={projectUuid}
                        config={config}
                        method={testMethod}
                        onTestResult={setTestResult}
                        saveSample={saveSample}
                        onSaveSampleChange={setSaveSample}
                    />
                </Stepper.Step>
            </Stepper>
        </MantineModal>
    );
};
