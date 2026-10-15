import {
    type CreateExternalConnection,
    type ExternalConnectionAuthType,
    type ExternalConnectionConfigProposal,
    type ExternalConnectionSampleRequest,
    type ExternalFetchResponse,
} from '@lightdash/common';
import {
    Anchor,
    JsonInput,
    PasswordInput,
    SegmentedControl,
    Select,
    Stack,
    Stepper,
    Switch,
    TagsInput,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { IconPlugConnected } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type TFunction } from 'i18next';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BuilderLinkingField } from '../../../features/externalConnections/components/BuilderLinkingField';
import { CustomHeadersField } from '../../../features/externalConnections/components/CustomHeadersField';
import { ForwardUserIdentityField } from '../../../features/externalConnections/components/ForwardUserIdentityField';
import { MethodsField } from '../../../features/externalConnections/components/MethodsField';
import { PathRulesField } from '../../../features/externalConnections/components/PathRulesField';
import {
    isValidGoogleOAuthScope,
    isValidOAuthScope,
    SUGGESTED_GOOGLE_SCOPES,
    validateOAuthTokenUrl,
} from '../../../features/externalConnections/constants';
import { useCreateExternalConnection } from '../../../features/externalConnections/hooks/useCreateExternalConnection';
import { useProposeConnectionConfig } from '../../../features/externalConnections/hooks/useProposeConnectionConfig';
import { useSaveConnectionSample } from '../../../features/externalConnections/hooks/useSaveConnectionSample';
import {
    customHeaderRowsToRecord,
    validateCustomHeaderRows,
} from '../../../features/externalConnections/utils/customHeaders';
import { resolvePathPrefixes } from '../../../features/externalConnections/utils/pathRules';
import Callout from '../../common/Callout';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';
import { AutomaticSetupStep } from './AutomaticSetupStep';
import {
    ConnectionModeChooser,
    type ConnectionWizardMode,
} from './ConnectionModeChooser';
import { WizardTestStep } from './WizardTestStep';
import {
    applyProposalToWizardValues,
    getSuggestedTestPath,
    type WizardValues,
} from './wizardValues';

// Content types stay hidden in the onboarding wizard and the optional numeric
// limits fall back to server defaults. Power users tune them in the Edit form.
const DEFAULT_ALLOWED_CONTENT_TYPES = ['application/json'];
const BROWSER_IMAGE_CONTENT_TYPES = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
];

// RFC 7230 token chars — must match the backend's apiKeyName validator.
const HTTP_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

const TEST_STEP = 3;

export type ConnectionTestResult = {
    request: ExternalConnectionSampleRequest;
    response: ExternalFetchResponse;
};

const validateOrigin = (
    value: string,
    t: TFunction<'settings'>,
): string | null => {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return t('dataAppConnections.validation.invalidUrl');
    }
    if (url.protocol !== 'https:') {
        return t('dataAppConnections.validation.urlHttps');
    }
    if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
        return t('dataAppConnections.validation.baseUrlOnly');
    }
    return null;
};

const toCreatePayload = (values: WizardValues): CreateExternalConnection => ({
    name: values.name.trim(),
    origin: values.origin,
    type: values.type,
    allowBrowserImages: values.allowBrowserImages,
    allowDataAppBuilderLinking: values.allowDataAppBuilderLinking,
    forwardUserIdentity: values.forwardUserIdentity,
    secret: values.type !== 'none' ? values.secret : null,
    apiKeyName: values.type === 'api_key' ? values.apiKeyName.trim() : null,
    apiKeyLocation: values.type === 'api_key' ? values.apiKeyLocation : null,
    oauthScopes:
        values.type === 'google_service_account' ||
        values.type === 'oauth_client_credentials'
            ? values.oauthScopes
            : null,
    oauthTokenUrl:
        values.type === 'oauth_client_credentials'
            ? values.oauthTokenUrl.trim()
            : null,
    oauthClientId:
        values.type === 'oauth_client_credentials'
            ? values.oauthClientId.trim()
            : null,
    oauthClientAuthMethod:
        values.type === 'oauth_client_credentials'
            ? values.oauthClientAuthMethod
            : null,
    customHeaders: customHeaderRowsToRecord(values.customHeaders),
    allowedMethods: values.allowedMethods,
    allowedPathPrefixes: resolvePathPrefixes(
        values.pathMode,
        values.allowedPathPrefixes,
    ),
    allowedContentTypes: values.allowBrowserImages
        ? [...DEFAULT_ALLOWED_CONTENT_TYPES, ...BROWSER_IMAGE_CONTENT_TYPES]
        : DEFAULT_ALLOWED_CONTENT_TYPES,
    instructions: values.instructions.trim() || null,
});

const ConnectStep: FC<{ form: UseFormReturnType<WizardValues> }> = ({
    form,
}) => {
    const { t } = useTranslation('settings');
    return (
        <Stack gap="sm" mt="xl">
            <Text c="dimmed" fz="sm">
                {t('dataAppConnections.wizard.connect.intro')}
            </Text>
            <TextInput
                required
                label={t('dataAppConnections.fields.name')}
                placeholder={t('dataAppConnections.fields.namePlaceholder')}
                data-autofocus
                {...form.getInputProps('name')}
            />
            <TextInput
                required
                label={t('dataAppConnections.wizard.connect.baseUrl')}
                description={t(
                    'dataAppConnections.wizard.connect.baseUrlDescription',
                )}
                placeholder="https://api.example.com"
                {...form.getInputProps('origin')}
            />
        </Stack>
    );
};

const AuthStep: FC<{
    form: UseFormReturnType<WizardValues>;
    proposal: ExternalConnectionConfigProposal | null;
}> = ({ form, proposal }) => {
    const { t } = useTranslation('settings');
    const { type } = form.values;
    return (
        <Stack gap="sm" mt="xl">
            <Stack gap={4}>
                <Text fz="sm" fw={500}>
                    {t('dataAppConnections.wizard.auth.prompt')}
                </Text>
                <SegmentedControl
                    fullWidth
                    data={[
                        {
                            value: 'none',
                            label: t('dataAppConnections.authTypes.none'),
                        },
                        {
                            value: 'api_key',
                            label: t('dataAppConnections.authTypes.apiKey'),
                        },
                        {
                            value: 'bearer_token',
                            label: t(
                                'dataAppConnections.authTypes.bearerToken',
                            ),
                        },
                        {
                            value: 'google_service_account',
                            label: t('dataAppConnections.authTypes.google'),
                        },
                        {
                            value: 'oauth_client_credentials',
                            label: t('dataAppConnections.authTypes.oauth2'),
                        },
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

            {proposal?.credentialGuide && (
                <Callout
                    variant="info"
                    title={t(
                        'dataAppConnections.wizard.auth.credentialGuideTitle',
                    )}
                >
                    <Stack gap="xs" align="flex-start">
                        <MarkdownPreview
                            source={proposal.credentialGuide}
                            style={{
                                backgroundColor: 'transparent',
                                color: 'inherit',
                                fontSize: 'var(--mantine-font-size-sm)',
                            }}
                        />
                        {proposal.docsUrl && (
                            <Anchor
                                href={proposal.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                fz="sm"
                            >
                                {t(
                                    'dataAppConnections.wizard.auth.openProviderDocs',
                                )}
                            </Anchor>
                        )}
                    </Stack>
                </Callout>
            )}

            {proposal?.notes && (
                <Callout
                    variant="warning"
                    title={t('dataAppConnections.wizard.auth.doubleCheck')}
                >
                    {proposal.notes}
                </Callout>
            )}

            {(type === 'api_key' || type === 'bearer_token') && (
                <PasswordInput
                    required
                    label={
                        type === 'api_key'
                            ? t('dataAppConnections.authTypes.apiKey')
                            : t('dataAppConnections.authTypes.bearerToken')
                    }
                    placeholder={
                        type === 'api_key'
                            ? t(
                                  'dataAppConnections.wizard.auth.apiKeyPlaceholder',
                              )
                            : t(
                                  'dataAppConnections.wizard.auth.bearerTokenPlaceholder',
                              )
                    }
                    {...form.getInputProps('secret')}
                />
            )}

            {type === 'oauth_client_credentials' && (
                <>
                    <TextInput
                        required
                        label={t('dataAppConnections.fields.tokenUrl')}
                        description={t(
                            'dataAppConnections.fields.tokenUrlDescription',
                        )}
                        placeholder="https://api.example.com/oauth/token"
                        {...form.getInputProps('oauthTokenUrl')}
                    />
                    <TextInput
                        required
                        label={t('dataAppConnections.fields.clientId')}
                        placeholder={t(
                            'dataAppConnections.fields.clientIdPlaceholder',
                        )}
                        {...form.getInputProps('oauthClientId')}
                    />
                    <PasswordInput
                        required
                        label={t('dataAppConnections.fields.clientSecret')}
                        placeholder={t(
                            'dataAppConnections.fields.clientSecretPlaceholder',
                        )}
                        {...form.getInputProps('secret')}
                    />
                    <Select
                        required
                        allowDeselect={false}
                        label={t(
                            'dataAppConnections.fields.sendClientCredentialsAs',
                        )}
                        data={[
                            {
                                value: 'basic',
                                label: t(
                                    'dataAppConnections.fields.authorizationHeader',
                                ),
                            },
                            {
                                value: 'body',
                                label: t(
                                    'dataAppConnections.fields.requestBody',
                                ),
                            },
                        ]}
                        {...form.getInputProps('oauthClientAuthMethod')}
                    />
                    <TagsInput
                        label={t(
                            'dataAppConnections.fields.oauthScopesOptional',
                        )}
                        description={t(
                            'dataAppConnections.fields.oauthScopesDescription',
                        )}
                        placeholder={t('dataAppConnections.fields.addScope')}
                        {...form.getInputProps('oauthScopes')}
                    />
                </>
            )}

            {type === 'google_service_account' && (
                <>
                    <JsonInput
                        required
                        label={t(
                            'dataAppConnections.fields.serviceAccountJson',
                        )}
                        description={t(
                            'dataAppConnections.fields.serviceAccountJsonDescription',
                        )}
                        placeholder='{ "type": "service_account", ... }'
                        formatOnBlur
                        autosize
                        minRows={4}
                        {...form.getInputProps('secret')}
                    />
                    <TagsInput
                        required
                        label={t('dataAppConnections.fields.oauthScopes')}
                        description={t(
                            'dataAppConnections.fields.googleScopesDescription',
                        )}
                        data={SUGGESTED_GOOGLE_SCOPES}
                        {...form.getInputProps('oauthScopes')}
                    />
                </>
            )}

            {type === 'api_key' && (
                <>
                    <TextInput
                        required
                        label={t('dataAppConnections.fields.apiKeyName')}
                        description={t(
                            'dataAppConnections.fields.apiKeyNameDescription',
                        )}
                        placeholder="X-Api-Key"
                        {...form.getInputProps('apiKeyName')}
                    />
                    <Select
                        required
                        allowDeselect={false}
                        label={t('dataAppConnections.wizard.auth.sendKeyAs')}
                        data={[
                            {
                                value: 'header',
                                label: t(
                                    'dataAppConnections.wizard.auth.requestHeader',
                                ),
                            },
                            {
                                value: 'query',
                                label: t(
                                    'dataAppConnections.fields.queryParameter',
                                ),
                            },
                        ]}
                        {...form.getInputProps('apiKeyLocation')}
                    />
                </>
            )}

            <CustomHeadersField
                label={t('dataAppConnections.fields.customHeadersOptional')}
                value={form.values.customHeaders}
                onChange={(value) => form.setFieldValue('customHeaders', value)}
                error={form.errors.customHeaders}
            />
            <ForwardUserIdentityField
                value={form.values.forwardUserIdentity}
                onChange={(value) =>
                    form.setFieldValue('forwardUserIdentity', value)
                }
            />
        </Stack>
    );
};

const AccessStep: FC<{ form: UseFormReturnType<WizardValues> }> = ({
    form,
}) => {
    const { t } = useTranslation('settings');
    return (
        <Stack gap="lg" mt="xl">
            <MethodsField
                label={t('dataAppConnections.wizard.access.methodsLabel')}
                value={form.values.allowedMethods}
                onChange={(value) =>
                    form.setFieldValue('allowedMethods', value)
                }
                error={form.errors.allowedMethods}
            />
            <PathRulesField
                label={t('dataAppConnections.fields.pathsLabel')}
                mode={form.values.pathMode}
                onModeChange={(mode) => form.setFieldValue('pathMode', mode)}
                prefixes={form.values.allowedPathPrefixes}
                onPrefixesChange={(prefixes) =>
                    form.setFieldValue('allowedPathPrefixes', prefixes)
                }
                error={form.errors.allowedPathPrefixes}
            />
            <BuilderLinkingField
                value={form.values.allowDataAppBuilderLinking}
                onChange={(value) =>
                    form.setFieldValue('allowDataAppBuilderLinking', value)
                }
            />
            <Switch
                label={t('dataAppConnections.fields.publicImagesLabel')}
                description={t(
                    'dataAppConnections.fields.publicImagesDescription',
                )}
                disabled={
                    form.values.type !== 'none' &&
                    !form.values.allowBrowserImages
                }
                {...form.getInputProps('allowBrowserImages', {
                    type: 'checkbox',
                })}
            />
            <Textarea
                label={t('dataAppConnections.wizard.access.usageNotes')}
                description={t(
                    'dataAppConnections.wizard.access.usageNotesDescription',
                )}
                autosize
                minRows={2}
                maxRows={6}
                {...form.getInputProps('instructions')}
            />
        </Stack>
    );
};

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
};

export const AddConnectionWizard: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
}) => {
    const { t } = useTranslation('settings');
    const [mode, setMode] = useState<'choose' | ConnectionWizardMode>('choose');
    const [description, setDescription] = useState('');
    const [proposal, setProposal] =
        useState<ExternalConnectionConfigProposal | null>(null);
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
    const proposeMutation = useProposeConnectionConfig();

    const form = useForm<WizardValues>({
        initialValues: {
            name: '',
            origin: '',
            type: 'none',
            allowBrowserImages: false,
            allowDataAppBuilderLinking: false,
            forwardUserIdentity: false,
            secret: '',
            apiKeyName: '',
            apiKeyLocation: 'header',
            oauthScopes: [],
            oauthTokenUrl: '',
            oauthClientId: '',
            oauthClientAuthMethod: 'basic',
            customHeaders: [],
            allowedMethods: ['GET'],
            pathMode: 'all',
            allowedPathPrefixes: [],
            instructions: '',
        },
        validate: {
            name: (value) =>
                value.trim().length === 0
                    ? t('dataAppConnections.validation.nameRequired')
                    : null,
            origin: (value) => validateOrigin(value, t),
            secret: (value, values) => {
                if (values.type === 'none') return null;
                if (value.length === 0)
                    return t('dataAppConnections.validation.secretRequired');
                if (values.type === 'google_service_account') {
                    try {
                        JSON.parse(value);
                    } catch {
                        return t(
                            'dataAppConnections.validation.invalidServiceAccountJson',
                        );
                    }
                }
                return null;
            },
            oauthScopes: (value, values) => {
                if (
                    values.type !== 'google_service_account' &&
                    values.type !== 'oauth_client_credentials'
                )
                    return null;
                if (
                    values.type === 'google_service_account' &&
                    value.length === 0
                )
                    return t('dataAppConnections.validation.scopeRequired');
                const isValid =
                    values.type === 'google_service_account'
                        ? isValidGoogleOAuthScope
                        : isValidOAuthScope;
                const invalid = value.find((s) => !isValid(s));
                return invalid
                    ? t('dataAppConnections.validation.invalidScope', {
                          scope: invalid,
                      })
                    : null;
            },
            oauthTokenUrl: (value, values) =>
                values.type === 'oauth_client_credentials'
                    ? validateOAuthTokenUrl(value)
                    : null,
            oauthClientId: (value, values) =>
                values.type === 'oauth_client_credentials' &&
                value.trim().length === 0
                    ? t('dataAppConnections.validation.clientIdRequired')
                    : null,
            apiKeyName: (value, values) => {
                if (values.type !== 'api_key') return null;
                if (value.trim().length === 0)
                    return t(
                        'dataAppConnections.validation.apiKeyNameRequired',
                    );
                return HTTP_TOKEN.test(value.trim())
                    ? null
                    : t('dataAppConnections.validation.invalidApiKeyName');
            },
            customHeaders: validateCustomHeaderRows,
            allowedMethods: (value, values) =>
                value.length === 0 && !values.allowBrowserImages
                    ? t('dataAppConnections.validation.methodRequired')
                    : null,
            allowBrowserImages: (value, values) => {
                if (value && values.type !== 'none') {
                    return t(
                        'dataAppConnections.validation.publicImagesNoAuth',
                    );
                }
                return null;
            },
            allowedPathPrefixes: (value, values) => {
                if (values.pathMode !== 'restricted') return null;
                const nonEmpty = value
                    .map((p) => p.value.trim())
                    .filter(Boolean);
                return nonEmpty.length === 0
                    ? t('dataAppConnections.validation.pathRequired')
                    : null;
            },
        },
    });

    const config = toCreatePayload(form.values);
    const initialTestPath =
        proposal && form.values.allowedMethods.includes('GET')
            ? getSuggestedTestPath(description, form.values.origin)
            : '';

    // Going back may change the config, so a captured test result no longer
    // describes what would be created — drop it until the user re-tests.
    const goBackTo = (step: number) => {
        setActive(step);
        if (step < TEST_STEP) {
            setTestResult(null);
        }
    };

    const handleGenerate = () => {
        const trimmed = description.trim();
        if (trimmed.length === 0 || proposeMutation.isLoading) return;
        proposeMutation.mutate(
            { projectUuid, description: trimmed },
            {
                onSuccess: (result) => {
                    form.setValues(applyProposalToWizardValues(result));
                    form.clearErrors();
                    setProposal(result);
                    setTestResult(null);
                    setMode('manual');
                    // Land on Auth so the user pastes the credential first;
                    // Basics and Rules stay reviewable by stepping back.
                    setActive(1);
                },
            },
        );
    };

    const aiUnavailable =
        proposeMutation.error?.error.name === 'MissingConfigError';

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
        const oauthScopes = form.validateField('oauthScopes');
        const oauthTokenUrl = form.validateField('oauthTokenUrl');
        const oauthClientId = form.validateField('oauthClientId');
        const customHeaders = form.validateField('customHeaders');
        if (
            !secret.hasError &&
            !apiKeyName.hasError &&
            !oauthScopes.hasError &&
            !oauthTokenUrl.hasError &&
            !oauthClientId.hasError &&
            !customHeaders.hasError
        ) {
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
        if (mode === 'choose') {
            return { cancelLabel: t('actions.cancel', { ns: 'common' }) };
        }
        if (mode === 'automatic') {
            return {
                onConfirm: handleGenerate,
                confirmLabel: proposeMutation.isLoading
                    ? t('dataAppConnections.wizard.generating')
                    : t('dataAppConnections.wizard.generate'),
                confirmLoading: proposeMutation.isLoading,
                cancelLabel: t('actions.back', { ns: 'common' }),
                cancelDisabled: proposeMutation.isLoading,
                onCancel: () => setMode('choose'),
            };
        }
        switch (active) {
            case 0:
                return {
                    onConfirm: goToAuth,
                    confirmLabel: t('actions.next', { ns: 'common' }),
                    cancelLabel: t('actions.back', { ns: 'common' }),
                    onCancel: () => setMode('choose'),
                };
            case 1:
                return {
                    onConfirm: goToAccess,
                    confirmLabel: t('actions.next', { ns: 'common' }),
                    cancelLabel: t('actions.back', { ns: 'common' }),
                    onCancel: () => goBackTo(0),
                };
            case 2:
                return {
                    onConfirm: goToTest,
                    confirmLabel: t('actions.next', { ns: 'common' }),
                    cancelLabel: t('actions.back', { ns: 'common' }),
                    onCancel: () => goBackTo(1),
                };
            default:
                return {
                    onConfirm: handleCreate,
                    confirmLabel: t(
                        'dataAppConnections.wizard.createConnection',
                    ),
                    confirmLoading: isCreating || isSavingSample,
                    cancelLabel: t('actions.back', { ns: 'common' }),
                    cancelDisabled: isCreating || isSavingSample,
                    onCancel: () => goBackTo(2),
                };
        }
    })();

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('dataAppConnections.wizard.title')}
            icon={IconPlugConnected}
            size="lg"
            modalRootProps={{ closeOnClickOutside: false }}
            {...footerProps}
        >
            {mode === 'choose' && (
                <ConnectionModeChooser
                    onChoose={setMode}
                    aiUnavailable={aiUnavailable}
                />
            )}
            {mode === 'automatic' && (
                <AutomaticSetupStep
                    description={description}
                    onDescriptionChange={setDescription}
                    onSubmit={handleGenerate}
                    isLoading={proposeMutation.isLoading}
                    error={proposeMutation.error}
                    onSwitchToManual={() => setMode('manual')}
                />
            )}
            {mode === 'manual' && (
                <Stepper
                    active={active}
                    onStepClick={handleStepClick}
                    allowNextStepsSelect={false}
                    wrap={false}
                    size="sm"
                >
                    <Stepper.Step
                        label={t('dataAppConnections.wizard.steps.basics')}
                    >
                        <ConnectStep form={form} />
                    </Stepper.Step>
                    <Stepper.Step
                        label={t('dataAppConnections.wizard.steps.auth')}
                    >
                        <AuthStep form={form} proposal={proposal} />
                    </Stepper.Step>
                    <Stepper.Step
                        label={t('dataAppConnections.wizard.steps.rules')}
                    >
                        <AccessStep form={form} />
                    </Stepper.Step>
                    <Stepper.Step
                        label={t('dataAppConnections.wizard.steps.test')}
                    >
                        <WizardTestStep
                            projectUuid={projectUuid}
                            config={config}
                            allowedMethods={config.allowedMethods}
                            initialPath={initialTestPath}
                            onTestResult={setTestResult}
                            saveSample={saveSample}
                            onSaveSampleChange={setSaveSample}
                        />
                    </Stepper.Step>
                </Stepper>
            )}
        </MantineModal>
    );
};
