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
import { useTranslation } from 'react-i18next';
import { BuilderLinkingField } from '../../../features/externalConnections/components/BuilderLinkingField';
import { CustomHeadersField } from '../../../features/externalConnections/components/CustomHeadersField';
import { ForwardUserIdentityField } from '../../../features/externalConnections/components/ForwardUserIdentityField';
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
    forwardUserIdentity: boolean;
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
    const { t } = useTranslation('settings');
    const { type, allowedMethods } = form.values;
    const allowsPost = allowedMethods.includes('POST');
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const secretPlaceholder =
        hasSecret && type !== 'none'
            ? t('dataAppConnections.fields.secretPlaceholderKeep')
            : undefined;

    return (
        <Stack gap="sm">
            <TextInput
                required
                label={t('dataAppConnections.fields.name')}
                placeholder={t('dataAppConnections.fields.namePlaceholder')}
                disabled={disabled}
                {...form.getInputProps('name')}
            />

            <TextInput
                required
                label={t('dataAppConnections.fields.origin')}
                description={t('dataAppConnections.fields.originDescription')}
                placeholder="https://api.example.com"
                disabled={disabled}
                {...form.getInputProps('origin')}
            />

            <Select
                label={t('dataAppConnections.fields.authentication')}
                disabled={disabled}
                allowDeselect={false}
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
                        label: t('dataAppConnections.authTypes.bearerToken'),
                    },
                    {
                        value: 'google_service_account',
                        label: t(
                            'dataAppConnections.authTypes.googleServiceAccount',
                        ),
                    },
                    {
                        value: 'oauth_client_credentials',
                        label: t(
                            'dataAppConnections.authTypes.oauthClientCredentials',
                        ),
                    },
                ]}
                {...form.getInputProps('type')}
            />

            {(type === 'api_key' || type === 'bearer_token') && (
                <PasswordInput
                    label={
                        type === 'api_key'
                            ? t('dataAppConnections.authTypes.apiKey')
                            : t('dataAppConnections.authTypes.bearerToken')
                    }
                    placeholder={secretPlaceholder}
                    disabled={disabled}
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
                        disabled={disabled}
                        {...form.getInputProps('oauthTokenUrl')}
                    />
                    <TextInput
                        required
                        label={t('dataAppConnections.fields.clientId')}
                        placeholder={t(
                            'dataAppConnections.fields.clientIdPlaceholder',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('oauthClientId')}
                    />
                    <PasswordInput
                        label={t('dataAppConnections.fields.clientSecret')}
                        placeholder={secretPlaceholder}
                        disabled={disabled}
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
                        disabled={disabled}
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
                        disabled={disabled}
                        {...form.getInputProps('oauthScopes')}
                    />
                </>
            )}

            {type === 'google_service_account' && (
                <>
                    <JsonInput
                        label={t(
                            'dataAppConnections.fields.serviceAccountJson',
                        )}
                        description={t(
                            'dataAppConnections.fields.serviceAccountJsonDescription',
                        )}
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
                        label={t('dataAppConnections.fields.oauthScopes')}
                        description={t(
                            'dataAppConnections.fields.googleScopesDescription',
                        )}
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
                        label={t('dataAppConnections.fields.apiKeyName')}
                        placeholder="X-Api-Key"
                        disabled={disabled}
                        {...form.getInputProps('apiKeyName')}
                    />
                    <Select
                        label={t('dataAppConnections.fields.apiKeyLocation')}
                        disabled={disabled}
                        data={[
                            {
                                value: 'header',
                                label: t('dataAppConnections.fields.header'),
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
                </Group>
            )}

            <CustomHeadersField
                label={t('dataAppConnections.fields.customHeaders')}
                value={form.values.customHeaders}
                onChange={(value) => form.setFieldValue('customHeaders', value)}
                error={form.errors.customHeaders}
                disabled={disabled}
            />
            <ForwardUserIdentityField
                value={form.values.forwardUserIdentity}
                onChange={(value) =>
                    form.setFieldValue('forwardUserIdentity', value)
                }
                disabled={disabled}
            />

            <Divider
                label={t('dataAppConnections.fields.requestPolicy')}
                labelPosition="left"
            />

            <MethodsField
                label={t('dataAppConnections.fields.allowedMethods')}
                value={allowedMethods}
                onChange={(value) =>
                    form.setFieldValue('allowedMethods', value)
                }
                error={form.errors.allowedMethods}
                disabled={disabled}
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
                label={t('dataAppConnections.fields.publicImagesLabel')}
                description={t(
                    'dataAppConnections.fields.publicImagesDescription',
                )}
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
                        label={t(
                            'dataAppConnections.fields.allowedContentTypes',
                        )}
                        disabled={disabled}
                        data={CONTENT_TYPE_OPTIONS}
                        searchable
                        {...form.getInputProps('allowedContentTypes')}
                    />

                    <Group grow align="flex-start">
                        <NumberInput
                            label={t(
                                'dataAppConnections.fields.responseMaxBytes',
                            )}
                            min={0}
                            disabled={disabled}
                            {...form.getInputProps('responseMaxBytes')}
                        />
                        {allowsPost && (
                            <NumberInput
                                label={t(
                                    'dataAppConnections.fields.requestMaxBytes',
                                )}
                                min={0}
                                disabled={disabled}
                                {...form.getInputProps('requestMaxBytes')}
                            />
                        )}
                    </Group>

                    <Group grow align="flex-start">
                        <NumberInput
                            label={t('dataAppConnections.fields.timeoutMs')}
                            min={0}
                            disabled={disabled}
                            {...form.getInputProps('timeoutMs')}
                        />
                        {allowsPost && (
                            <NumberInput
                                label={t(
                                    'dataAppConnections.fields.rateLimitPerMinute',
                                )}
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
                {t('dataAppConnections.fields.advancedSettings')}
            </FormCollapseButton>
        </Stack>
    );
};
