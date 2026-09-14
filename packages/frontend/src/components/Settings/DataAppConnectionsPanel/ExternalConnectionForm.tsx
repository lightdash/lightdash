import {
    type ExternalConnectionAuthType,
    type ExternalConnectionMethod,
} from '@lightdash/common';
import {
    Divider,
    Group,
    JsonInput,
    MultiSelect,
    PasswordInput,
    Select,
    Stack,
    Switch,
    TagsInput,
    TextInput,
} from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC, useState } from 'react';
import { BuilderLinkingField } from '../../../features/externalConnections/components/BuilderLinkingField';
import { CustomHeadersField } from '../../../features/externalConnections/components/CustomHeadersField';
import { MethodsField } from '../../../features/externalConnections/components/MethodsField';
import { PathRulesField } from '../../../features/externalConnections/components/PathRulesField';
import { SUGGESTED_GOOGLE_SCOPES } from '../../../features/externalConnections/constants';
import { type CustomHeaderRow } from '../../../features/externalConnections/utils/customHeaders';
import {
    type PathMode,
    type PathPrefix,
} from '../../../features/externalConnections/utils/pathRules';
import { NumberInput } from '../../common/NumberInput';
import FormCollapseButton from '../../ProjectConnection/FormCollapseButton';
import FormSection from '../../ProjectConnection/Inputs/FormSection';

export type ExternalConnectionFormValues = {
    name: string;
    origin: string;
    instructions: string;
    type: ExternalConnectionAuthType;
    allowBrowserImages: boolean;
    allowDataAppBuilderLinking: boolean;
    secret: string;
    apiKeyName: string;
    apiKeyLocation: 'header' | 'query';
    oauthScopes: string[];
    oauthTokenUrl: string;
    oauthClientId: string;
    oauthClientAuthMethod: 'basic' | 'body';
    customHeaders: CustomHeaderRow[];
    allowedMethods: ExternalConnectionMethod[];
    pathMode: PathMode;
    allowedPathPrefixes: PathPrefix[];
    allowedContentTypes: string[];
    responseMaxBytes: number;
    requestMaxBytes: number;
    timeoutMs: number;
    rateLimitPerMinute: number | null;
};

const CONTENT_TYPE_OPTIONS = [
    'application/json',
    'application/geo+json',
    'application/x-ndjson',
    'text/csv',
    'text/plain',
    'text/tab-separated-values',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
];

type Props = {
    form: UseFormReturnType<ExternalConnectionFormValues>;
    disabled: boolean;
    /** When editing an existing connection that already has a stored secret,
     *  the secret field is left blank with a placeholder; blank = unchanged. */
    hasSecret: boolean;
};

export const ExternalConnectionForm: FC<Props> = ({
    form,
    disabled,
    hasSecret,
}) => {
    const { type, allowedMethods } = form.values;
    const allowsPost = allowedMethods.includes('POST');
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const secretPlaceholder =
        hasSecret && type !== 'none'
            ? '•••• set (leave blank to keep current)'
            : undefined;

    return (
        <Stack gap="sm">
            <TextInput
                required
                label="Name"
                placeholder="My API"
                disabled={disabled}
                {...form.getInputProps('name')}
            />

            <TextInput
                required
                label="Origin"
                description="The remote base URL apps may call (must start with https://)"
                placeholder="https://api.example.com"
                disabled={disabled}
                {...form.getInputProps('origin')}
            />

            <Select
                label="Authentication"
                disabled={disabled}
                allowDeselect={false}
                data={[
                    { value: 'none', label: 'None' },
                    { value: 'api_key', label: 'API key' },
                    { value: 'bearer_token', label: 'Bearer token' },
                    {
                        value: 'google_service_account',
                        label: 'Google service account',
                    },
                    {
                        value: 'oauth_client_credentials',
                        label: 'OAuth 2.0 client credentials',
                    },
                ]}
                {...form.getInputProps('type')}
            />

            {(type === 'api_key' || type === 'bearer_token') && (
                <PasswordInput
                    label={type === 'api_key' ? 'API key' : 'Bearer token'}
                    placeholder={secretPlaceholder}
                    disabled={disabled}
                    {...form.getInputProps('secret')}
                />
            )}

            {type === 'oauth_client_credentials' && (
                <>
                    <TextInput
                        required
                        label="Token URL"
                        description="The OAuth server endpoint used to obtain access tokens"
                        placeholder="https://api.example.com/oauth/token"
                        disabled={disabled}
                        {...form.getInputProps('oauthTokenUrl')}
                    />
                    <TextInput
                        required
                        label="Client ID"
                        placeholder="Your OAuth client ID"
                        disabled={disabled}
                        {...form.getInputProps('oauthClientId')}
                    />
                    <PasswordInput
                        label="Client secret"
                        placeholder={secretPlaceholder}
                        disabled={disabled}
                        {...form.getInputProps('secret')}
                    />
                    <Select
                        required
                        allowDeselect={false}
                        label="Send client credentials as"
                        data={[
                            { value: 'basic', label: 'Authorization header' },
                            { value: 'body', label: 'Request body' },
                        ]}
                        disabled={disabled}
                        {...form.getInputProps('oauthClientAuthMethod')}
                    />
                    <TagsInput
                        label="OAuth scopes (optional)"
                        description="Sent as a space-separated token request parameter"
                        placeholder="Add a scope"
                        disabled={disabled}
                        {...form.getInputProps('oauthScopes')}
                    />
                </>
            )}

            {type === 'google_service_account' && (
                <>
                    <JsonInput
                        label="Service account JSON"
                        description="Paste the full service account key file"
                        placeholder={
                            secretPlaceholder ??
                            '{ "type": "service_account", ... }'
                        }
                        formatOnBlur
                        autosize
                        minRows={4}
                        disabled={disabled}
                        {...form.getInputProps('secret')}
                    />
                    <TagsInput
                        label="OAuth scopes"
                        description="e.g. https://www.googleapis.com/auth/bigquery"
                        data={SUGGESTED_GOOGLE_SCOPES}
                        disabled={disabled}
                        {...form.getInputProps('oauthScopes')}
                    />
                </>
            )}

            {type === 'api_key' && (
                <Group grow align="flex-start">
                    <TextInput
                        required
                        label="API key name"
                        placeholder="X-Api-Key"
                        disabled={disabled}
                        {...form.getInputProps('apiKeyName')}
                    />
                    <Select
                        label="API key location"
                        disabled={disabled}
                        data={[
                            { value: 'header', label: 'Header' },
                            { value: 'query', label: 'Query parameter' },
                        ]}
                        {...form.getInputProps('apiKeyLocation')}
                    />
                </Group>
            )}

            <CustomHeadersField
                label="Custom headers"
                value={form.values.customHeaders}
                onChange={(value) => form.setFieldValue('customHeaders', value)}
                error={form.errors.customHeaders}
                disabled={disabled}
            />

            <Divider label="Request policy" labelPosition="left" />

            <MethodsField
                label="Allowed methods"
                value={allowedMethods}
                onChange={(value) =>
                    form.setFieldValue('allowedMethods', value)
                }
                error={form.errors.allowedMethods}
                disabled={disabled}
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
                disabled={disabled}
            />

            <BuilderLinkingField
                value={form.values.allowDataAppBuilderLinking}
                onChange={(value) =>
                    form.setFieldValue('allowDataAppBuilderLinking', value)
                }
                disabled={disabled}
            />

            <Switch
                label="Allow public images in linked apps"
                description="Linked apps and chart types can load public images from this origin. Enable only for trusted public image or tile hosts."
                disabled={
                    disabled ||
                    (type !== 'none' && !form.values.allowBrowserImages)
                }
                {...form.getInputProps('allowBrowserImages', {
                    type: 'checkbox',
                })}
            />

            <FormSection name="advanced" isOpen={isAdvancedOpen}>
                <Stack gap="sm" mt="xs">
                    <MultiSelect
                        label="Allowed response content types"
                        disabled={disabled}
                        data={CONTENT_TYPE_OPTIONS}
                        searchable
                        {...form.getInputProps('allowedContentTypes')}
                    />

                    <Group grow align="flex-start">
                        <NumberInput
                            label="Response max bytes"
                            min={0}
                            disabled={disabled}
                            {...form.getInputProps('responseMaxBytes')}
                        />
                        {allowsPost && (
                            <NumberInput
                                label="Request max bytes"
                                min={0}
                                disabled={disabled}
                                {...form.getInputProps('requestMaxBytes')}
                            />
                        )}
                    </Group>

                    <Group grow align="flex-start">
                        <NumberInput
                            label="Timeout (ms)"
                            min={0}
                            disabled={disabled}
                            {...form.getInputProps('timeoutMs')}
                        />
                        {allowsPost && (
                            <NumberInput
                                label="Rate limit (per minute)"
                                min={0}
                                disabled={disabled}
                                {...form.getInputProps('rateLimitPerMinute')}
                            />
                        )}
                    </Group>
                </Stack>
            </FormSection>
            <FormCollapseButton
                isSectionOpen={isAdvancedOpen}
                onClick={() => setIsAdvancedOpen((open) => !open)}
            >
                Advanced settings
            </FormCollapseButton>
        </Stack>
    );
};
